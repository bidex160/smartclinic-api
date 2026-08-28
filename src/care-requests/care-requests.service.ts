import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Patient } from '../patients/entities/patient.entity';
import { PatientStatus } from '../patients/enums/patient-status.enum';
import { CareServiceDefinition } from '../providers/entities/care-service-definition.entity';
import { Provider } from '../providers/entities/provider.entity';
import { CurrentProviderService } from '../providers/current-provider.service';
import { ProviderCareEligibilityService } from '../providers/provider-care-eligibility.service';
import { ProviderOnboardingStatus } from '../providers/enums/provider-onboarding-status.enum';
import { User } from '../users/entities/user.entity';
import { AdminCareRequestQueryDto, AssignCareRequestDto, CareRequestListQueryDto, CreateCareRequestDto } from './dto/care-request.dto';
import { CareRequest } from './entities/care-request.entity';
import { CareRequestStatusHistory } from './entities/care-request-status-history.entity';
import { CareRequestStatus } from './enums/care-request-status.enum';
import { CareAppointment } from '../care-appointments/entities/care-appointment.entity';
import { CareAppointmentStatus } from '../care-appointments/enums/care-appointment-status.enum';
import { generateCareRequestReference, isCareRequestReferenceCollision, MAX_CARE_REQUEST_REFERENCE_ATTEMPTS } from './care-request-reference';
import { CareDeliveryMode } from '../providers/enums/care-delivery-mode.enum';

const PATIENT_CANCELLABLE = [CareRequestStatus.SUBMITTED, CareRequestStatus.MATCHING, CareRequestStatus.PROVIDER_SELECTED, CareRequestStatus.AWAITING_PROVIDER_RESPONSE, CareRequestStatus.DECLINED, CareRequestStatus.UNFULFILLABLE];
const ADMIN_ASSIGNABLE = [CareRequestStatus.SUBMITTED, CareRequestStatus.MATCHING, CareRequestStatus.PROVIDER_SELECTED, CareRequestStatus.AWAITING_PROVIDER_RESPONSE, CareRequestStatus.DECLINED, CareRequestStatus.UNFULFILLABLE];

@Injectable()
export class CareRequestsService {
  constructor(
    @InjectRepository(CareRequest) private readonly requests: Repository<CareRequest>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    private readonly eligibility: ProviderCareEligibilityService,
    private readonly currentProvider: CurrentProviderService,
  ) {}

  async create(user: User, dto: CreateCareRequestDto) {
    for (let attempt = 0; attempt < MAX_CARE_REQUEST_REFERENCE_ATTEMPTS; attempt += 1) {
      try {
        return await this.requests.manager.transaction(async (manager) => {
          const patient = await this.requirePatient(user.id, manager);
          const definition = await manager.getRepository(CareServiceDefinition).findOne({ where: { code: dto.serviceCode, isActive: true }, lock: { mode: 'pessimistic_read' } });
          if (!definition) throw new ConflictException('Selected care service is not active');
          const deliveryMode = dto.deliveryMode ?? CareDeliveryMode.IN_PERSON;
          const offering = dto.preferredProviderReference ? await this.eligibility.requireEligible({ careServiceDefinitionId: definition.id, providerReference: dto.preferredProviderReference, countryCode: dto.countryCode, stateOrRegion: dto.stateOrRegion, city: dto.city, deliveryMode }, manager) : null;
          const status = offering ? CareRequestStatus.AWAITING_PROVIDER_RESPONSE : CareRequestStatus.MATCHING;
          const repository = manager.getRepository(CareRequest);
          const request = await repository.save(repository.create({ reference: generateCareRequestReference(), userId: user.id, patientId: patient.id, careServiceDefinitionId: definition.id, preferredProviderId: offering?.providerId ?? null, preferredProviderCareServiceId: offering?.id ?? null, assignedProviderId: offering?.providerId ?? null, assignedProviderCareServiceId: offering?.id ?? null, countryCode: dto.countryCode, stateOrRegion: dto.stateOrRegion, city: dto.city, deliveryMode, notes: dto.notes ?? null, preferredDate: dto.preferredDate ?? null, preferredTime: dto.preferredTime ?? null, contactMethod: dto.contactMethod, status }));
          await this.history(manager, request.id, null, status, user.id, offering ? 'PREFERRED_PROVIDER_ROUTED' : 'MATCHING_REQUESTED', null);
          request.careServiceDefinition = definition; request.preferredProvider = offering?.provider ?? null; request.assignedProvider = offering?.provider ?? null;
          return this.map(request);
        });
      } catch (error) {
        if (isCareRequestReferenceCollision(error) && attempt + 1 < MAX_CARE_REQUEST_REFERENCE_ATTEMPTS) continue;
        throw error;
      }
    }
    throw new ConflictException('Unable to allocate a Care Request reference');
  }

