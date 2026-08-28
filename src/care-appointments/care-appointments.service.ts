import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { isTimeZone } from 'class-validator';
import { CareRequestStatusHistory } from '../care-requests/entities/care-request-status-history.entity';
import { CareRequest } from '../care-requests/entities/care-request.entity';
import { CareRequestStatus } from '../care-requests/enums/care-request-status.enum';
import { Patient } from '../patients/entities/patient.entity';
import { PatientStatus } from '../patients/enums/patient-status.enum';
import { ProviderCareService } from '../providers/entities/provider-care-service.entity';
import { ProviderLocation } from '../providers/entities/provider-location.entity';
import { Provider } from '../providers/entities/provider.entity';
import { CurrentProviderService } from '../providers/current-provider.service';
import { ProviderOnboardingStatus } from '../providers/enums/provider-onboarding-status.enum';
import { ProviderStatus } from '../providers/enums/provider-status.enum';
import { User } from '../users/entities/user.entity';
import { CareAppointmentListQueryDto, ScheduleCareAppointmentDto } from './dto/care-appointment.dto';
import { CareAppointmentStatusHistory } from './entities/care-appointment-status-history.entity';
import { CareAppointment } from './entities/care-appointment.entity';
import { CareAppointmentStatus } from './enums/care-appointment-status.enum';
import { generateCareAppointmentReference, isCareAppointmentReferenceCollision, MAX_CARE_APPOINTMENT_REFERENCE_ATTEMPTS } from './care-appointment-reference';

const ACTIVE = [CareAppointmentStatus.SCHEDULED, CareAppointmentStatus.CONFIRMED, CareAppointmentStatus.IN_PROGRESS];

@Injectable()
export class CareAppointmentsService {
  constructor(@InjectRepository(CareAppointment) private readonly appointments: Repository<CareAppointment>, @InjectRepository(Patient) private readonly patients: Repository<Patient>, private readonly currentProvider: CurrentProviderService) {}

