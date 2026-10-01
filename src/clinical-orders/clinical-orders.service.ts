import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, In, Repository } from "typeorm";
import { CareAppointment } from "../care-appointments/entities/care-appointment.entity";
import { CareAppointmentStatus } from "../care-appointments/enums/care-appointment-status.enum";
import { ClinicalRecord } from "../clinical-records/entities/clinical-record.entity";
import { generateClinicalRecordReference } from "../clinical-records/clinical-record-reference";
import { ClinicalRecordStatus } from "../clinical-records/enums/clinical-record-status.enum";
import { ClinicalRecordType } from "../clinical-records/enums/clinical-record-type.enum";
import { NotificationEntityType } from "../notifications/enums/notification-entity-type.enum";
import { NotificationType } from "../notifications/enums/notification-type.enum";
import { ProviderWebhooksService } from "../integrations/provider-webhooks.service";
import { NotificationsService } from "../notifications/notifications.service";
import { Provider } from "../providers/entities/provider.entity";
import { ProviderStatus } from "../providers/enums/provider-status.enum";
import { ProviderType } from "../providers/enums/provider-type.enum";
import { Patient } from "../patients/entities/patient.entity";
import { PatientRelationship } from "../patients/entities/patient-relationship.entity";
import { PatientRelationshipRole, PatientRelationshipStatus } from "../patients/enums/patient-relationship.enum";
import { PatientStatus } from "../patients/enums/patient-status.enum";
import { canPrescribe, CurrentProviderService } from "../providers/current-provider.service";
import { User } from "../users/entities/user.entity";
import { generateClinicalOrderReference } from "./clinical-order-reference";
import {
  CancelClinicalOrderDto,
  ClinicalOrderListQueryDto,
  CreateSimpleClinicalOrderDto,
  UpsertPrescriptionDto,
  CreateDiagnosticOrderDto,
  CreateDirectClinicalOrderDto,
  DirectClinicalOrderListQueryDto,
} from "./dto/clinical-order.dto";
import { ClinicalOrderOrigin, ClinicalOrderPatientResponse } from "./enums/clinical-order-origin.enum";
import { ClinicalOrderStatusHistory } from "./entities/clinical-order-status-history.entity";
import { ClinicalOrder } from "./entities/clinical-order.entity";
import { ClinicalDiagnosticOrderItem } from "./entities/clinical-diagnostic-order-item.entity";
import { ClinicalPrescriptionDetail } from "./entities/clinical-prescription-detail.entity";
import { ClinicalPrescriptionItem } from "./entities/clinical-prescription-item.entity";
import { ClinicalOrderStatus } from "./enums/clinical-order-status.enum";
import { ClinicalOrderType } from "./enums/clinical-order-type.enum";
import { ClinicalOrderFulfillmentsService } from "./clinical-order-fulfillments.service";
@Injectable()
export class ClinicalOrdersService {
  constructor(
    @InjectRepository(ClinicalOrder)
    private readonly orders: Repository<ClinicalOrder>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    private readonly currentProvider: CurrentProviderService,
    private readonly fulfillments?: ClinicalOrderFulfillmentsService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly webhooks?: ProviderWebhooksService,
  ) {}
  async createPrescription(
    user: User,
    appointmentReference: string,
    dto: UpsertPrescriptionDto,
  ) {
    const provider = await this.currentProvider.resolveOperational(user);
    return this.orders.manager.transaction(async (m) => {
      const context = await this.context(
        m,
        appointmentReference,
        provider.id,
        true,
      );
      if (context.appointment.status !== CareAppointmentStatus.IN_PROGRESS)
        throw new ConflictException(
          "Prescriptions may only be drafted during an appointment in progress",
        );
      const repo = m.getRepository(ClinicalOrder);
      const order = await repo.save(
        repo.create({
          reference: generateClinicalOrderReference(),
          patientId: context.appointment.patientId,
          orderingProviderId: provider.id,
          orderingUserId: user.id,
          careRequestId: context.appointment.careRequestId,
          careAppointmentId: context.appointment.id,
          clinicalRecordId: context.record.id,
          type: ClinicalOrderType.PRESCRIPTION,
          status: ClinicalOrderStatus.DRAFT,
          clinicalNote: dto.clinicalNote ?? null,
          issuedAt: null,
          cancelledAt: null,
          cancelledByUserId: null,
          cancellationReason: null,
        }),
      );
      const detail = await m
        .getRepository(ClinicalPrescriptionDetail)
        .save({ clinicalOrderId: order.id, notes: dto.notes ?? null });
      await this.replaceItems(m, detail.id, dto.items);
      await this.history(
        m,
        order.id,
        null,
        order.status,
        user.id,
        "PRESCRIPTION_DRAFT_CREATED",
      );
      return this.mapped(m, order.id);
    });
  }
  async createDiagnostic(
    user: User,
    appointmentReference: string,
    dto: CreateDiagnosticOrderDto,
  ) {
    const provider = await this.currentProvider.resolveOperational(user);
    if (
      ![ClinicalOrderType.LABORATORY, ClinicalOrderType.IMAGING].includes(
        dto.type,
      )
    )
      throw new ConflictException(
        "Diagnostic orders must be laboratory or imaging",
      );
    return this.orders.manager.transaction(async (m) => {
      const context = await this.context(
        m,
        appointmentReference,
        provider.id,
        true,
      );
      if (context.appointment.status !== CareAppointmentStatus.IN_PROGRESS)
        throw new ConflictException(
          "Diagnostic orders may only be issued during an appointment in progress",
        );
      const repo = m.getRepository(ClinicalOrder);
      const order = await repo.save(
        repo.create({
          reference: generateClinicalOrderReference(),
          patientId: context.appointment.patientId,
          orderingProviderId: provider.id,
          orderingUserId: user.id,
          careRequestId: context.appointment.careRequestId,
          careAppointmentId: context.appointment.id,
          clinicalRecordId: context.record.id,
          type: dto.type,
          status: ClinicalOrderStatus.ISSUED,
          clinicalNote: dto.clinicalNote ?? null,
          issuedAt: new Date(),
          cancelledAt: null,
          cancelledByUserId: null,
          cancellationReason: null,
        }),
      );
      await m
        .getRepository(ClinicalDiagnosticOrderItem)
        .save(
          dto.items.map((i, index) => ({
            clinicalOrderId: order.id,
            name: i.name,
            code: i.code ?? null,
            instructions: i.instructions ?? null,
            resultText: null,
            resultValue: null,
            resultUnit: null,
            referenceRange: null,
            resultFlag: null,
            resultedAt: null,
            sortOrder: index,
          })),
        );
      await this.history(
        m,
        order.id,
        null,
        order.status,
        user.id,
        "DIAGNOSTIC_ORDER_ISSUED",
      );
      return this.mapped(m, order.id);
    });
  }
  async createSimple(
    user: User,
    appointmentReference: string,
    dto: CreateSimpleClinicalOrderDto,
  ) {
    const provider = await this.currentProvider.resolveOperational(user);
    if (dto.type === ClinicalOrderType.PRESCRIPTION)
      throw new ConflictException(
        "Use the prescription workflow for prescriptions",
      );
    return this.orders.manager.transaction(async (m) => {
      const context = await this.context(
        m,
        appointmentReference,
        provider.id,
        true,
      );
      if (context.appointment.status !== CareAppointmentStatus.IN_PROGRESS)
        throw new ConflictException(
          "Clinical orders may only be issued during an appointment in progress",
        );
      const repo = m.getRepository(ClinicalOrder);
      const order = await repo.save(
        repo.create({
          reference: generateClinicalOrderReference(),
          patientId: context.appointment.patientId,
          orderingProviderId: provider.id,
          orderingUserId: user.id,
          careRequestId: context.appointment.careRequestId,
          careAppointmentId: context.appointment.id,
          clinicalRecordId: context.record.id,
          type: dto.type,
          status: ClinicalOrderStatus.ISSUED,
          clinicalNote: dto.clinicalNote,
          issuedAt: new Date(),
          cancelledAt: null,
          cancelledByUserId: null,
          cancellationReason: null,
        }),
      );
      await this.history(
        m,
        order.id,
        null,
        order.status,
        user.id,
        "CLINICAL_ORDER_ISSUED",
      );
      return this.mapped(m, order.id);
    });
  }
  async update(user: User, reference: string, dto: UpsertPrescriptionDto) {
    const provider = await this.currentProvider.resolveOperational(user);
    return this.orders.manager.transaction(async (m) => {
      const order = await this.lockOwned(m, reference, provider.id);
      if (order.status !== ClinicalOrderStatus.DRAFT || !order.careAppointmentId)
        throw new ConflictException(
          "Issued or cancelled Clinical Orders are immutable",
        );
      const appointment = await m
        .getRepository(CareAppointment)
        .findOne({
          where: { id: order.careAppointmentId },
          lock: { mode: "pessimistic_read" },
        });
      if (appointment?.status !== CareAppointmentStatus.IN_PROGRESS)
        throw new ConflictException("Prescription can no longer be edited");
      order.clinicalNote = dto.clinicalNote ?? null;
      await m.getRepository(ClinicalOrder).save(order);
      const detail = await m
        .getRepository(ClinicalPrescriptionDetail)
        .findOneOrFail({ where: { clinicalOrderId: order.id } });
      detail.notes = dto.notes ?? null;
      await m.getRepository(ClinicalPrescriptionDetail).save(detail);
      await this.replaceItems(m, detail.id, dto.items);
      return this.mapped(m, order.id);
    });
  }
  async issue(user: User, reference: string) {
    const provider = await this.currentProvider.resolveOperational(user);
    return this.orders.manager.transaction(async (m) => {
      const order = await this.lockOwned(m, reference, provider.id);
      if (order.status === ClinicalOrderStatus.ISSUED)
        return this.mapped(m, order.id);
      if (order.status !== ClinicalOrderStatus.DRAFT || !order.careAppointmentId)
        throw new ConflictException("Clinical Order cannot be issued");
      const appointment = await m
        .getRepository(CareAppointment)
        .findOne({
          where: { id: order.careAppointmentId },
          lock: { mode: "pessimistic_read" },
        });
      if (appointment?.status !== CareAppointmentStatus.IN_PROGRESS)
        throw new ConflictException(
          "Prescription may only be issued during an appointment in progress",
        );
      const detail = await m
        .getRepository(ClinicalPrescriptionDetail)
        .findOne({ where: { clinicalOrderId: order.id } });
      if (
        !detail ||
        (await m
          .getRepository(ClinicalPrescriptionItem)
          .count({ where: { prescriptionDetailId: detail.id } })) < 1
      )
        throw new ConflictException(
          "Prescription must contain at least one item",
        );
      order.status = ClinicalOrderStatus.ISSUED;
      order.issuedAt = new Date();
      await m.getRepository(ClinicalOrder).save(order);
      await this.history(
        m,
        order.id,
        ClinicalOrderStatus.DRAFT,
        order.status,
        user.id,
        "PRESCRIPTION_ISSUED",
      );
      return this.mapped(m, order.id);
    });
  }
  async cancel(user: User, reference: string, dto: CancelClinicalOrderDto) {
    const provider = await this.currentProvider.resolveOperational(user);
    return this.orders.manager.transaction(async (m) => {
      const order = await this.lockOwned(m, reference, provider.id);
      if (order.status === ClinicalOrderStatus.CANCELLED)
        return this.mapped(m, order.id);
      const from = order.status;
      order.status = ClinicalOrderStatus.CANCELLED;
      order.cancelledAt = new Date();
      order.cancelledByUserId = user.id;
      order.cancellationReason = dto.reason ?? null;
      await m.getRepository(ClinicalOrder).save(order);
      await this.fulfillments?.cancelOpenForOrder(
        m,
        order.id,
        user.id,
        dto.reason ?? null,
      );
      await this.history(
        m,
        order.id,
        from,
        order.status,
        user.id,
        "ORDER_CANCELLED",
        dto.reason ?? null,
      );
      return this.mapped(m, order.id);
    });
  }
  async listProvider(
    user: User,
    appointmentReference: string,
    q: ClinicalOrderListQueryDto,
  ) {
    const provider = await this.currentProvider.resolveOperational(user);
    const b = this.readBuilder()
      .where("order.orderingProviderId=:providerId", {
        providerId: provider.id,
      })
      .andWhere("appointment.reference=:appointmentReference", {
        appointmentReference,
      });
    return this.page(b, q);
  }
  async getProvider(user: User, reference: string) {
    const provider = await this.currentProvider.resolveOperational(user);
    const row = await this.readBuilder()
      .where("order.reference=:reference", { reference })
      .andWhere("order.orderingProviderId=:providerId", {
        providerId: provider.id,
      })
      .getOne();
    if (!row) this.notFound();
    return this.map(row);
  }
  async listMine(user: User, q: ClinicalOrderListQueryDto) {
    const patient = await this.patient(user.id);
    const patientIds = await this.accessiblePatientIds(user.id, patient.id);
    const b = this.readBuilder()
      .where(patientIds.length > 1 ? "order.patientId IN (:...patientIds)" : "order.patientId=:patientId", patientIds.length > 1 ? { patientIds } : { patientId: patient.id })
      .andWhere(
        `(order.status='ISSUED' OR (order.status='CANCELLED' AND order.issuedAt IS NOT NULL))`,
      );
    return this.page(b, q, true);
  }
  async getMine(user: User, reference: string) {
    const patient = await this.patient(user.id);
    const patientIds = await this.accessiblePatientIds(user.id, patient.id);
    const b = this.readBuilder()
      .where("order.reference=:reference", { reference })
      .andWhere(patientIds.length > 1 ? "order.patientId IN (:...patientIds)" : "order.patientId=:patientId", patientIds.length > 1 ? { patientIds } : { patientId: patient.id })
      .andWhere(
        `(order.status='ISSUED' OR (order.status='CANCELLED' AND order.issuedAt IS NOT NULL))`,
      );
    const row = await b.getOne();
    if (!row) this.notFound();
    const summaries = await this.fulfillments?.summaries([row.id]);
    return this.map(row, summaries?.get(row.id) ?? null);
  }
  private async accessiblePatientIds(userId: string, selfPatientId: string): Promise<string[]> {
    const relationships = await this.orders.manager
      .getRepository(PatientRelationship)
      .find({
        where: { relatedUserId: userId, role: PatientRelationshipRole.GUARDIAN, status: PatientRelationshipStatus.ACTIVE },
        relations: { patient: true },
      });
    return [...new Set([selfPatientId, ...relationships
      .filter(row => !row.endedAt && row.patient && !row.patient.deletedAt && row.patient.status === PatientStatus.ACTIVE)
      .map(row => row.patientId)])];
  }
  /**
   * Confirms who a SmartClinic ID belongs to before a provider sends a
   * request. Returns only a first name and initial, never health details.
   */
  async lookupDirectPatient(user: User, patientReference: string) {
    const provider = await this.directSender(user);
    const patient = await this.directPatient(this.orders.manager, patientReference);
    return { patientReference: patient.patientReference, displayName: shortName(patient) };
  }