  async listMine(user: User, query: CareRequestListQueryDto) {
    const patient = await this.requirePatient(user.id);
    const builder = this.readBuilder().where('request.patientId = :patientId', { patientId: patient.id });
    if (query.status) builder.andWhere('request.status = :status', { status: query.status });
    return this.page(builder, query.page, query.limit);
  }

  async getMine(user: User, reference: string) {
    const patient = await this.requirePatient(user.id);
    const request = await this.detailBuilder().where('request.reference = :reference', { reference }).andWhere('request.patientId = :patientId', { patientId: patient.id }).getOne();
    if (!request) this.notFound();
    return this.map(request);
  }

  async cancelMine(user: User, reference: string) {
    return this.requests.manager.transaction(async (manager) => {
      const patient = await this.requirePatient(user.id, manager);
      const request = await manager.getRepository(CareRequest).findOne({ where: { reference, patientId: patient.id }, lock: { mode: 'pessimistic_write' } });
      if (!request) this.notFound();
      if (!PATIENT_CANCELLABLE.includes(request.status)) throw new ConflictException(`Care Request in ${request.status} cannot be cancelled`);
      await this.transition(manager, request, CareRequestStatus.CANCELLED, user.id, 'PATIENT_CANCELLED', null);
      return this.getMapped(manager, request.id);
    });
  }

  async listForProvider(user: User, query: CareRequestListQueryDto) {
    const provider = await this.requireOperationalProvider(user);
    const builder = this.readBuilder().where('request.assignedProviderId = :providerId', { providerId: provider.id });
    if (query.status) builder.andWhere('request.status = :status', { status: query.status });
    return this.page(builder, query.page, query.limit, true);
  }

  async getForProvider(user: User, reference: string) {
    const provider = await this.requireOperationalProvider(user);
    const request = await this.detailBuilder().where('request.reference = :reference', { reference }).andWhere('request.assignedProviderId = :providerId', { providerId: provider.id }).getOne();
    if (!request) this.notFound();
    return this.map(request, true);
  }

  async providerRespond(user: User, reference: string, accept: boolean, reason: string | null) {
    const provider = await this.requireOperationalProvider(user);
    return this.requests.manager.transaction(async (manager) => {
      const request = await manager.getRepository(CareRequest).findOne({ where: { reference, assignedProviderId: provider.id }, lock: { mode: 'pessimistic_write' } });
      if (!request) this.notFound();
      if (request.status !== CareRequestStatus.AWAITING_PROVIDER_RESPONSE) throw new ConflictException(`Care Request in ${request.status} cannot receive a provider response`);
      if (accept) await this.eligibility.requireEligible({ careServiceDefinitionId: request.careServiceDefinitionId, providerId: provider.id, countryCode: request.countryCode, stateOrRegion: request.stateOrRegion, city: request.city, deliveryMode: request.deliveryMode }, manager);
      await this.transition(manager, request, accept ? CareRequestStatus.PROVIDER_ACCEPTED : CareRequestStatus.DECLINED, user.id, accept ? 'PROVIDER_ACCEPTED' : 'PROVIDER_DECLINED', reason);
      return this.getMapped(manager, request.id, true);
    });
  }