  async schedule(user: User, careRequestReference: string, dto: ScheduleCareAppointmentDto) {
    this.validateTime(dto);
    const providerContext = await this.operationalProvider(user);
    for (let attempt = 0; attempt < MAX_CARE_APPOINTMENT_REFERENCE_ATTEMPTS; attempt += 1) {
      try {
        return await this.appointments.manager.transaction(async (manager) => {
          const provider = await manager.getRepository(Provider).findOne({ where: { id: providerContext.id }, withDeleted: true, lock: { mode: 'pessimistic_write' } });
          if (!provider || provider.deletedAt || provider.status !== ProviderStatus.ACTIVE || provider.onboardingStatus !== ProviderOnboardingStatus.APPROVED) throw new ConflictException('Provider is no longer eligible to schedule care');
          const care = await manager.getRepository(CareRequest).findOne({ where: { reference: careRequestReference, assignedProviderId: provider.id }, lock: { mode: 'pessimistic_write' } });
          if (!care) throw new NotFoundException('Care Request was not found');
          if (care.status !== CareRequestStatus.PROVIDER_ACCEPTED) throw new ConflictException(`Care Request in ${care.status} cannot be scheduled`);
          if (!care.assignedProviderCareServiceId) throw new ConflictException('Care Request has no assigned provider service');
          const offering = await manager.getRepository(ProviderCareService).findOne({ where: { id: care.assignedProviderCareServiceId, providerId: provider.id, careServiceDefinitionId: care.careServiceDefinitionId, isActive: true }, relations: { definition: true }, lock: { mode: 'pessimistic_read' } });
          if (!offering || !offering.definition.isActive || !offering.supportsAppointmentRequests) throw new ConflictException('Provider service is no longer eligible for appointment requests');
          const location = dto.providerLocationReference ? await manager.getRepository(ProviderLocation).findOne({ where: { locationReference: dto.providerLocationReference, providerId: provider.id, isActive: true }, lock: { mode: 'pessimistic_read' } }) : null;
          if (dto.providerLocationReference && !location) throw new ConflictException('Provider location is not active or does not belong to this provider');
          if (await manager.getRepository(CareAppointment).exists({ where: { careRequestId: care.id, status: In(ACTIVE) } })) throw new ConflictException('Care Request already has an active appointment');
          const overlap = await manager.getRepository(CareAppointment).createQueryBuilder('appointment').where('appointment.providerId = :providerId', { providerId: provider.id }).andWhere('appointment.scheduledDate = :date', { date: dto.scheduledDate }).andWhere('appointment.status IN (:...active)', { active: ACTIVE }).andWhere('appointment.scheduledTimeFrom < :timeTo AND appointment.scheduledTimeTo > :timeFrom', { timeFrom: dto.scheduledTimeFrom, timeTo: dto.scheduledTimeTo }).getExists();
          if (overlap) throw new ConflictException('Provider already has an overlapping care appointment');
          const repository = manager.getRepository(CareAppointment);
          const appointment = await repository.save(repository.create({ reference: generateCareAppointmentReference(), careRequestId: care.id, patientId: care.patientId, providerId: provider.id, providerCareServiceId: offering.id, providerLocationId: location?.id ?? null, scheduledDate: dto.scheduledDate, scheduledTimeFrom: dto.scheduledTimeFrom, scheduledTimeTo: dto.scheduledTimeTo, timezone: dto.timezone, status: CareAppointmentStatus.SCHEDULED, notes: dto.notes ?? null }));
          await this.appointmentHistory(manager, appointment.id, null, appointment.status, user.id, 'PROVIDER_SCHEDULED', null);
          const from = care.status; care.status = CareRequestStatus.SCHEDULED; await manager.getRepository(CareRequest).save(care); await this.requestHistory(manager, care.id, from, care.status, user.id, 'CARE_APPOINTMENT_SCHEDULED', null);
          return this.getMapped(manager, appointment.id);
        });
      } catch (error) {
        if (isCareAppointmentReferenceCollision(error) && attempt + 1 < MAX_CARE_APPOINTMENT_REFERENCE_ATTEMPTS) continue;
        if (this.isConstraint(error, 'UQ_care_appointments_active_request')) throw new ConflictException('Care Request already has an active appointment');
        if (this.isConstraint(error, 'EX_care_appointments_provider_overlap')) throw new ConflictException('Provider already has an overlapping care appointment');
        throw error;
      }
    }
    throw new ConflictException('Unable to allocate a Care Appointment reference');
  }

  async listProvider(user: User, query: CareAppointmentListQueryDto) { const provider = await this.operationalProvider(user); const builder = this.readBuilder().where('appointment.providerId = :providerId', { providerId: provider.id }); if (query.status) builder.andWhere('appointment.status = :status', { status: query.status }); return this.page(builder, query); }
  async getProvider(user: User, reference: string) { const provider = await this.operationalProvider(user); const row = await this.readBuilder().where('appointment.reference = :reference AND appointment.providerId = :providerId', { reference, providerId: provider.id }).getOne(); if (!row) this.notFound(); return this.map(row); }
  start(user: User, reference: string) { return this.providerTransition(user, reference, [CareAppointmentStatus.SCHEDULED, CareAppointmentStatus.CONFIRMED], CareAppointmentStatus.IN_PROGRESS, CareRequestStatus.IN_PROGRESS, 'PROVIDER_STARTED', null); }
  complete(user: User, reference: string) { return this.providerTransition(user, reference, [CareAppointmentStatus.IN_PROGRESS], CareAppointmentStatus.COMPLETED, CareRequestStatus.COMPLETED, 'PROVIDER_COMPLETED', null); }
  cancelProvider(user: User, reference: string, reason: string) { return this.providerTransition(user, reference, [CareAppointmentStatus.SCHEDULED, CareAppointmentStatus.CONFIRMED], CareAppointmentStatus.CANCELLED, CareRequestStatus.CANCELLED, 'PROVIDER_CANCELLED', reason); }
  noShow(user: User, reference: string, reason: string | null) { return this.providerTransition(user, reference, [CareAppointmentStatus.SCHEDULED, CareAppointmentStatus.CONFIRMED], CareAppointmentStatus.NO_SHOW, CareRequestStatus.CANCELLED, 'PATIENT_NO_SHOW', reason); }

