import { assertCareDelivery } from '../providers/care-delivery-policy';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { Patient } from "../patients/entities/patient.entity";
import { PatientStatus } from "../patients/enums/patient-status.enum";
import { CareServiceDefinition } from "../providers/entities/care-service-definition.entity";
import { Provider } from "../providers/entities/provider.entity";
import { CurrentProviderService } from "../providers/current-provider.service";
import {
  ProviderCareEligibilityInput,
  ProviderCareEligibilityService,
} from "../providers/provider-care-eligibility.service";
import { User } from "../users/entities/user.entity";
import {
  AdminCareRequestQueryDto,
  AssignCareRequestDto,
  CareRequestListQueryDto,
  CreateCareRequestDto,
} from "./dto/care-request.dto";
import { CareRequest } from "./entities/care-request.entity";
import { CareRequestStatusHistory } from "./entities/care-request-status-history.entity";
import { CareRequestStatus } from "./enums/care-request-status.enum";
import { CareAppointment } from "../care-appointments/entities/care-appointment.entity";
import { CareAppointmentStatus } from "../care-appointments/enums/care-appointment-status.enum";
import {
  generateCareRequestReference,
  isCareRequestReferenceCollision,
  MAX_CARE_REQUEST_REFERENCE_ATTEMPTS,
} from "./care-request-reference";
import { CareDeliveryMode } from "../providers/enums/care-delivery-mode.enum";
import { CareRequestFunding } from "./entities/care-request-funding.entity";
import { CareRequestFundingStatus } from "./enums/care-request-funding-status.enum";
import { PatientAccessService } from "../patients/patient-access.service";
import { NotificationActionType } from "../notifications/enums/notification-action-type.enum";
import { NotificationEntityType } from "../notifications/enums/notification-entity-type.enum";
import { NotificationType } from "../notifications/enums/notification-type.enum";
import { NotificationsService } from "../notifications/notifications.service";

const PATIENT_CANCELLABLE = [
  CareRequestStatus.SUBMITTED,
  CareRequestStatus.MATCHING,
  CareRequestStatus.PROVIDER_SELECTED,
  CareRequestStatus.AWAITING_PROVIDER_RESPONSE,
  CareRequestStatus.DECLINED,
  CareRequestStatus.UNFULFILLABLE,
];
const ADMIN_ASSIGNABLE = [
  CareRequestStatus.SUBMITTED,
  CareRequestStatus.MATCHING,
  CareRequestStatus.PROVIDER_SELECTED,
  CareRequestStatus.AWAITING_PROVIDER_RESPONSE,
  CareRequestStatus.DECLINED,
  CareRequestStatus.UNFULFILLABLE,
];