  async adminList(query: AdminCareRequestQueryDto) {
    const builder = this.readBuilder().leftJoin('request.patient', 'patient');
    if (query.status) builder.andWhere('request.status = :status', { status: query.status });
    if (query.serviceCode) builder.andWhere('definition.code = :serviceCode', { serviceCode: query.serviceCode });
    if (query.providerReference) builder.andWhere('(assignedProvider.providerReference = :providerReference OR preferredProvider.providerReference = :providerReference)', { providerReference: query.providerReference });
    if (query.countryCode) builder.andWhere('request.countryCode = :country', { country: query.countryCode });
    if (query.stateOrRegion) builder.andWhere('LOWER(request.stateOrRegion) = LOWER(:state)', { state: query.stateOrRegion });
    if (query.city) builder.andWhere('LOWER(request.city) = LOWER(:city)', { city: query.city });
    return this.page(builder, query.page, query.limit);
  }

  async adminGet(reference: string) {
    const request = await this.readBuilder().leftJoinAndSelect('request.statusHistory', 'statusHistory').where('request.reference = :reference', { reference }).orderBy('statusHistory.createdAt', 'ASC').addOrderBy('statusHistory.id', 'ASC').getOne();
    if (!request) this.notFound();
    return { ...this.map(request), statusHistory: (request.statusHistory ?? []).map((history) => ({ fromStatus: history.fromStatus, toStatus: history.toStatus, reasonCode: history.reasonCode, reasonNote: history.reasonNote, createdAt: history.createdAt })) };
  }

  async assign(reference: string, actorUserId: string, dto: AssignCareRequestDto) {
    return this.requests.manager.transaction(async (manager) => {
      const request = await this.locked(manager, reference);
      if (!ADMIN_ASSIGNABLE.includes(request.status)) throw new ConflictException(`Care Request in ${request.status} cannot be assigned`);
      const offering = await this.eligibility.requireEligible({ careServiceDefinitionId: request.careServiceDefinitionId, providerReference: dto.providerReference, countryCode: request.countryCode, stateOrRegion: request.stateOrRegion, city: request.city, deliveryMode: request.deliveryMode }, manager);
      const previousStatus = request.status; const reassignment = Boolean(request.assignedProviderId && request.assignedProviderId !== offering.providerId);
      request.assignedProviderId = offering.providerId; request.assignedProviderCareServiceId = offering.id; request.status = CareRequestStatus.AWAITING_PROVIDER_RESPONSE;
      await manager.getRepository(CareRequest).save(request);
      await this.history(manager, request.id, previousStatus, request.status, actorUserId, reassignment ? 'PROVIDER_REASSIGNED' : 'PROVIDER_ASSIGNED', dto.reason ?? null);
      return this.getMapped(manager, request.id);
    });
  }

  async markUnfulfillable(reference: string, actorUserId: string, reason: string) {
    return this.requests.manager.transaction(async (manager) => {
      const request = await this.locked(manager, reference);
      if (request.status === CareRequestStatus.UNFULFILLABLE) throw new ConflictException('Care Request is already unfulfillable');
      if (!ADMIN_ASSIGNABLE.includes(request.status)) throw new ConflictException(`Care Request in ${request.status} cannot be marked unfulfillable`);
      await this.transition(manager, request, CareRequestStatus.UNFULFILLABLE, actorUserId, 'NO_ELIGIBLE_PROVIDER', reason);
      return this.getMapped(manager, request.id);
    });
  }