  /**
   * Sends a prescription or test request to a patient by SmartClinic ID,
   * without a SmartClinic appointment. The patient approves it by choosing a
   * pharmacy or lab, or declines it.
   */
  async createDirect(user: User, dto: CreateDirectClinicalOrderDto) {
    const provider = await this.directSender(user);
    const isPrescription = dto.type === ClinicalOrderType.PRESCRIPTION;
    const isReferral = dto.type === ClinicalOrderType.REFERRAL;
    if (isReferral ? !dto.clinicalNote?.trim() : isPrescription ? !dto.prescriptionItems?.length : !dto.diagnosticItems?.length)
      throw new ConflictException(isReferral ? "Say why you are referring and to which specialty" : isPrescription ? "Add at least one medicine" : "Add at least one test");
    return this.orders.manager.transaction(async (m) => {
      const patient = await this.directPatient(m, dto.patientReference);
      const now = new Date();
      const clinicalNote = dto.clinicalNote?.trim() || null;
      const record = await m.getRepository(ClinicalRecord).save(
        m.getRepository(ClinicalRecord).create({
          reference: generateClinicalRecordReference(),
          patientId: patient.id,
          providerId: provider.id,
          careRequestId: null,
          careAppointmentId: null,
          careServiceDefinitionId: null,
          recordType: isPrescription
            ? ClinicalRecordType.PHARMACY
            : isReferral ? ClinicalRecordType.OTHER
            : dto.type === ClinicalOrderType.IMAGING ? ClinicalRecordType.IMAGING_RESULT : ClinicalRecordType.LAB_RESULT,
          documentationTemplateSnapshot: null,
          structuredData: null,
          title: `${DIRECT_ORDER_LABEL[dto.type]} from ${provider.displayName}`.slice(0, 200),
          summary: clinicalNote,
          status: ClinicalRecordStatus.FINALIZED,
          occurredAt: now,
          finalizedAt: now,
          createdByUserId: user.id,
        }),
      );
      const repo = m.getRepository(ClinicalOrder);
      const order = await repo.save(
        repo.create({
          reference: generateClinicalOrderReference(),
          patientId: patient.id,
          orderingProviderId: provider.id,
          orderingUserId: user.id,
          careRequestId: null,
          careAppointmentId: null,
          clinicalRecordId: record.id,
          origin: ClinicalOrderOrigin.DIRECT,
          patientResponse: ClinicalOrderPatientResponse.PENDING,
          patientRespondedAt: null,
          type: dto.type,
          status: ClinicalOrderStatus.ISSUED,
          clinicalNote,
          issuedAt: now,
          cancelledAt: null,
          cancelledByUserId: null,
          cancellationReason: null,
        }),
      );
      if (isPrescription) {
        const detail = await m
          .getRepository(ClinicalPrescriptionDetail)
          .save({ clinicalOrderId: order.id, notes: null });
        await this.replaceItems(m, detail.id, dto.prescriptionItems ?? []);
      } else if (!isReferral) {
        await m.getRepository(ClinicalDiagnosticOrderItem).save(
          (dto.diagnosticItems ?? []).map((i, index) => ({
            clinicalOrderId: order.id,
            name: i.name,
            code: i.code ?? null,
            instructions: i.instructions ?? null,
            resultText: null,
            resultValue: null,
            resultUnit: null,
            referenceRange: null,
            resultFlag: null,
            resultedAt: null,
            sortOrder: index,
          })),
        );
      }
      await this.history(m, order.id, null, order.status, user.id, "DIRECT_ORDER_SENT");
      for (const userId of await this.patientRecipients(m, patient)) {
        await this.notifications?.createTransactionalNotification(m, {
          userId,
          type: NotificationType.CLINICAL_ORDER_RECEIVED,
          // Titles reach lock screens: name the sender, never the medicines or tests.
          title: `New ${DIRECT_ORDER_LABEL[dto.type].toLowerCase()} from ${provider.displayName}`.slice(0, 200),
          message: "Review it, then choose where to get it done.",
          entityType: NotificationEntityType.CLINICAL_ORDER,
          entityReference: order.reference,
          idempotencyKey: `clinical-order:${order.reference}:received:${userId}`,
          email: { enabled: true },
        });
      }
      return this.mapped(m, order.id);
    });
  }