@Injectable()
export class CareRequestsService {
  constructor(
    @InjectRepository(CareRequest)
    private readonly requests: Repository<CareRequest>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    private readonly eligibility: ProviderCareEligibilityService,
    private readonly currentProvider: CurrentProviderService,
    private readonly patientAccess: PatientAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(user: User, dto: CreateCareRequestDto) {
    const requestedPatient = dto.participantPatientReference
      ? await this.patientAccess.resolveAccessiblePatient(
          user.id,
          dto.participantPatientReference,
        )
      : null;
    for (
      let attempt = 0;
      attempt < MAX_CARE_REQUEST_REFERENCE_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await this.requests.manager.transaction(async (manager) => {
          const patient =
            requestedPatient ?? (await this.requirePatient(user.id, manager));
          const definition = await manager
            .getRepository(CareServiceDefinition)
            .findOne({
              where: { code: dto.serviceCode, isActive: true },
              lock: { mode: "pessimistic_read" },
            });
          if (!definition)
            throw new ConflictException("Selected care service is not active");
          const deliveryMode = dto.deliveryMode ?? CareDeliveryMode.IN_PERSON;
          assertCareDelivery(definition, deliveryMode);
          this.validateGeography(deliveryMode, dto);
          const geography =
            deliveryMode === CareDeliveryMode.VIRTUAL
              ? { countryCode: null, stateOrRegion: null, city: null }
              : {
                  countryCode: dto.countryCode!,
                  stateOrRegion: dto.stateOrRegion!,
                  city: dto.city!,
                };
          const eligibilityInput: ProviderCareEligibilityInput = {
            careServiceDefinitionId: definition.id,
            deliveryMode,
            ...geography,
          };

          const offering = dto.preferredProviderReference
            ? await this.eligibility.requireEligible(
                {
                  ...eligibilityInput,
                  providerReference: dto.preferredProviderReference,
                },
                manager,
              )
            : await this.eligibility.findEligibleCareProvider(
                eligibilityInput,
                manager,
              );
          const patientSelectedProvider =
            !!dto.preferredProviderReference && !!offering;
          const status = offering
            ? CareRequestStatus.AWAITING_PROVIDER_RESPONSE
            : CareRequestStatus.MATCHING;
          const repository = manager.getRepository(CareRequest);
          const request = await repository.save(
            repository.create({
              reference: generateCareRequestReference(),
              userId: user.id,
              patientId: patient.id,
              careServiceDefinitionId: definition.id,
              preferredProviderId: patientSelectedProvider
                ? offering.providerId
                : null,

              preferredProviderCareServiceId: patientSelectedProvider
                ? offering.id
                : null,

              assignedProviderId: offering?.providerId ?? null,

              assignedProviderCareServiceId: offering?.id ?? null,
              ...geography,
              deliveryMode,
              servicePriceMinor:
                offering?.selectedDeliveryOption.priceMinor ?? null,
              serviceCurrency:
                offering?.selectedDeliveryOption.currency ?? null,
              notes: dto.notes ?? null,
              preferredDate: dto.preferredDate ?? null,
              preferredTime: dto.preferredTime ?? null,
              contactMethod: dto.contactMethod,
              status,
            }),
          );
          const reasonCode = dto.preferredProviderReference
            ? "PREFERRED_PROVIDER_ROUTED"
            : offering
              ? "PROVIDER_AUTO_MATCHED"
              : "MATCHING_REQUESTED";
          const statusHistory = await this.history(
            manager,
            request.id,
            null,
            status,
            user.id,
            reasonCode,
            null,
          );
          if (offering) {
            await this.notifications.createForProviderTransactional(manager, offering.providerId, {
              type: NotificationType.CARE_REQUEST_ASSIGNED,
              title: "New care request",
              message: `A patient has requested ${definition.name}.`,
              entityType: NotificationEntityType.CARE_REQUEST,
              entityReference: request.reference,
              actionType: NotificationActionType.VIEW,
              metadata: { serviceName: definition.name, requestStatus: request.status },
              idempotencyKey: `care-request:${request.reference}:assigned:${offering.providerId}:${statusHistory.id}`,
              email: { enabled: true },
            });
          }
          request.patient = patient;
          request.careServiceDefinition = definition;
          request.preferredProvider = patientSelectedProvider
            ? offering.provider
            : null;

          request.assignedProvider = offering?.provider ?? null;
          return this.map(request);
        });
      } catch (error) {
        if (
          isCareRequestReferenceCollision(error) &&
          attempt + 1 < MAX_CARE_REQUEST_REFERENCE_ATTEMPTS
        )
          continue;
        throw error;
      }
    }
    throw new ConflictException("Unable to allocate a Care Request reference");
  }

  async listMine(user: User, query: CareRequestListQueryDto) {
    const builder = this.readBuilder().where("request.userId = :userId", {
      userId: user.id,
    });
    if (query.status)
      builder.andWhere("request.status = :status", { status: query.status });
    return this.page(builder, query.page, query.limit);
  }

  async getMine(user: User, reference: string) {
    const request = await this.detailBuilder()
      .where("request.reference = :reference", { reference })
      .andWhere("request.userId = :userId", { userId: user.id })
      .getOne();
    if (!request) this.notFound();
    return this.map(request);
  }

  async cancelMine(user: User, reference: string) {
    return this.requests.manager.transaction(async (manager) => {
      const request = await manager.getRepository(CareRequest).findOne({
        where: { reference, userId: user.id },
        lock: { mode: "pessimistic_write" },
      });
      if (!request) this.notFound();
      if (!PATIENT_CANCELLABLE.includes(request.status))
        throw new ConflictException(
          `Care Request in ${request.status} cannot be cancelled`,
        );
      await this.transition(
        manager,
        request,
        CareRequestStatus.CANCELLED,
        user.id,
        "PATIENT_CANCELLED",
        null,
      );
      await this.notifications.createForProviderTransactional(manager, request.assignedProviderId, {
        type: NotificationType.CARE_REQUEST_CANCELLED,
        title: "Care request cancelled",
        message: "A care request assigned to you was cancelled.",
        entityType: NotificationEntityType.CARE_REQUEST,
        entityReference: request.reference,
        actionType: NotificationActionType.VIEW,
        metadata: { requestStatus: request.status },
        idempotencyKey: `care-request:${request.reference}:cancelled:${request.assignedProviderId ?? "unassigned"}`,
        email: { enabled: false },
      });
      return this.getMapped(manager, request.id);
    });
  }