  async listMine(user: User, query: CareAppointmentListQueryDto) { const patient = await this.patient(user.id); const builder = this.readBuilder().where('appointment.patientId = :patientId', { patientId: patient.id }); if (query.status) builder.andWhere('appointment.status = :status', { status: query.status }); return this.page(builder, query); }
  async getMine(user: User, reference: string) { const patient = await this.patient(user.id); const row = await this.readBuilder().where('appointment.reference = :reference AND appointment.patientId = :patientId', { reference, patientId: patient.id }).getOne(); if (!row) this.notFound(); return this.map(row); }
  async cancelMine(user: User, reference: string, reason: string) { const patient = await this.patient(user.id); return this.transitionOwned(reference, { patientId: patient.id }, [CareAppointmentStatus.SCHEDULED, CareAppointmentStatus.CONFIRMED], CareAppointmentStatus.CANCELLED, CareRequestStatus.CANCELLED, user.id, 'PATIENT_CANCELLED_APPOINTMENT', reason); }

  private async providerTransition(user: User, reference: string, from: CareAppointmentStatus[], to: CareAppointmentStatus, requestTo: CareRequestStatus, code: string, reason: string | null) { const provider = await this.operationalProvider(user); return this.transitionOwned(reference, { providerId: provider.id }, from, to, requestTo, user.id, code, reason); }
  private async transitionOwned(reference: string, owner: { providerId?: string; patientId?: string }, allowed: CareAppointmentStatus[], to: CareAppointmentStatus, requestTo: CareRequestStatus, actor: string, code: string, reason: string | null) { return this.appointments.manager.transaction(async (manager) => { const appointment = await manager.getRepository(CareAppointment).findOne({ where: { reference, ...owner }, lock: { mode: 'pessimistic_write' } }); if (!appointment) this.notFound(); if (!allowed.includes(appointment.status)) throw new ConflictException(`Care Appointment in ${appointment.status} cannot transition to ${to}`); const care = await manager.getRepository(CareRequest).findOne({ where: { id: appointment.careRequestId }, lock: { mode: 'pessimistic_write' } }); if (!care) throw new ConflictException('Care Request is unavailable'); const expectedCareStatus = appointment.status === CareAppointmentStatus.IN_PROGRESS ? CareRequestStatus.IN_PROGRESS : CareRequestStatus.SCHEDULED; if (care.status !== expectedCareStatus) throw new ConflictException('Care Request and appointment lifecycle are no longer consistent'); const fromAppointment = appointment.status; appointment.status = to; await manager.getRepository(CareAppointment).save(appointment); await this.appointmentHistory(manager, appointment.id, fromAppointment, to, actor, code, reason); const fromRequest = care.status; care.status = requestTo; await manager.getRepository(CareRequest).save(care); await this.requestHistory(manager, care.id, fromRequest, requestTo, actor, code, reason); return this.getMapped(manager, appointment.id); }); }
  private validateTime(dto: ScheduleCareAppointmentDto) { if (!isTimeZone(dto.timezone)) throw new BadRequestException('timezone must be a valid IANA timezone'); const [year, month, day] = dto.scheduledDate.split('-').map(Number); const calendarDate = new Date(Date.UTC(year, month - 1, day)); if (calendarDate.getUTCFullYear() !== year || calendarDate.getUTCMonth() !== month - 1 || calendarDate.getUTCDate() !== day) throw new BadRequestException('scheduledDate must be a valid calendar date'); if (dto.scheduledTimeTo <= dto.scheduledTimeFrom) throw new BadRequestException('scheduledTimeTo must be after scheduledTimeFrom on the same date'); const now = new Date(); const parts = new Intl.DateTimeFormat('en-CA', { timeZone: dto.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now); const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)!.value; const localDate = `${part('year')}-${part('month')}-${part('day')}`; const localTime = `${part('hour')}:${part('minute')}`; if (dto.scheduledDate < localDate || (dto.scheduledDate === localDate && dto.scheduledTimeFrom <= localTime)) throw new BadRequestException('Care Appointment cannot be scheduled in the past'); }
  private async operationalProvider(user: User) { const provider = await this.currentProvider.resolve(user); if (provider.onboardingStatus !== ProviderOnboardingStatus.APPROVED) throw new ConflictException('Provider onboarding is not approved'); return provider; }
  private async patient(userId: string) { const patient = await this.patients.findOne({ where: { userId }, withDeleted: true }); if (!patient || patient.deletedAt || patient.status !== PatientStatus.ACTIVE) throw new NotFoundException('Patient profile was not found'); return patient; }
  private readBuilder(manager: EntityManager = this.appointments.manager) { return manager.getRepository(CareAppointment).createQueryBuilder('appointment').innerJoinAndSelect('appointment.careRequest', 'careRequest').innerJoinAndSelect('appointment.provider', 'provider').innerJoinAndSelect('appointment.providerCareService', 'offering').innerJoinAndSelect('offering.definition', 'definition').leftJoinAndSelect('appointment.providerLocation', 'location'); }
  private async page(builder: ReturnType<CareAppointmentsService['readBuilder']>, query: CareAppointmentListQueryDto) { builder.orderBy('appointment.scheduledDate', 'ASC').addOrderBy('appointment.scheduledTimeFrom', 'ASC').addOrderBy('appointment.reference', 'ASC').skip((query.page - 1) * query.limit).take(query.limit); const [rows, total] = await builder.getManyAndCount(); return { items: rows.map((row) => this.map(row)), page: query.page, limit: query.limit, total, totalPages: total ? Math.ceil(total / query.limit) : 0 }; }
  private async getMapped(manager: EntityManager, id: string) { return this.map(await this.readBuilder(manager).where('appointment.id = :id', { id }).getOneOrFail()); }
  private map(row: CareAppointment) { return { appointmentReference: row.reference, careRequestReference: row.careRequest.reference, status: row.status, service: { code: row.providerCareService.definition.code, name: row.providerCareService.definition.name }, provider: { providerReference: row.provider.providerReference, displayName: row.provider.displayName, providerType: row.provider.providerType }, providerLocation: row.providerLocation ? { locationReference: row.providerLocation.locationReference, name: row.providerLocation.name, addressLine1: row.providerLocation.addressLine1, addressLine2: row.providerLocation.addressLine2, city: row.providerLocation.city, stateOrRegion: row.providerLocation.state, postalCode: row.providerLocation.postalCode, countryCode: row.providerLocation.countryCode } : null, scheduledDate: row.scheduledDate, scheduledTimeFrom: row.scheduledTimeFrom, scheduledTimeTo: row.scheduledTimeTo, timezone: row.timezone, notes: row.notes, createdAt: row.createdAt, updatedAt: row.updatedAt }; }
  private async appointmentHistory(manager: EntityManager, id: string, from: CareAppointmentStatus | null, to: CareAppointmentStatus, actor: string | null, code: string, note: string | null) { const repo = manager.getRepository(CareAppointmentStatusHistory); await repo.save(repo.create({ careAppointmentId: id, fromStatus: from, toStatus: to, actorUserId: actor, reasonCode: code, reasonNote: note })); }
  private async requestHistory(manager: EntityManager, id: string, from: CareRequestStatus, to: CareRequestStatus, actor: string | null, code: string, note: string | null) { const repo = manager.getRepository(CareRequestStatusHistory); await repo.save(repo.create({ careRequestId: id, fromStatus: from, toStatus: to, actorUserId: actor, reasonCode: code, reasonNote: note })); }
  private isConstraint(error: unknown, name: string) { if (typeof error !== 'object' || error === null) return false; const value = error as { constraint?: string; driverError?: { constraint?: string } }; return value.constraint === name || value.driverError?.constraint === name; }
  private notFound(): never { throw new NotFoundException('Care Appointment was not found'); }
}
