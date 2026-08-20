import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Booking } from '../bookings/entities/booking.entity';
import { Patient } from '../patients/entities/patient.entity';
import { PatientStatus } from '../patients/enums/patient-status.enum';
import { ProviderAssignment } from '../providers/entities/provider-assignment.entity';
import { ProviderAssignmentStatus } from '../providers/enums/provider-assignment-status.enum';
import { User } from '../users/entities/user.entity';
import { PatientHealthCheckHistoryQueryDto } from './dto/patient-health-check-history-query.dto';
import { PatientHealthCheckHistoryItemDto, PatientHealthCheckHistoryResponseDto } from './dto/patient-health-check-history-response.dto';
import { HealthCheckEncounter } from './entities/health-check-encounter.entity';
import { HealthCheckEncounterStatus } from './enums/health-check-encounter-status.enum';

@Injectable()
export class PatientHealthCheckHistoryService {
  constructor(@InjectRepository(Booking) private readonly bookings: Repository<Booking>, @InjectRepository(Patient) private readonly patients: Repository<Patient>, @InjectRepository(HealthCheckEncounter) private readonly encounters: Repository<HealthCheckEncounter>, @InjectRepository(ProviderAssignment) private readonly assignments: Repository<ProviderAssignment>) {}

  async list(user: User, query: PatientHealthCheckHistoryQueryDto): Promise<PatientHealthCheckHistoryResponseDto> {
    const patient = await this.patients.findOne({ where: { userId: user.id }, withDeleted: true });
    if (!patient || patient.deletedAt || patient.status !== PatientStatus.ACTIVE) return this.empty(query);
    const builder = this.bookings.createQueryBuilder('booking').innerJoinAndSelect('booking.healthCheckPackage', 'package').innerJoinAndSelect('booking.fulfilmentMode', 'fulfilmentMode').where('booking.participantPatientId = :patientId', { patientId: patient.id });
    if (query.bookingStatus) builder.andWhere('booking.status = :bookingStatus', { bookingStatus: query.bookingStatus });
    if (query.encounterStatus) builder.andWhere(`EXISTS (SELECT 1 FROM health_check_encounters filtered_encounter WHERE filtered_encounter.booking_id = booking.id AND filtered_encounter.status = :encounterStatus)`, { encounterStatus: query.encounterStatus });
    builder.orderBy('booking.createdAt', 'DESC').addOrderBy('booking.bookingReference', 'DESC').skip((query.page - 1) * query.limit).take(query.limit);
    const [bookings, total] = await builder.getManyAndCount(); const bookingIds = bookings.map((booking) => booking.id);
    const encounters = bookingIds.length ? await this.encounters.find({ where: { bookingId: In(bookingIds) } }) : [];
    const assignments = bookingIds.length ? await this.assignments.find({ where: { bookingId: In(bookingIds), status: ProviderAssignmentStatus.CONFIRMED }, relations: { provider: true }, order: { createdAt: 'DESC', id: 'DESC' } }) : [];
    const encounterByBooking = new Map(encounters.map((encounter) => [encounter.bookingId, encounter])); const providerByBooking = new Map<string, string>();
    for (const assignment of assignments) if (!providerByBooking.has(assignment.bookingId)) providerByBooking.set(assignment.bookingId, assignment.provider.displayName);
    return { items: bookings.map((booking) => this.map(booking, encounterByBooking.get(booking.id) ?? null, providerByBooking.get(booking.id) ?? null)), page: query.page, limit: query.limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / query.limit) };
  }

  private map(booking: Booking, encounter: HealthCheckEncounter | null, providerDisplayName: string | null): PatientHealthCheckHistoryItemDto { return { bookingReference: booking.bookingReference, bookingStatus: booking.status, createdAt: booking.createdAt, updatedAt: booking.updatedAt, healthCheckPackage: { code: booking.healthCheckPackage.code, name: booking.healthCheckPackage.name }, fulfilmentMode: { code: booking.fulfilmentMode.code, name: booking.fulfilmentMode.name }, preferredDate: booking.preferredDate, preferredTimeFrom: booking.preferredTimeWindowStart, preferredTimeTo: booking.preferredTimeWindowEnd, preferredTimezone: booking.preferredTimezone, providerDisplayName, encounterStatus: encounter?.status ?? null, startedAt: encounter?.startedAt ?? null, completedAt: encounter?.completedAt ?? null, hasCompletedResult: encounter?.status === HealthCheckEncounterStatus.COMPLETED }; }
  private empty(query: PatientHealthCheckHistoryQueryDto): PatientHealthCheckHistoryResponseDto { return { items: [], page: query.page, limit: query.limit, total: 0, totalPages: 0 }; }
}