  async listForProvider(user: User, query: CareRequestListQueryDto) {
    const provider = await this.requireOperationalProvider(user);
    const builder = this.readBuilder().where(
      "request.assignedProviderId = :providerId",
      { providerId: provider.id },
    );
    if (query.status)
      builder.andWhere("request.status = :status", { status: query.status });
    return this.page(builder, query.page, query.limit, true);
  }

  async getForProvider(user: User, reference: string) {
    const provider = await this.requireOperationalProvider(user);
    const request = await this.detailBuilder()
      .where("request.reference = :reference", { reference })
      .andWhere("request.assignedProviderId = :providerId", {
        providerId: provider.id,
      })
      .getOne();
    if (!request) this.notFound();
    return this.map(request, true);
  }

  async providerRespond(
    user: User,
    reference: string,
    accept: boolean,
    reason: string | null,
  ) {
    const provider = await this.requireOperationalProvider(user);
    return this.requests.manager.transaction(async (manager) => {
      const request = await manager.getRepository(CareRequest).findOne({
        where: { reference, assignedProviderId: provider.id },
        lock: { mode: "pessimistic_write" },
      });
      if (!request) this.notFound();
      if (request.status !== CareRequestStatus.AWAITING_PROVIDER_RESPONSE)
        throw new ConflictException(
          `Care Request in ${request.status} cannot receive a provider response`,
        );
      if (accept) {
        await this.eligibility.requireEligible(
          {
            careServiceDefinitionId: request.careServiceDefinitionId,
            providerId: provider.id,
            countryCode: request.countryCode,
            stateOrRegion: request.stateOrRegion,
            city: request.city,
            deliveryMode: request.deliveryMode,
          },
          manager,
        );
        if (
          request.servicePriceMinor == null ||
          request.serviceCurrency == null
        )
          throw new ConflictException(
            "Care Request has no committed service price",
          );
      }
      await this.transition(
        manager,
        request,
        accept
          ? CareRequestStatus.PROVIDER_ACCEPTED
          : CareRequestStatus.DECLINED,
        user.id,
        accept ? "PROVIDER_ACCEPTED" : "PROVIDER_DECLINED",
        reason,
      );
      await this.notifications.createTransactionalNotification(manager, {
        userId: request.userId,
        type: accept ? NotificationType.CARE_REQUEST_ACCEPTED : NotificationType.CARE_REQUEST_DECLINED,
        title: accept ? "Care request accepted" : "Care request declined",
        message: accept ? "Your care request has been accepted." : "The assigned provider declined your care request.",
        entityType: NotificationEntityType.CARE_REQUEST,
        entityReference: request.reference,
        actionType: NotificationActionType.VIEW,
        metadata: { requestStatus: request.status },
        idempotencyKey: `care-request:${request.reference}:${accept ? "accepted" : "declined"}`,
        email: { enabled: true },
      });
      if (
        accept &&
        request.servicePriceMinor === "0" &&
        request.serviceCurrency &&
        !(await manager
          .getRepository(CareRequestFunding)
          .findOne({ where: { careRequestId: request.id } }))
      )
        await manager.getRepository(CareRequestFunding).save({
          careRequestId: request.id,
          amountMinor: "0",
          currency: request.serviceCurrency,
          status: CareRequestFundingStatus.SATISFIED_FREE,
          paidAt: null,
        });
      return this.getMapped(manager, request.id, true);
    });
  }

