import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { BookingStatus } from '../bookings/enums/booking-status.enum';
import { BookingStatusHistory } from '../bookings/entities/booking-status-history.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { CurrentProviderService } from '../providers/current-provider.service';
import { ProviderAssignment } from '../providers/entities/provider-assignment.entity';
import { ProviderAssignmentStatus } from '../providers/enums/provider-assignment-status.enum';
import { User } from '../users/entities/user.entity';
import { ProviderHealthCheckEncounterResponseDto } from './dto/provider-health-check-encounter-response.dto';
import { SaveHealthCheckMeasurementsDto } from './dto/save-health-check-measurements.dto';
import { HealthCheckEncounterHistory } from './entities/health-check-encounter-history.entity';
import { HealthCheckEncounter } from './entities/health-check-encounter.entity';
import { HealthCheckMeasurementHistory, MeasurementAuditValue } from './entities/health-check-measurement-history.entity';
import { HealthCheckMeasurement } from './entities/health-check-measurement.entity';
import { HealthCheckEncounterStatus } from './enums/health-check-encounter-status.enum';
import { HealthCheckMeasurementAction } from './enums/health-check-measurement-action.enum';
import { HEALTH_CHECK_MEASUREMENT_UNITS, HealthCheckMeasurementCode } from './enums/health-check-measurement-code.enum';
import { ReferralsService } from '../rewards/referrals.service';
import { PatientCareActionSource } from '../rewards/enums/patient-care-action-source.enum';
import { ProviderEarningsService } from '../earnings/provider-earnings.service';

interface MeasurementInput { code: HealthCheckMeasurementCode; primary: number; secondary: number | null }

@Injectable()
export class ProviderHealthCheckEncountersService {
  constructor(@InjectRepository(HealthCheckEncounter) private readonly encounters: Repository<HealthCheckEncounter>, private readonly currentProvider: CurrentProviderService, private readonly referrals: ReferralsService, private readonly earnings: ProviderEarningsService) {}

  async start(user: User, reference: string): Promise<ProviderHealthCheckEncounterResponseDto> {
    const provider = await this.currentProvider.resolve(user);
    await this.encounters.manager.transaction(async (manager) => {
      const { booking, assignment } = await this.requireConfirmedAssignment(manager, reference, provider.id, true);
      const encounterRepository = manager.getRepository(HealthCheckEncounter);
      let encounter = await encounterRepository.findOne({ where: { bookingId: booking.id }, lock: { mode: 'pessimistic_write' } });
      if (encounter) {
        if (encounter.providerId !== provider.id || encounter.providerAssignmentId !== assignment.id) this.notFound();
        if (encounter.status === HealthCheckEncounterStatus.IN_PROGRESS && booking.status === BookingStatus.IN_PROGRESS) return;
        if (encounter.status === HealthCheckEncounterStatus.COMPLETED) throw new ConflictException('Completed health check encounters cannot be restarted');
      }
      if (booking.status !== BookingStatus.SCHEDULED) throw new ConflictException(`Booking in ${booking.status} cannot start a health check encounter`);
      const now = new Date();
      if (!encounter) encounter = await encounterRepository.save(encounterRepository.create({ bookingId: booking.id, providerId: provider.id, providerAssignmentId: assignment.id, status: HealthCheckEncounterStatus.DRAFT, startedAt: null, completedAt: null }));
      const fromEncounterStatus = encounter.status;
      encounter.status = HealthCheckEncounterStatus.IN_PROGRESS; encounter.startedAt ??= now;
      await encounterRepository.save(encounter);
      await manager.getRepository(HealthCheckEncounterHistory).save({ encounterId: encounter.id, fromStatus: fromEncounterStatus, toStatus: HealthCheckEncounterStatus.IN_PROGRESS, actorUserId: user.id });
      const fromBookingStatus = booking.status; booking.status = BookingStatus.IN_PROGRESS; await manager.getRepository(Booking).save(booking);
      await manager.getRepository(BookingStatusHistory).save({ bookingId: booking.id, fromStatus: fromBookingStatus, toStatus: BookingStatus.IN_PROGRESS, actorUserId: user.id, reasonCode: 'HEALTH_CHECK_ENCOUNTER_STARTED', reasonNote: null });
    });
    return this.get(user, reference);
  }