  /** Requests this provider has sent by SmartClinic ID, newest first. */
  async listDirect(user: User, q: DirectClinicalOrderListQueryDto) {
    const provider = await this.currentProvider.resolveOperational(user);
    const b = this.readBuilder()
      .where("order.orderingProviderId=:providerId", { providerId: provider.id })
      .andWhere("order.origin=:origin", { origin: ClinicalOrderOrigin.DIRECT });
    return this.page(b, { ...q, type: undefined, careAppointmentReference: undefined }, true);
  }

  /** The patient (or their guardian) approves or declines a directly sent request. */
  async respondMine(user: User, reference: string, response: ClinicalOrderPatientResponse.APPROVED | ClinicalOrderPatientResponse.DECLINED) {
    const patient = await this.patient(user.id);
    const patientIds = await this.accessiblePatientIds(user.id, patient.id);
    let answered: ClinicalOrder | null = null;
    const result = await this.orders.manager.transaction(async (m) => {
      const order = await m.getRepository(ClinicalOrder).findOne({ where: { reference }, lock: { mode: "pessimistic_write" } });
      if (!order || !patientIds.includes(order.patientId) || order.origin !== ClinicalOrderOrigin.DIRECT) this.notFound();
      if (order.patientResponse === response) return this.mapped(m, order.id);
      if (order.status !== ClinicalOrderStatus.ISSUED || order.patientResponse !== ClinicalOrderPatientResponse.PENDING)
        throw new ConflictException("This request has already been answered");
      order.patientResponse = response;
      order.patientRespondedAt = new Date();
      if (response === ClinicalOrderPatientResponse.DECLINED) {
        order.status = ClinicalOrderStatus.CANCELLED;
        order.cancelledAt = order.patientRespondedAt;
        order.cancelledByUserId = user.id;
        order.cancellationReason = "Declined by patient";
      }
      await m.getRepository(ClinicalOrder).save(order);
      if (response === ClinicalOrderPatientResponse.DECLINED) {
        await this.fulfillments?.cancelOpenForOrder(m, order.id, user.id, "Declined by patient");
        await this.history(m, order.id, ClinicalOrderStatus.ISSUED, order.status, user.id, "PATIENT_DECLINED");
      } else {
        await this.history(m, order.id, order.status, order.status, user.id, "PATIENT_APPROVED");
      }
      answered = order;
      return this.mapped(m, order.id);
    });
    const done = answered as ClinicalOrder | null;
    if (done)
      this.webhooks?.notify(done.orderingProviderId, "request.patient_responded", {
        requestReference: done.reference,
        patientResponse: done.patientResponse,
        status: done.status,
      });
    return result;
  }