  async adminList(query: AdminCareRequestQueryDto) {
    const builder = this.readBuilder();
    if (query.status)
      builder.andWhere("request.status = :status", { status: query.status });
    if (query.serviceCode)
      builder.andWhere("definition.code = :serviceCode", {
        serviceCode: query.serviceCode,
      });
    if (query.providerReference)
      builder.andWhere(
        "(assignedProvider.providerReference = :providerReference OR preferredProvider.providerReference = :providerReference)",
        { providerReference: query.providerReference },
      );
    if (query.countryCode)
      builder.andWhere("request.countryCode = :country", {
        country: query.countryCode,
      });
    if (query.stateOrRegion)
      builder.andWhere("LOWER(request.stateOrRegion) = LOWER(:state)", {
        state: query.stateOrRegion,
      });
    if (query.city)
      builder.andWhere("LOWER(request.city) = LOWER(:city)", {
        city: query.city,
      });
    return this.page(builder, query.page, query.limit);
  }

  async adminGet(reference: string) {
    const request = await this.readBuilder()
      .leftJoinAndSelect("request.statusHistory", "statusHistory")
      .where("request.reference = :reference", { reference })
      .orderBy("statusHistory.createdAt", "ASC")
      .addOrderBy("statusHistory.id", "ASC")
      .getOne();
    if (!request) this.notFound();
    return {
      ...this.map(request),
      statusHistory: (request.statusHistory ?? []).map((history) => ({
        fromStatus: history.fromStatus,
        toStatus: history.toStatus,
        reasonCode: history.reasonCode,
        reasonNote: history.reasonNote,
        createdAt: history.createdAt,
      })),
    };
  }

  async assign(
    reference: string,
    actorUserId: string,
    dto: AssignCareRequestDto,
  ) {
    return this.requests.manager.transaction(async (manager) => {
      const request = await this.locked(manager, reference);
      if (!ADMIN_ASSIGNABLE.includes(request.status))
        throw new ConflictException(
          `Care Request in ${request.status} cannot be assigned`,
        );
      const offering = await this.eligibility.requireEligible(
        {
          careServiceDefinitionId: request.careServiceDefinitionId,
          providerReference: dto.providerReference,
          countryCode: request.countryCode,
          stateOrRegion: request.stateOrRegion,
          city: request.city,
          deliveryMode: request.deliveryMode,
        },
        manager,
      );
      const previousStatus = request.status;
      const previousProviderId = request.assignedProviderId;
      const reassignment = Boolean(
        request.assignedProviderId &&
        request.assignedProviderId !== offering.providerId,
      );
      request.assignedProviderId = offering.providerId;
      request.assignedProviderCareServiceId = offering.id;
      request.servicePriceMinor = offering.selectedDeliveryOption.priceMinor;
      request.serviceCurrency = offering.selectedDeliveryOption.currency;
      request.status = CareRequestStatus.AWAITING_PROVIDER_RESPONSE;
      await manager.getRepository(CareRequest).save(request);
      const statusHistory = await this.history(
        manager,
        request.id,
        previousStatus,
        request.status,
        actorUserId,
        reassignment ? "PROVIDER_REASSIGNED" : "PROVIDER_ASSIGNED",
        dto.reason ?? null,
      );
      await this.notifications.createForProviderTransactional(manager, offering.providerId, {
        type: reassignment ? NotificationType.CARE_REQUEST_REASSIGNED : NotificationType.CARE_REQUEST_ASSIGNED,
        title: reassignment ? "Care request reassigned to you" : "New care request",
        message: reassignment ? "A care request has been reassigned to you." : "A patient has requested a service you offer.",
        entityType: NotificationEntityType.CARE_REQUEST,
        entityReference: request.reference,
        actionType: NotificationActionType.VIEW,
        metadata: { requestStatus: request.status },
        idempotencyKey: `care-request:${request.reference}:${reassignment ? "reassigned-new" : "admin-assigned"}:${offering.providerId}:${statusHistory.id}`,
        email: { enabled: true },
      });
      if (reassignment) {
        await this.notifications.createTransactionalNotification(manager, {
          userId: request.userId,
          type: NotificationType.CARE_REQUEST_REASSIGNED,
          title: "Care request reassigned",
          message: "Your care request has been assigned to a different provider.",
          entityType: NotificationEntityType.CARE_REQUEST,
          entityReference: request.reference,
          actionType: NotificationActionType.VIEW,
          metadata: { requestStatus: request.status },
          idempotencyKey: `care-request:${request.reference}:reassigned-patient:${statusHistory.id}`,
          email: { enabled: true },
        });
        await this.notifications.createForProviderTransactional(manager, previousProviderId, {
          type: NotificationType.CARE_REQUEST_REASSIGNED,
          title: "Care request reassigned",
          message: "A care request is no longer assigned to you.",
          entityType: NotificationEntityType.CARE_REQUEST,
          entityReference: request.reference,
          actionType: NotificationActionType.VIEW,
          metadata: { requestStatus: request.status },
          idempotencyKey: `care-request:${request.reference}:reassigned-old:${previousProviderId}:${statusHistory.id}`,
          email: { enabled: false },
        });
      }
      return this.getMapped(manager, request.id);
    });
  }