  async get(user: User, reference: string): Promise<ProviderHealthCheckEncounterResponseDto> {
    const provider = await this.currentProvider.resolve(user);
    const encounter = await this.encounters.createQueryBuilder('encounter').innerJoinAndSelect('encounter.booking', 'booking').innerJoinAndSelect('booking.participant', 'participant').innerJoinAndSelect('booking.healthCheckPackage', 'package').innerJoinAndSelect('booking.fulfilmentMode', 'mode').leftJoinAndSelect('booking.providerLocation', 'providerLocation').leftJoinAndSelect('booking.visitAddress', 'visitAddress').innerJoinAndSelect('encounter.providerAssignment', 'assignment').leftJoinAndSelect('encounter.measurements', 'measurement').where('booking.bookingReference = :reference', { reference }).andWhere('encounter.providerId = :providerId', { providerId: provider.id }).andWhere('assignment.status = :confirmed', { confirmed: ProviderAssignmentStatus.CONFIRMED }).orderBy('measurement.code', 'ASC').getOne();
    if (!encounter) this.notFound();
    return this.toResponse(encounter);
  }

  async saveMeasurements(user: User, reference: string, dto: SaveHealthCheckMeasurementsDto): Promise<ProviderHealthCheckEncounterResponseDto> {
    const provider = await this.currentProvider.resolve(user);
    const inputs = this.measurementInputs(dto);
    await this.encounters.manager.transaction(async (manager) => {
      const encounter = await this.requireOwnedEncounter(manager, reference, provider.id);
      if (![HealthCheckEncounterStatus.DRAFT, HealthCheckEncounterStatus.IN_PROGRESS].includes(encounter.status)) throw new ConflictException('Completed or cancelled encounters cannot be edited');
      const measurementRepository = manager.getRepository(HealthCheckMeasurement); const historyRepository = manager.getRepository(HealthCheckMeasurementHistory); const now = new Date();
      for (const input of inputs) {
        let measurement = encounter.measurements.find((value) => value.code === input.code);
        const previousValue = measurement ? this.auditValue(measurement) : null;
        if (!measurement) measurement = measurementRepository.create({ encounterId: encounter.id, code: input.code });
        measurement.valueNumeric = this.numeric(input.primary); measurement.valueSecondaryNumeric = input.secondary === null ? null : this.numeric(input.secondary); measurement.unit = HEALTH_CHECK_MEASUREMENT_UNITS[input.code]; measurement.recordedAt = now; measurement.recordedByUserId = user.id;
        measurement = await measurementRepository.save(measurement);
        await historyRepository.save(historyRepository.create({ measurementId: measurement.id, action: previousValue ? HealthCheckMeasurementAction.UPDATED : HealthCheckMeasurementAction.CREATED, previousValue, newValue: this.auditValue(measurement), actorUserId: user.id }));
      }
    });
    return this.get(user, reference);
  }

  async complete(user: User, reference: string): Promise<ProviderHealthCheckEncounterResponseDto> {
    const provider = await this.currentProvider.resolve(user);
    let completedPatientId: string | null = null;
    await this.encounters.manager.transaction(async (manager) => {
      const encounter = await this.requireOwnedEncounter(manager, reference, provider.id);
      if (encounter.status !== HealthCheckEncounterStatus.IN_PROGRESS) throw new ConflictException('Only an in-progress encounter can be completed');
      const codes = new Set(encounter.measurements.map((measurement) => measurement.code));
      const missing = Object.values(HealthCheckMeasurementCode).filter((code) => !codes.has(code));
      if (missing.length) throw new ConflictException(`All six measurements are required before completion: missing ${missing.join(', ')}`);
      if (encounter.booking.status !== BookingStatus.IN_PROGRESS) throw new ConflictException('Booking is not in progress');
      const now = new Date(); encounter.status = HealthCheckEncounterStatus.COMPLETED; encounter.completedAt = now; await manager.getRepository(HealthCheckEncounter).save(encounter);
      await manager.getRepository(HealthCheckEncounterHistory).save({ encounterId: encounter.id, fromStatus: HealthCheckEncounterStatus.IN_PROGRESS, toStatus: HealthCheckEncounterStatus.COMPLETED, actorUserId: user.id });
      encounter.booking.status = BookingStatus.COMPLETED; await manager.getRepository(Booking).save(encounter.booking);
      await manager.getRepository(BookingStatusHistory).save({ bookingId: encounter.bookingId, fromStatus: BookingStatus.IN_PROGRESS, toStatus: BookingStatus.COMPLETED, actorUserId: user.id, reasonCode: 'HEALTH_CHECK_ENCOUNTER_COMPLETED', reasonNote: null });
      await this.earnings.markHealthCheckPayable(manager, encounter.bookingId, user.id);
      completedPatientId = encounter.booking.participantPatientId;
    });
    if (completedPatientId) await this.referrals.recordPatientFirstCareAction(completedPatientId, PatientCareActionSource.HEALTH_CHECK_COMPLETED, reference).catch(() => this.referrals.logQualificationFailure('encounter completion', reference));
    return this.get(user, reference);
  }