  private readBuilder(manager: EntityManager = this.requests.manager) { return manager.getRepository(CareRequest).createQueryBuilder('request').innerJoinAndSelect('request.careServiceDefinition', 'definition').leftJoinAndSelect('request.preferredProvider', 'preferredProvider').leftJoinAndSelect('request.assignedProvider', 'assignedProvider'); }
  private detailBuilder(manager: EntityManager = this.requests.manager) { return this.readBuilder(manager).leftJoinAndSelect('request.appointments', 'appointment').leftJoinAndSelect('appointment.providerLocation', 'appointmentLocation'); }
  private async page(builder: ReturnType<CareRequestsService['readBuilder']>, page: number, limit: number, providerView = false) { builder.orderBy('request.createdAt', 'DESC').addOrderBy('request.reference', 'DESC').skip((page - 1) * limit).take(limit); const [rows, total] = await builder.getManyAndCount(); return { items: rows.map((row) => this.map(row, providerView)), page, limit, total, totalPages: total ? Math.ceil(total / limit) : 0 }; }
  private async requirePatient(userId: string, manager: EntityManager = this.patients.manager) { const patient = await manager.getRepository(Patient).findOne({ where: { userId }, withDeleted: true }); if (!patient || patient.deletedAt || patient.status !== PatientStatus.ACTIVE) throw new NotFoundException('Patient profile was not found'); return patient; }
  private async requireOperationalProvider(user: User) { const provider = await this.currentProvider.resolve(user); if (provider.onboardingStatus !== ProviderOnboardingStatus.APPROVED) throw new ConflictException('Provider onboarding is not approved'); return provider; }
  private async locked(manager: EntityManager, reference: string) { const request = await manager.getRepository(CareRequest).findOne({ where: { reference }, lock: { mode: 'pessimistic_write' } }); if (!request) this.notFound(); return request; }
  private async transition(manager: EntityManager, request: CareRequest, toStatus: CareRequestStatus, actorUserId: string | null, reasonCode: string, reasonNote: string | null) { const fromStatus = request.status; request.status = toStatus; await manager.getRepository(CareRequest).save(request); await this.history(manager, request.id, fromStatus, toStatus, actorUserId, reasonCode, reasonNote); }
  private async history(manager: EntityManager, careRequestId: string, fromStatus: CareRequestStatus | null, toStatus: CareRequestStatus, actorUserId: string | null, reasonCode: string, reasonNote: string | null) { const repository = manager.getRepository(CareRequestStatusHistory); await repository.save(repository.create({ careRequestId, fromStatus, toStatus, actorUserId, reasonCode, reasonNote })); }
  private async getMapped(manager: EntityManager, id: string, providerView = false) { const request = await this.readBuilder(manager).where('request.id = :id', { id }).getOneOrFail(); return this.map(request, providerView); }
  private map(request: CareRequest, providerView = false) { const provider = (value: Provider | null) => value ? { providerReference: value.providerReference, displayName: value.displayName, providerType: value.providerType, location: { city: value.city, stateOrRegion: value.stateOrRegion, countryCode: value.countryCode } } : null; const appointment = this.currentAppointment(request.appointments ?? []); return { reference: request.reference, status: request.status, service: { code: request.careServiceDefinition.code, name: request.careServiceDefinition.name }, deliveryMode: request.deliveryMode, geography: { countryCode: request.countryCode, stateOrRegion: request.stateOrRegion, city: request.city }, preferredProvider: provider(request.preferredProvider), assignedProvider: provider(request.assignedProvider), preferredDate: request.preferredDate, preferredTime: request.preferredTime, contactMethod: request.contactMethod, notes: request.notes, appointment: appointment ? { reference: appointment.reference, status: appointment.status, scheduledDate: appointment.scheduledDate, scheduledTimeFrom: appointment.scheduledTimeFrom, scheduledTimeTo: appointment.scheduledTimeTo, timezone: appointment.timezone, deliveryMode: appointment.deliveryMode, hasMeetingLink: Boolean(appointment.meetingUrl), location: appointment.providerLocation ? { reference: appointment.providerLocation.locationReference, name: appointment.providerLocation.name, addressLine1: appointment.providerLocation.addressLine1, addressLine2: appointment.providerLocation.addressLine2, city: appointment.providerLocation.city, stateOrRegion: appointment.providerLocation.state, postalCode: appointment.providerLocation.postalCode, countryCode: appointment.providerLocation.countryCode } : null } : null, createdAt: request.createdAt, updatedAt: request.updatedAt, ...(providerView ? {} : {}) }; }
  private currentAppointment(appointments: CareAppointment[]): CareAppointment | null { const ordered = [...appointments].sort((left, right) => { const active = (value: CareAppointmentStatus) => [CareAppointmentStatus.SCHEDULED, CareAppointmentStatus.CONFIRMED, CareAppointmentStatus.IN_PROGRESS].includes(value) ? 1 : 0; const activeDifference = active(right.status) - active(left.status); if (activeDifference) return activeDifference; const createdDifference = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(); return createdDifference || right.reference.localeCompare(left.reference); }); return ordered[0] ?? null; }
  private notFound(): never { throw new NotFoundException('Care Request was not found'); }
}