  async markUnfulfillable(
    reference: string,
    actorUserId: string,
    reason: string,
  ) {
    return this.requests.manager.transaction(async (manager) => {
      const request = await this.locked(manager, reference);
      if (request.status === CareRequestStatus.UNFULFILLABLE)
        throw new ConflictException("Care Request is already unfulfillable");
      if (!ADMIN_ASSIGNABLE.includes(request.status))
        throw new ConflictException(
          `Care Request in ${request.status} cannot be marked unfulfillable`,
        );
      await this.transition(
        manager,
        request,
        CareRequestStatus.UNFULFILLABLE,
        actorUserId,
        "NO_ELIGIBLE_PROVIDER",
        reason,
      );
      return this.getMapped(manager, request.id);
    });
  }

  private readBuilder(manager: EntityManager = this.requests.manager) {
    return manager
      .getRepository(CareRequest)
      .createQueryBuilder("request")
      .innerJoinAndSelect("request.patient", "patient")
      .innerJoinAndSelect("request.careServiceDefinition", "definition")
      .leftJoinAndSelect("request.preferredProvider", "preferredProvider")
      .leftJoinAndSelect("request.assignedProvider", "assignedProvider");
  }
  private detailBuilder(manager: EntityManager = this.requests.manager) {
    return this.readBuilder(manager)
      .leftJoinAndSelect("request.appointments", "appointment")
      .leftJoinAndSelect("appointment.providerLocation", "appointmentLocation")
      .leftJoinAndSelect("request.funding", "funding");
  }
  private async page(
    builder: ReturnType<CareRequestsService["readBuilder"]>,
    page: number,
    limit: number,
    providerView = false,
  ) {
    builder
      .orderBy("request.createdAt", "DESC")
      .addOrderBy("request.reference", "DESC")
      .skip((page - 1) * limit)
      .take(limit);
    const [rows, total] = await builder.getManyAndCount();
    return {
      items: rows.map((row) => this.map(row, providerView)),
      page,
      limit,
      total,
      totalPages: total ? Math.ceil(total / limit) : 0,
    };
  }
  private async requirePatient(
    userId: string,
    manager: EntityManager = this.patients.manager,
  ) {
    const patient = await manager
      .getRepository(Patient)
      .findOne({ where: { userId }, withDeleted: true });
    if (
      !patient ||
      patient.deletedAt ||
      patient.status !== PatientStatus.ACTIVE
    )
      throw new NotFoundException("Patient profile was not found");
    return patient;
  }
  private requireOperationalProvider(user: User) {
    return this.currentProvider.resolveOperational(user);
  }
  private validateGeography(
    deliveryMode: CareDeliveryMode,
    dto: Pick<CreateCareRequestDto, "countryCode" | "stateOrRegion" | "city">,
  ) {
    if (
      deliveryMode !== CareDeliveryMode.VIRTUAL &&
      (!dto.countryCode || !dto.stateOrRegion || !dto.city)
    )
      throw new BadRequestException(
        "countryCode, stateOrRegion, and city are required for physical care requests",
      );
  }
  private async locked(manager: EntityManager, reference: string) {
    const request = await manager
      .getRepository(CareRequest)
      .findOne({ where: { reference }, lock: { mode: "pessimistic_write" } });
    if (!request) this.notFound();
    return request;
  }
  private async transition(
    manager: EntityManager,
    request: CareRequest,
    toStatus: CareRequestStatus,
    actorUserId: string | null,
    reasonCode: string,
    reasonNote: string | null,
  ) {
    const fromStatus = request.status;
    request.status = toStatus;
    await manager.getRepository(CareRequest).save(request);
    await this.history(
      manager,
      request.id,
      fromStatus,
      toStatus,
      actorUserId,
      reasonCode,
      reasonNote,
    );
  }
  private async history(
    manager: EntityManager,
    careRequestId: string,
    fromStatus: CareRequestStatus | null,
    toStatus: CareRequestStatus,
    actorUserId: string | null,
    reasonCode: string,
    reasonNote: string | null,
  ) {
    const repository = manager.getRepository(CareRequestStatusHistory);
    return repository.save(
      repository.create({
        careRequestId,
        fromStatus,
        toStatus,
        actorUserId,
        reasonCode,
        reasonNote,
      }),
    );
  }
  private async getMapped(
    manager: EntityManager,
    id: string,
    providerView = false,
  ) {
    const request = await this.readBuilder(manager)
      .where("request.id = :id", { id })
      .getOneOrFail();
    return this.map(request, providerView);
  }
  private map(request: CareRequest, providerView = false) {
    const provider = (value: Provider | null) =>
      value
        ? {
            providerReference: value.providerReference,
            displayName: value.displayName,
            providerType: value.providerType,
            location: {
              city: value.city,
              stateOrRegion: value.stateOrRegion,
              countryCode: value.countryCode,
            },
          }
        : null;
    const appointment = this.currentAppointment(request.appointments ?? []);
    return {
      reference: request.reference,
      status: request.status,
      participant: {
        patientReference: request.patient.patientReference,
        firstName: request.patient.givenName,
        lastName: request.patient.familyName,
        displayName:
          `${request.patient.givenName} ${request.patient.familyName}`.trim(),
      },
      service: {
        code: request.careServiceDefinition.code,
        name: request.careServiceDefinition.name,
        price:
          request.servicePriceMinor == null
            ? null
            : {
                priceMinor: Number(request.servicePriceMinor),
                currency: request.serviceCurrency,
              },
      },
      deliveryMode: request.deliveryMode,
      geography:
        request.countryCode && request.stateOrRegion && request.city
          ? {
              countryCode: request.countryCode,
              stateOrRegion: request.stateOrRegion,
              city: request.city,
            }
          : null,
      preferredProvider: provider(request.preferredProvider),
      assignedProvider: provider(request.assignedProvider),
      preferredDate: request.preferredDate,
      preferredTime: request.preferredTime,
      contactMethod: request.contactMethod,
      notes: request.notes,
      funding: request.funding
        ? {
            status: request.funding.status,
            satisfied:
              request.funding.status !== CareRequestFundingStatus.PENDING,
          }
        : null,
      appointment: appointment
        ? {
            reference: appointment.reference,
            status: appointment.status,
            scheduledDate: appointment.scheduledDate,
            scheduledTimeFrom: appointment.scheduledTimeFrom,
            scheduledTimeTo: appointment.scheduledTimeTo,
            timezone: appointment.timezone,
            deliveryMode: appointment.deliveryMode,
            hasMeetingLink: Boolean(appointment.meetingUrl),
            location: appointment.providerLocation
              ? {
                  reference: appointment.providerLocation.locationReference,
                  name: appointment.providerLocation.name,
                  addressLine1: appointment.providerLocation.addressLine1,
                  addressLine2: appointment.providerLocation.addressLine2,
                  city: appointment.providerLocation.city,
                  stateOrRegion: appointment.providerLocation.state,
                  postalCode: appointment.providerLocation.postalCode,
                  countryCode: appointment.providerLocation.countryCode,
                }
              : null,
          }
        : null,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      ...(providerView ? {} : {}),
    };
  }
  private currentAppointment(
    appointments: CareAppointment[],
  ): CareAppointment | null {
    const ordered = [...appointments].sort((left, right) => {
      const active = (value: CareAppointmentStatus) =>
        [
          CareAppointmentStatus.SCHEDULED,
          CareAppointmentStatus.CONFIRMED,
          CareAppointmentStatus.IN_PROGRESS,
        ].includes(value)
          ? 1
          : 0;
      const activeDifference = active(right.status) - active(left.status);
      if (activeDifference) return activeDifference;
      const createdDifference =
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime();
      return createdDifference || right.reference.localeCompare(left.reference);
    });
    return ordered[0] ?? null;
  }
  private notFound(): never {
    throw new NotFoundException("Care Request was not found");
  }
}
