import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, In, Repository } from "typeorm";
import { Patient } from "../patients/entities/patient.entity";
import { PatientStatus } from "../patients/enums/patient-status.enum";
import { ProviderServiceUnit } from "../provider-service-units/entities/provider-service-unit.entity";
import { ProviderServiceUnitStatus } from "../provider-service-units/enums/provider-service-unit-status.enum";
import { ProviderServiceUnitType } from "../provider-service-units/enums/provider-service-unit-type.enum";
import { CurrentProviderService } from "../providers/current-provider.service";
import { Provider } from "../providers/entities/provider.entity";
import { ProviderOnboardingStatus } from "../providers/enums/provider-onboarding-status.enum";
import { ProviderStatus } from "../providers/enums/provider-status.enum";
import { User } from "../users/entities/user.entity";
import { generateClinicalOrderFulfillmentReference } from "./clinical-order-fulfillment-reference";
import {
  FulfillmentDirectoryQueryDto,
  FulfillmentListQueryDto,
} from "./dto/clinical-order-fulfillment.dto";
import { ClinicalOrderFulfillmentHistory } from "./entities/clinical-order-fulfillment-history.entity";
import { ClinicalOrderFulfillment } from "./entities/clinical-order-fulfillment.entity";
import { ClinicalOrder } from "./entities/clinical-order.entity";
import { ClinicalOrderFulfillmentStatus } from "./enums/clinical-order-fulfillment-status.enum";
import { ClinicalOrderStatus } from "./enums/clinical-order-status.enum";
import { ClinicalOrderType } from "./enums/clinical-order-type.enum";
import { PharmacyFulfillmentFunding } from "./entities/pharmacy-fulfillment-funding.entity";
import { PharmacyDispensing } from "./entities/pharmacy-dispensing.entity";
import {
  PharmacyDispensingStatus,
  PharmacyFundingStatus,
} from "./enums/pharmacy-quote-status.enum";