  private async requireConfirmedAssignment(manager: EntityManager, reference: string, providerId: string, lock: boolean) {
    const booking = await manager.getRepository(Booking).findOne({ where: { bookingReference: reference }, lock: lock ? { mode: 'pessimistic_write' } : undefined });
    if (!booking) this.notFound();
    const assignment = await manager.getRepository(ProviderAssignment).findOne({ where: { bookingId: booking.id, providerId, status: ProviderAssignmentStatus.CONFIRMED } });
    if (!assignment) this.notFound();
    return { booking, assignment };
  }

  private async requireOwnedEncounter(manager: EntityManager, reference: string, providerId: string): Promise<HealthCheckEncounter> {
    const booking = await manager.getRepository(Booking).findOne({ where: { bookingReference: reference } });
    if (!booking) this.notFound();
    const encounter = await manager.getRepository(HealthCheckEncounter).findOne({ where: { bookingId: booking.id, providerId }, lock: { mode: 'pessimistic_write' } });
    if (!encounter) this.notFound();
    const assignment = await manager.getRepository(ProviderAssignment).findOne({ where: { id: encounter.providerAssignmentId, bookingId: booking.id, providerId, status: ProviderAssignmentStatus.CONFIRMED } });
    if (!assignment) this.notFound();
    encounter.booking = booking; encounter.providerAssignment = assignment; encounter.measurements = await manager.getRepository(HealthCheckMeasurement).find({ where: { encounterId: encounter.id } });
    return encounter;
  }

  private measurementInputs(dto: SaveHealthCheckMeasurementsDto): MeasurementInput[] { return [
    { code: HealthCheckMeasurementCode.BLOOD_PRESSURE, primary: dto.bloodPressure.systolic, secondary: dto.bloodPressure.diastolic },
    { code: HealthCheckMeasurementCode.BLOOD_GLUCOSE, primary: dto.bloodGlucose.value, secondary: null },
    { code: HealthCheckMeasurementCode.BMI, primary: dto.bmi.value, secondary: null },
    { code: HealthCheckMeasurementCode.TEMPERATURE, primary: dto.temperature.value, secondary: null },
    { code: HealthCheckMeasurementCode.OXYGEN_SATURATION, primary: dto.oxygenSaturation.value, secondary: null },
    { code: HealthCheckMeasurementCode.PULSE, primary: dto.pulse.value, secondary: null },
  ]; }
  private numeric(value: number): string { return value.toFixed(4); }
  private auditValue(measurement: HealthCheckMeasurement): MeasurementAuditValue { return { primary: measurement.valueNumeric, secondary: measurement.valueSecondaryNumeric, unit: measurement.unit }; }
  private toResponse(encounter: HealthCheckEncounter): ProviderHealthCheckEncounterResponseDto { const booking = encounter.booking; return { bookingReference: booking.bookingReference, status: encounter.status, startedAt: encounter.startedAt, completedAt: encounter.completedAt, participant: { givenName: booking.participant.givenName, familyName: booking.participant.familyName }, healthCheckPackage: { code: booking.healthCheckPackage.code, name: booking.healthCheckPackage.name }, fulfilmentMode: { code: booking.fulfilmentMode.code, name: booking.fulfilmentMode.name }, confirmedSchedule: booking.scheduledDate ? { date: booking.scheduledDate, timeFrom: booking.scheduledTimeFrom!, timeTo: booking.scheduledTimeTo!, timezone: booking.scheduledTimezone!, providerLocationName: booking.providerLocation?.name ?? null } : null, visitAddress: booking.fulfilmentMode.code === 'HOME_VISIT' && booking.visitAddress ? { addressLine1: booking.visitAddress.addressLine1, addressLine2: booking.visitAddress.addressLine2, city: booking.visitAddress.city, stateOrRegion: booking.visitAddress.stateOrRegion, postalCode: booking.visitAddress.postalCode, countryCode: booking.visitAddress.countryCode, locationNote: booking.preferredLocationNote } : null, measurements: (encounter.measurements ?? []).map((measurement) => ({ code: measurement.code, value: Number(measurement.valueNumeric), secondaryValue: measurement.valueSecondaryNumeric === null ? null : Number(measurement.valueSecondaryNumeric), unit: measurement.unit, recordedAt: measurement.recordedAt })) }; }
  private notFound(): never { throw new NotFoundException('Health check encounter was not found for the authenticated provider'); }
}