  /** The facility, when this person may send requests: its owner or one of its doctors. */
  private async directSender(user: User): Promise<Provider> {
    const actor = await this.currentProvider.resolveOperationalActor(user);
    if (!canPrescribe(actor)) throw new ForbiddenException("Only doctors can send prescriptions and test requests");
    this.requireDirectSender(actor.provider);
    return actor.provider;
  }

  private requireDirectSender(provider: Provider) {
    if (provider.status !== ProviderStatus.ACTIVE)
      throw new ForbiddenException("Active approved provider access is required");
    if (!DIRECT_SENDER_TYPES.has(provider.providerType))
      throw new ForbiddenException("Only clinicians and care facilities can send prescriptions and test requests");
  }

  private async directPatient(m: EntityManager, patientReference: string) {
    const patient = await m.getRepository(Patient).findOne({ where: { patientReference } });
    if (!patient || patient.deletedAt || patient.status !== PatientStatus.ACTIVE)
      throw new NotFoundException("No SmartClinic patient has this ID. Check it with the patient.");
    return patient;
  }

  /** The patient's own account plus active guardians, for dependants without one. */
  private async patientRecipients(m: EntityManager, patient: Patient): Promise<string[]> {
    const guardians = await m.getRepository(PatientRelationship).find({
      where: { patientId: patient.id, role: PatientRelationshipRole.GUARDIAN, status: PatientRelationshipStatus.ACTIVE },
    });
    return [...new Set([patient.userId, ...guardians.filter((row) => !row.endedAt).map((row) => row.relatedUserId)].filter((id): id is string => !!id))];
  }