const OPEN = [
  ClinicalOrderFulfillmentStatus.PROPOSED,
  ClinicalOrderFulfillmentStatus.SELECTED,
  ClinicalOrderFulfillmentStatus.ACCEPTED,
];
@Injectable()
export class ClinicalOrderFulfillmentsService {
  constructor(
    @InjectRepository(ClinicalOrderFulfillment)
    private readonly fulfillments: Repository<ClinicalOrderFulfillment>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    private readonly currentProvider: CurrentProviderService,
  ) {}
  async recommend(user: User, orderReference: string, unitReference: string) {
    const provider = await this.currentProvider.resolveOperational(user);
    return this.fulfillments.manager.transaction(async (m) => {
      const order = await this.lockOrder(m, orderReference);
      if (order.orderingProviderId !== provider.id) this.notFound();
      this.requirePrescription(order);
      const unit = await this.eligibleUnit(m, unitReference);
      const active = await this.active(m, order.id);
      if (
        active?.status === ClinicalOrderFulfillmentStatus.ACCEPTED ||
        active?.status === ClinicalOrderFulfillmentStatus.SELECTED
      )
        throw new ConflictException("Patient selection is already active");
      if (active)
        await this.cancelRow(m, active, user.id, "RECOMMENDATION_REPLACED");
      const row = await m
        .getRepository(ClinicalOrderFulfillment)
        .save({
          reference: generateClinicalOrderFulfillmentReference(),
          clinicalOrderId: order.id,
          patientId: order.patientId,
          fulfillmentProviderId: unit.providerId,
          fulfillmentServiceUnitId: unit.id,
          recommendedServiceUnitId: unit.id,
          recommendedByProviderId: provider.id,
          selectedByUserId: null,
          status: ClinicalOrderFulfillmentStatus.PROPOSED,
          acceptedAt: null,
          cancelledAt: null,
          cancellationReason: null,
        });
      await this.history(
        m,
        row.id,
        null,
        row.status,
        user.id,
        "FULFILLER_RECOMMENDED",
      );
      return this.mapped(m, row.id);
    });
  }
  async select(user: User, orderReference: string, unitReference: string) {
    const patient = await this.patient(user.id);
    return this.fulfillments.manager.transaction(async (m) => {
      const order = await this.lockOrder(m, orderReference);
      if (order.patientId !== patient.id) this.notFound();
      this.requirePrescription(order);
      const unit = await this.eligibleUnit(m, unitReference);
      const active = await this.active(m, order.id);
      if (active?.status === ClinicalOrderFulfillmentStatus.ACCEPTED)
        throw new ConflictException("Accepted fulfillment cannot be changed");
      if (active && active.fulfillmentServiceUnitId === unit.id) {
        const from = active.status;
        active.status = ClinicalOrderFulfillmentStatus.SELECTED;
        active.selectedByUserId = user.id;
        await m.save(active);
        if (from !== active.status)
          await this.history(
            m,
            active.id,
            from,
            active.status,
            user.id,
            "PATIENT_SELECTED",
          );
        return this.mapped(m, active.id);
      }
      const recommendedUnitId =
        active?.recommendedServiceUnitId ??
        (active?.status === ClinicalOrderFulfillmentStatus.PROPOSED
          ? active.fulfillmentServiceUnitId
          : null);
      const recommendedBy = active?.recommendedByProviderId ?? null;
      if (active)
        await this.cancelRow(m, active, user.id, "PATIENT_CHANGED_SELECTION");
      const row = await m
        .getRepository(ClinicalOrderFulfillment)
        .save({
          reference: generateClinicalOrderFulfillmentReference(),
          clinicalOrderId: order.id,
          patientId: order.patientId,
          fulfillmentProviderId: unit.providerId,
          fulfillmentServiceUnitId: unit.id,
          recommendedServiceUnitId: recommendedUnitId,
          recommendedByProviderId: recommendedBy,
          selectedByUserId: user.id,
          status: ClinicalOrderFulfillmentStatus.SELECTED,
          acceptedAt: null,
          cancelledAt: null,
          cancellationReason: null,
        });
      await this.history(
        m,
        row.id,
        null,
        row.status,
        user.id,
        "PATIENT_SELECTED",
      );
      return this.mapped(m, row.id);
    });
  }
  async listAssigned(user: User, q: FulfillmentListQueryDto) {
    const p = await this.currentProvider.resolveOperational(user);
    return this.page(
      this.readBuilder().where(
        "fulfillment.fulfillmentProviderId=:providerId",
        { providerId: p.id },
      ),
      q,
    );
  }
  async getAssigned(user: User, reference: string) {
    const p = await this.currentProvider.resolveOperational(user);
    const row = await this.readBuilder()
      .where("fulfillment.reference=:reference", { reference })
      .andWhere("fulfillment.fulfillmentProviderId=:providerId", {
        providerId: p.id,
      })
      .getOne();
    if (!row) this.notFound();
    return this.map(row);
  }
  async accept(user: User, reference: string) {
    const p = await this.currentProvider.resolveOperational(user);
    return this.fulfillments.manager.transaction(async (m) => {
      const row = await m
        .getRepository(ClinicalOrderFulfillment)
        .findOne({
          where: { reference, fulfillmentProviderId: p.id },
          lock: { mode: "pessimistic_write" },
        });
      if (!row) this.notFound();
      if (row.status === ClinicalOrderFulfillmentStatus.ACCEPTED)
        return this.mapped(m, row.id);
      if (row.status !== ClinicalOrderFulfillmentStatus.SELECTED)
        throw new ConflictException(
          "Only a patient-selected fulfillment can be accepted",
        );
      const order = await m
        .getRepository(ClinicalOrder)
        .findOne({
          where: { id: row.clinicalOrderId },
          lock: { mode: "pessimistic_read" },
        });
      if (!order || order.status !== ClinicalOrderStatus.ISSUED)
        throw new ConflictException("Clinical Order is no longer actionable");
      const unit = await this.eligibleUnitById(m, row.fulfillmentServiceUnitId);
      if (unit.providerId !== p.id) this.notFound();
      row.status = ClinicalOrderFulfillmentStatus.ACCEPTED;
      row.acceptedAt = new Date();
      await m.save(row);
      await this.history(
        m,
        row.id,
        ClinicalOrderFulfillmentStatus.SELECTED,
        row.status,
        user.id,
        "FULFILLER_ACCEPTED",
      );
      return this.mapped(m, row.id);
    });
  }
  async directory(user: User, q: FulfillmentDirectoryQueryDto) {
    await this.patient(user.id);
    return this.eligibleDirectory(q);
  }
  async directoryForProvider(user: User, q: FulfillmentDirectoryQueryDto) {
    await this.currentProvider.resolveOperational(user);
    return this.eligibleDirectory(q);
  }
  async summaries(orderIds: string[]) {
    if (!orderIds.length) return new Map<string, unknown>();
    const rows = await this.fulfillments
      .createQueryBuilder("f")
      .distinctOn(["f.clinicalOrderId"])
      .innerJoin("f.fulfillmentProvider", "provider")
      .innerJoin("f.fulfillmentServiceUnit", "unit")
      .leftJoin("unit.providerLocation", "location")
      .select("f.clinicalOrderId", "orderId")
      .addSelect("f.reference", "reference")
      .addSelect("f.status", "status")
      .addSelect("f.recommendedServiceUnitId", "recommendedServiceUnitId")
      .addSelect("f.selectedByUserId", "selectedByUserId")
      .addSelect("provider.providerReference", "providerReference")
      .addSelect("provider.displayName", "displayName")
      .addSelect("unit.reference", "serviceUnitReference")
      .addSelect("unit.name", "serviceUnitName")
      .addSelect("location.city", "locationCity")
      .addSelect("location.state", "locationState")
      .addSelect("location.countryCode", "locationCountry")
      .where("f.clinicalOrderId IN (:...orderIds)", { orderIds })
      .orderBy("f.clinicalOrderId", "ASC")
      .addOrderBy(
        `CASE WHEN f.status IN ('PROPOSED','SELECTED','ACCEPTED') THEN 0 ELSE 1 END`,
        "ASC",
      )
      .addOrderBy("f.createdAt", "DESC")
      .addOrderBy("f.reference", "DESC")
      .getRawMany();
    return new Map(
      rows.map((r) => [
        r.orderId,
        {
          reference: r.reference,
          status: r.status,
          pharmacy: {
            providerReference: r.providerReference,
            displayName: r.displayName,
            serviceUnitReference: r.serviceUnitReference,
            serviceUnitName: r.serviceUnitName,
            location:
              r.locationCity || r.locationState || r.locationCountry
                ? {
                    city: r.locationCity,
                    stateOrRegion: r.locationState,
                    countryCode: r.locationCountry,
                  }
                : null,
          },
          recommended: Boolean(r.recommendedServiceUnitId),
          selectedByPatient: Boolean(r.selectedByUserId),
        },
      ]),
    );
  }
  private async eligibleDirectory(q: FulfillmentDirectoryQueryDto) {
    const b = this.fulfillments.manager
      .getRepository(ProviderServiceUnit)
      .createQueryBuilder("unit")
      .innerJoinAndSelect("unit.provider", "provider")
      .leftJoinAndSelect("unit.providerLocation", "location")
      .where(
        "unit.type=:type AND unit.status=:unitStatus AND unit.deletedAt IS NULL",
        {
          type: ProviderServiceUnitType.PHARMACY,
          unitStatus: ProviderServiceUnitStatus.ACTIVE,
        },
      )
      .andWhere(
        "provider.status=:providerStatus AND provider.onboardingStatus=:onboarding AND provider.deletedAt IS NULL",
        {
          providerStatus: ProviderStatus.ACTIVE,
          onboarding: ProviderOnboardingStatus.APPROVED,
        },
      );
    if (q.q)
      b.andWhere(
        "(unit.name ILIKE :search OR provider.displayName ILIKE :search)",
        { search: `%${q.q}%` },
      );
    if (q.country)
      b.andWhere(
        "COALESCE(location.countryCode,provider.countryCode)=:country",
        { country: q.country },
      );
    if (q.stateOrRegion)
      b.andWhere(
        "COALESCE(location.state,provider.stateOrRegion) ILIKE :state",
        { state: q.stateOrRegion },
      );
    if (q.city)
      b.andWhere("COALESCE(location.city,provider.city) ILIKE :city", {
        city: q.city,
      });
    b.orderBy("provider.displayName", "ASC")
      .addOrderBy("unit.name", "ASC")
      .addOrderBy("unit.reference", "ASC")
      .skip((q.page - 1) * q.limit)
      .take(q.limit);
    const [rows, total] = await b.getManyAndCount();
    return {
      items: rows.map((u) => ({
        providerReference: u.provider.providerReference,
        displayName: u.provider.displayName,
        providerType: u.provider.providerType,
        providerServiceUnitReference: u.reference,
        serviceUnitReference: u.reference,
        unitName: u.name,
        serviceUnitName: u.name,
        capabilityType: u.type,
        serviceUnitType: u.type,
        location: u.providerLocation
          ? {
              city: u.providerLocation.city,
              stateOrRegion: u.providerLocation.state,
              countryCode: u.providerLocation.countryCode,
            }
          : {
              city: u.provider.city,
              stateOrRegion: u.provider.stateOrRegion,
              countryCode: u.provider.countryCode,
            },
      })),
      page: q.page,
      limit: q.limit,
      total,
      totalPages: total ? Math.ceil(total / q.limit) : 0,
    };
  }
  async cancelOpenForOrder(
    m: EntityManager,
    orderId: string,
    actorId: string,
    reason: string | null,
  ) {
    const rows = await m
      .getRepository(ClinicalOrderFulfillment)
      .find({
        where: { clinicalOrderId: orderId, status: In(OPEN) },
        lock: { mode: "pessimistic_write" },
      });
    for (const row of rows) {
      const funding = await m
        .getRepository(PharmacyFulfillmentFunding)
        .findOne({
          where: { fulfillmentId: row.id },
          order: { createdAt: "DESC" },
          lock: { mode: "pessimistic_write" },
        });
      if (funding?.status === PharmacyFundingStatus.PAID) {
        funding.status = PharmacyFundingStatus.REQUIRES_REFUND_REVIEW;
        await m.save(funding);
        const dispensing = await m
          .getRepository(PharmacyDispensing)
          .findOne({
            where: { fulfillmentId: row.id },
            lock: { mode: "pessimistic_write" },
          });
        if (dispensing) {
          dispensing.status = PharmacyDispensingStatus.REQUIRES_REFUND_REVIEW;
          await m.save(dispensing);
        }
        continue;
      }
      await this.cancelRow(m, row, actorId, "ORDER_CANCELLED", reason);
    }
  }
  private requirePrescription(order: ClinicalOrder) {
    if (
      order.type !== ClinicalOrderType.PRESCRIPTION ||
      order.status !== ClinicalOrderStatus.ISSUED
    )
      throw new ConflictException(
        "Only issued prescriptions support pharmacy fulfillment",
      );
  }
  private async lockOrder(m: EntityManager, reference: string) {
    const row = await m
      .getRepository(ClinicalOrder)
      .findOne({ where: { reference }, lock: { mode: "pessimistic_write" } });
    if (!row) this.notFound();
    return row;
  }
  private async active(m: EntityManager, id: string) {
    return m
      .getRepository(ClinicalOrderFulfillment)
      .findOne({
        where: { clinicalOrderId: id, status: In(OPEN) },
        order: { createdAt: "DESC" },
        lock: { mode: "pessimistic_write" },
      });
  }
  private async eligibleUnit(m: EntityManager, ref: string) {
    const unit = await m
      .getRepository(ProviderServiceUnit)
      .findOne({
        where: {
          reference: ref,
          status: ProviderServiceUnitStatus.ACTIVE,
          type: ProviderServiceUnitType.PHARMACY,
        },
        relations: { provider: true },
      });
    return this.assertUnit(unit);
  }
  private async eligibleUnitById(m: EntityManager, id: string) {
    const unit = await m
      .getRepository(ProviderServiceUnit)
      .findOne({
        where: {
          id,
          status: ProviderServiceUnitStatus.ACTIVE,
          type: ProviderServiceUnitType.PHARMACY,
        },
        relations: { provider: true },
      });
    return this.assertUnit(unit);
  }
  private assertUnit(unit: ProviderServiceUnit | null) {
    if (
      !unit ||
      unit.deletedAt ||
      unit.status !== ProviderServiceUnitStatus.ACTIVE ||
      unit.type !== ProviderServiceUnitType.PHARMACY ||
      unit.provider.deletedAt ||
      unit.provider.status !== ProviderStatus.ACTIVE ||
      unit.provider.onboardingStatus !== ProviderOnboardingStatus.APPROVED
    )
      throw new ConflictException(
        "Eligible pharmacy service unit was not found",
      );
    return unit;
  }
  private async patient(uid: string) {
    const p = await this.patients.findOne({
      where: { userId: uid },
      withDeleted: true,
    });
    if (!p || p.deletedAt || p.status !== PatientStatus.ACTIVE)
      throw new NotFoundException("Patient profile was not found");
    return p;
  }
  private async cancelRow(
    m: EntityManager,
    row: ClinicalOrderFulfillment,
    actor: string,
    code: string,
    note: string | null = null,
  ) {
    const from = row.status;
    row.status = ClinicalOrderFulfillmentStatus.CANCELLED;
    row.cancelledAt = new Date();
    row.cancellationReason = note;
    await m.save(row);
    await this.history(m, row.id, from, row.status, actor, code, note);
  }
  private history(
    m: EntityManager,
    id: string,
    from: ClinicalOrderFulfillmentStatus | null,
    to: ClinicalOrderFulfillmentStatus,
    actor: string | null,
    code: string,
    note: string | null = null,
  ) {
    return m
      .getRepository(ClinicalOrderFulfillmentHistory)
      .save({
        fulfillmentId: id,
        fromStatus: from,
        toStatus: to,
        actorUserId: actor,
        reasonCode: code,
        reasonNote: note,
      });
  }
  private readBuilder(m: EntityManager = this.fulfillments.manager) {
    return m
      .getRepository(ClinicalOrderFulfillment)
      .createQueryBuilder("fulfillment")
      .innerJoinAndSelect("fulfillment.clinicalOrder", "order")
      .innerJoinAndSelect("order.orderingProvider", "orderingProvider")
      .innerJoinAndSelect("fulfillment.patient", "patient")
      .innerJoinAndSelect("fulfillment.fulfillmentProvider", "provider")
      .innerJoinAndSelect("fulfillment.fulfillmentServiceUnit", "unit")
      .leftJoinAndSelect(
        "fulfillment.recommendedServiceUnit",
        "recommendedUnit",
      )
      .leftJoinAndSelect("order.prescription", "prescription")
      .leftJoinAndSelect("prescription.items", "items");
  }
  private async mapped(m: EntityManager, id: string) {
    const row = await this.readBuilder(m)
      .where("fulfillment.id=:id", { id })
      .orderBy("items.sortOrder", "ASC")
      .getOneOrFail();
    return this.map(row);
  }
  private map(f: ClinicalOrderFulfillment) {
    return {
      reference: f.reference,
      status: f.status,
      clinicalOrder: {
        reference: f.clinicalOrder.reference,
        type: f.clinicalOrder.type,
        issuedAt: f.clinicalOrder.issuedAt,
        clinicalNote: f.clinicalOrder.clinicalNote,
        orderingProvider: {
          providerReference: f.clinicalOrder.orderingProvider.providerReference,
          displayName: f.clinicalOrder.orderingProvider.displayName,
        },
        prescription: f.clinicalOrder.prescription
          ? {
              notes: f.clinicalOrder.prescription.notes,
              items: [...(f.clinicalOrder.prescription.items ?? [])]
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
      },
      patient: {
        patientReference: f.patient.patientReference,
        givenName: f.patient.givenName,
        familyName: f.patient.familyName,
      },
      fulfiller: {
        providerReference: f.fulfillmentProvider.providerReference,
        displayName: f.fulfillmentProvider.displayName,
        serviceUnitReference: f.fulfillmentServiceUnit.reference,
        serviceUnitName: f.fulfillmentServiceUnit.name,
      },
      recommendedServiceUnit: f.recommendedServiceUnit
        ? {
            reference: f.recommendedServiceUnit.reference,
            name: f.recommendedServiceUnit.name,
          }
        : null,
      acceptedAt: f.acceptedAt,
      cancelledAt: f.cancelledAt,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    };
  }
  private async page(
    b: ReturnType<ClinicalOrderFulfillmentsService["readBuilder"]>,
    q: FulfillmentListQueryDto,
  ) {
    b.orderBy("fulfillment.createdAt", "DESC")
      .addOrderBy("fulfillment.reference", "DESC")
      .skip((q.page - 1) * q.limit)
      .take(q.limit);
    const [rows, total] = await b.getManyAndCount();
    return {
      items: rows.map((r) => this.map(r)),
      page: q.page,
      limit: q.limit,
      total,
      totalPages: total ? Math.ceil(total / q.limit) : 0,
    };
  }
  private notFound(): never {
    throw new NotFoundException("Clinical Order fulfillment was not found");
  }
}