  async requireNoDraftOrders(manager: EntityManager, appointmentId: string) {
    if (
      await manager
        .getRepository(ClinicalOrder)
        .exists({
          where: {
            careAppointmentId: appointmentId,
            status: ClinicalOrderStatus.DRAFT,
          },
        })
    )
      throw new ConflictException(
        "Draft Clinical Orders must be issued or cancelled before appointment completion",
      );
  }
  private async context(
    m: EntityManager,
    reference: string,
    providerId: string,
    write = false,
  ) {
    const appointment = await m
      .getRepository(CareAppointment)
      .findOne({
        where: { reference, providerId },
        relations: { careRequest: true },
        lock: {
          mode: write ? "pessimistic_write" : "pessimistic_read",
          tables: ["care_appointments"],
        },
      });
    if (
      !appointment ||
      appointment.careRequest.assignedProviderId !== providerId
    )
      throw new NotFoundException("Care Appointment was not found");
    const record = await m
      .getRepository(ClinicalRecord)
      .findOne({ where: { careAppointmentId: appointment.id, providerId } });
    if (
      !record ||
      record.patientId !== appointment.patientId ||
      record.careRequestId !== appointment.careRequestId
    )
      throw new ConflictException(
        "Authoritative Clinical Record is required for this encounter",
      );
    return { appointment, record };
  }
  private async lockOwned(
    m: EntityManager,
    reference: string,
    providerId: string,
  ) {
    const row = await m
      .getRepository(ClinicalOrder)
      .findOne({
        where: { reference, orderingProviderId: providerId },
        lock: { mode: "pessimistic_write" },
      });
    if (!row) this.notFound();
    return row;
  }
  private async replaceItems(
    m: EntityManager,
    detailId: string,
    items: UpsertPrescriptionDto["items"],
  ) {
    const repo = m.getRepository(ClinicalPrescriptionItem);
    await repo.delete({ prescriptionDetailId: detailId });
    await repo.save(
      items.map((i, index) =>
        repo.create({
          prescriptionDetailId: detailId,
          medicationName: i.medicationName,
          strength: i.strength ?? null,
          dosage: i.dosage,
          frequency: i.frequency,
          duration: i.duration ?? null,
          quantity: i.quantity ?? null,
          route: i.route ?? null,
          instructions: i.instructions ?? null,
          sortOrder: index,
        }),
      ),
    );
  }
  private readBuilder(m: EntityManager = this.orders.manager) {
    return m
      .getRepository(ClinicalOrder)
      .createQueryBuilder("order")
      .innerJoinAndSelect("order.patient", "patient")
      .innerJoinAndSelect("order.orderingProvider", "provider")
      .leftJoinAndSelect("order.careAppointment", "appointment")
      .leftJoinAndSelect("order.careRequest", "careRequest")
      .leftJoinAndSelect("order.clinicalRecord", "clinicalRecord")
      .leftJoinAndSelect("order.prescription", "prescription")
      .leftJoinAndSelect("prescription.items", "items")
      .leftJoinAndMapMany(
        "order.diagnosticItems",
        ClinicalDiagnosticOrderItem,
        "diagnosticItem",
        "diagnosticItem.clinicalOrderId=order.id",
      );
  }
  private async mapped(m: EntityManager, id: string) {
    const row = await this.readBuilder(m)
      .where("order.id=:id", { id })
      .orderBy("items.sortOrder", "ASC")
      .getOneOrFail();
    return this.map(row);
  }
  private map(o: ClinicalOrder, fulfillment: unknown = undefined) {
    return {
      reference: o.reference,
      patient: o.patient ? { patientReference: o.patient.patientReference, displayName: `${o.patient.givenName} ${o.patient.familyName}`.trim() } : undefined,
      type: o.type,
      status: o.status,
      clinicalNote: o.clinicalNote,
      orderingProvider: {
        providerReference: o.orderingProvider.providerReference,
        displayName: o.orderingProvider.displayName,
        providerType: o.orderingProvider.providerType,
      },
      origin: o.origin ?? ClinicalOrderOrigin.APPOINTMENT,
      patientResponse: o.patientResponse ?? null,
      patientRespondedAt: o.patientRespondedAt ?? null,
      careRequestReference: o.careRequest?.reference ?? null,
      careAppointmentReference: o.careAppointment?.reference ?? null,
      clinicalRecordReference: o.clinicalRecord?.reference ?? undefined,
      issuedAt: o.issuedAt,
      cancelledAt: o.cancelledAt,
      cancellationReason: o.cancellationReason,
      diagnosticItems: [...((o as any).diagnosticItems ?? [])]
        .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
        .map((i: any) => ({
          name: i.name,
          code: i.code,
          instructions: i.instructions,
          resultText: i.resultText,
          resultValue: i.resultValue,
          resultUnit: i.resultUnit,
          referenceRange: i.referenceRange,
          resultFlag: i.resultFlag,
          resultedAt: i.resultedAt,
          sortOrder: i.sortOrder,
        })),
      prescription:
        o.type === ClinicalOrderType.PRESCRIPTION && o.prescription
          ? {
              notes: o.prescription.notes,
              items: [...(o.prescription.items ?? [])]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((i) => ({
                  medicationName: i.medicationName,
                  strength: i.strength,
                  dosage: i.dosage,
                  frequency: i.frequency,
                  duration: i.duration,
                  quantity: i.quantity,
                  route: i.route,
                  instructions: i.instructions,
                  sortOrder: i.sortOrder,
                })),
            }
          : null,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      ...(fulfillment !== undefined ? { fulfillment } : {}),
    };
  }
  private async page(
    b: ReturnType<ClinicalOrdersService["readBuilder"]>,
    q: ClinicalOrderListQueryDto,
    includeFulfillment = false,
  ) {
    if (q.type) b.andWhere("order.type=:type", { type: q.type });
    if (q.careAppointmentReference)
      b.andWhere("appointment.reference=:careAppointmentReference", {
        careAppointmentReference: q.careAppointmentReference,
      });
    b.orderBy("order.createdAt", "DESC")
      .addOrderBy("order.reference", "DESC")
      .skip((q.page - 1) * q.limit)
      .take(q.limit);
    const [rows, total] = await b.getManyAndCount();
    let summaries = new Map<string, unknown>();
    if (includeFulfillment && this.fulfillments && rows.length) {
      try {
        summaries = await this.fulfillments.summaries(rows.map((r) => r.id));
      } catch {
        summaries = new Map<string, unknown>();
      }
    }
    return {
      items: rows.map((r) =>
        this.map(
          r,
          includeFulfillment ? (summaries.get(r.id) ?? null) : undefined,
        ),
      ),
      page: q.page,
      limit: q.limit,
      total,
      totalPages: total ? Math.ceil(total / q.limit) : 0,
    };
  }
  private async patient(userId: string) {
    const p = await this.patients.findOne({
      where: { userId },
      withDeleted: true,
    });
    if (!p || p.deletedAt || p.status !== PatientStatus.ACTIVE)
      throw new NotFoundException("Patient profile was not found");
    return p;
  }
  private async history(
    m: EntityManager,
    id: string,
    from: ClinicalOrderStatus | null,
    to: ClinicalOrderStatus,
    actor: string,
    code: string,
    note: string | null = null,
  ) {
    await m
      .getRepository(ClinicalOrderStatusHistory)
      .save({
        clinicalOrderId: id,
        fromStatus: from,
        toStatus: to,
        actorUserId: actor,
        reasonCode: code,
        reasonNote: note,
      });
  }
  private notFound(): never {
    throw new NotFoundException("Clinical Order was not found");
  }
}

const DIRECT_SENDER_TYPES = new Set<ProviderType>([ProviderType.INDIVIDUAL, ProviderType.CLINIC, ProviderType.HOSPITAL, ProviderType.OTHER]);

const DIRECT_ORDER_LABEL: Record<CreateDirectClinicalOrderDto["type"], string> = {
  [ClinicalOrderType.PRESCRIPTION]: "Prescription",
  [ClinicalOrderType.LABORATORY]: "Lab test request",
  [ClinicalOrderType.IMAGING]: "Imaging request",
  [ClinicalOrderType.REFERRAL]: "Referral",
};

/** "Adaeze O." — enough for a clinician to confirm the right person. */
function shortName(patient: Patient): string {
  const initial = patient.familyName?.trim().charAt(0);
  return `${patient.givenName.trim()}${initial ? ` ${initial.toUpperCase()}.` : ""}`;
}
