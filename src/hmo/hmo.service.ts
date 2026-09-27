import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { PatientAccessService } from "../patients/patient-access.service";
import { CareRequest } from "../care-requests/entities/care-request.entity";
import { Hmo } from "./entities/hmo.entity";
import { HmoPlan } from "./entities/hmo-plan.entity";
import { PatientHmoCoverage } from "./entities/patient-hmo-coverage.entity";
import { HmoCase } from "./entities/hmo-case.entity";
import { HmoAuthorization } from "./entities/hmo-authorization.entity";
import { HmoClaim } from "./entities/hmo-claim.entity";
import { HmoEnrollmentLead } from "./entities/hmo-enrollment-lead.entity";
import { CareRequestFunding } from "../care-requests/entities/care-request-funding.entity";
import { CareRequestFundingStatus } from "../care-requests/enums/care-request-funding-status.enum";
import { CurrentProviderService } from "../providers/current-provider.service";
import { User } from "../users/entities/user.entity";
import { UserRole } from "../users/enums/user-role.enum";
import {
  CreateHmoCaseDto,
  CreateHmoDto,
  CreateHmoPlanDto,
  DecideAuthorizationDto,
  RequestAuthorizationDto,
  UpsertCoverageDto,
  VerifyEligibilityDto,
  ConfirmDeliveredServicesDto,
  SubmitClaimDto,
  RecordClaimPaymentDto,
  ReconcileClaimDto,
  CreateHmoEnrollmentLeadDto,
} from "./hmo.dto";
@Injectable()
export class HmoService {
  constructor(
    @InjectRepository(Hmo) private hmos: Repository<Hmo>,
    @InjectRepository(HmoPlan) private plans: Repository<HmoPlan>,
    @InjectRepository(PatientHmoCoverage)
    private coverages: Repository<PatientHmoCoverage>,
    @InjectRepository(HmoCase) private cases: Repository<HmoCase>,
    @InjectRepository(HmoAuthorization)
    private auths: Repository<HmoAuthorization>,
    @InjectRepository(HmoClaim) private claims: Repository<HmoClaim>,
    @InjectRepository(CareRequest) private cares: Repository<CareRequest>,
    @InjectRepository(HmoEnrollmentLead)
    private enrollmentLeads: Repository<HmoEnrollmentLead>,
    @InjectRepository(CareRequestFunding)
    private funding: Repository<CareRequestFunding>,
    private patientAccess: PatientAccessService,
    private currentProvider: CurrentProviderService,
  ) {}
  listHmos() {
    return this.hmos.find({ where: { active: true }, order: { name: "ASC" } });
  }
  createHmo(d: CreateHmoDto) {
    return this.hmos.save(
      this.hmos.create({ ...d, code: d.code.trim().toUpperCase() }),
    );
  }
  createPlan(d: CreateHmoPlanDto) {
    return this.plans.save(
      this.plans.create({ ...d, code: d.code.trim().toUpperCase() }),
    );
  }
  async addCoverage(d: UpsertCoverageDto) {
    const h = await this.hmos.findOneBy({ id: d.hmoId, active: true });
    if (!h) throw new NotFoundException("HMO not found");
    if (
      d.planId &&
      !(await this.plans.findOneBy({
        id: d.planId,
        hmoId: d.hmoId,
        active: true,
      }))
    )
      throw new BadRequestException("Plan does not belong to HMO");
    return this.coverages.save(
      this.coverages.create({ ...d, memberType: d.memberType || "PRINCIPAL" }),
    );
  }
  async listMine(userId: string, patientReference: string) {
    const p = await this.patientAccess.resolveAccessiblePatient(
      userId,
      patientReference,
    );
    return this.listCoverages(p.id);
  }
  async addMine(
    userId: string,
    patientReference: string,
    d: Omit<UpsertCoverageDto, "patientId">,
  ) {
    const p = await this.patientAccess.resolveAccessiblePatient(
      userId,
      patientReference,
    );
    return this.addCoverage({ ...d, patientId: p.id });
  }
  listCoverages(patientId: string) {
    return this.coverages.find({
      where: { patientId },
      relations: { hmo: true, plan: true },
      order: { createdAt: "DESC" },
    });
  }
  async createEnrollmentLead(
    userId: string,
    patientReference: string,
    d: CreateHmoEnrollmentLeadDto,
  ) {
    const patient = await this.patientAccess.resolveAccessiblePatient(
      userId,
      patientReference,
    );
    if (
      d.preferredHmoId &&
      !(await this.hmos.findOneBy({ id: d.preferredHmoId, active: true }))
    )
      throw new NotFoundException("HMO not found");
    const existing = await this.enrollmentLeads.findOne({
      where: { userId, patientId: patient.id, status: "NEW" },
      order: { createdAt: "DESC" },
    });
    if (existing) return existing;
    return this.enrollmentLeads.save(
      this.enrollmentLeads.create({
        userId,
        patientId: patient.id,
        preferredHmoId: d.preferredHmoId ?? null,
        employerOrganisation: d.employerOrganisation?.trim() || null,
        notes: d.notes?.trim() || null,
        status: "NEW",
      }),
    );
  }
  listEnrollmentLeads() {
    return this.enrollmentLeads.find({
      order: { createdAt: "DESC" },
      take: 200,
    });
  }
  async createCase(d: CreateHmoCaseDto, user: User) {
    await this.assertHospitalAccess(user, d.hospitalProviderId);
    const coverage = await this.coverages.findOne({
      where: { id: d.coverageId },
      relations: { patient: true },
    });
    if (!coverage) throw new NotFoundException("Coverage not found");
    const care = await this.cares.findOneBy({
      reference: d.careRequestReference,
    });
    if (!care) throw new NotFoundException("Encounter not found");
    if (care.patientId !== coverage.patientId)
      throw new ConflictException(
        "Coverage and encounter belong to different patients",
      );
    if (care.hostProviderId && care.hostProviderId !== d.hospitalProviderId)
      throw new ConflictException(
        "HMO hospital must match encounter host hospital",
      );
    return this.cases.save(
      this.cases.create({
        coverageId: coverage.id,
        careRequestId: care.id,
        hospitalProviderId: d.hospitalProviderId,
        eligibilityStatus: "PENDING",
      }),
    );
  }
  async selectForEncounter(
    reference: string,
    coverageId: string,
    userId: string,
  ) {
    const care = await this.cares.findOne({
      where: { reference, userId },
      relations: { user: true },
    });
    if (!care) throw new NotFoundException("Care Request was not found");
    if (!care.patientId)
      throw new ConflictException("Care Request has no patient identity");
    if (!care.hostProviderId && !care.assignedProviderId)
      throw new ConflictException(
        "A provider must accept the encounter before HMO selection",
      );
    if (care.servicePriceMinor == null || !care.serviceCurrency)
      throw new ConflictException(
        "Care Request has no authoritative service price",
      );
    const coverage = await this.coverages.findOne({
      where: { id: coverageId, patientId: care.patientId },
      relations: { hmo: true, plan: true },
    });
    if (!coverage)
      throw new NotFoundException("Coverage was not found for this patient");
    const today = new Date().toISOString().slice(0, 10);
    if (coverage.expiresAt && coverage.expiresAt < today)
      throw new ConflictException("Coverage has expired");
    return this.cases.manager.transaction(async (manager) => {
      const caseRepo = manager.getRepository(HmoCase);
      const fundingRepo = manager.getRepository(CareRequestFunding);
      let hmoCase = await caseRepo.findOne({
        where: { careRequestId: care.id },
      });
      if (hmoCase && hmoCase.coverageId !== coverage.id)
        throw new ConflictException(
          "This encounter already has a different HMO selection",
        );
      if (!hmoCase) {
        hmoCase = await caseRepo.save(
          caseRepo.create({
            coverageId: coverage.id,
            careRequestId: care.id,
            hospitalProviderId: care.hostProviderId || care.assignedProviderId!,
            eligibilityStatus: "PENDING",
          }),
        );
      }
      let record = await fundingRepo.findOne({
        where: { careRequestId: care.id },
      });
      if (record?.status === CareRequestFundingStatus.PAID)
        throw new ConflictException(
          "A paid self-pay encounter cannot be changed to HMO",
        );
      const snapshot = {
        hmoId: coverage.hmoId,
        hmoName: coverage.hmo?.name ?? null,
        planId: coverage.planId,
        planName: coverage.plan?.name ?? null,
        memberId: coverage.memberId,
        selectedAt: new Date().toISOString(),
      };
      const nextFunding = record ?? fundingRepo.create();
      Object.assign(nextFunding, {
        careRequestId: care.id,
        amountMinor: care.servicePriceMinor,
        baseAmountMinor: care.servicePriceMinor,
        programmeSurchargeMinor: "0",
        partnerFamilyId: null,
        partnerProgramId: null,
        programmeSnapshot: null,
        currency: care.serviceCurrency,
        status: CareRequestFundingStatus.PENDING,
        paidAt: null,
        fundingRoute: "HMO",
        hmoCaseId: hmoCase.id,
        hmoCoverageId: coverage.id,
        hmoAuthorizationId: null,
        hmoApprovedAmountMinor: null,
        hmoSnapshot: snapshot,
      });
      record = await fundingRepo.save(nextFunding);
      return { hmoCase, funding: record };
    });
  }
  async encounterStatus(reference: string, userId: string) {
    const care = await this.cares.findOneBy({ reference, userId });
    if (!care) throw new NotFoundException("Care Request was not found");
    const hmoCase = await this.cases.findOne({
      where: { careRequestId: care.id },
      relations: { coverage: { hmo: true, plan: true } },
    });
    const funding = await this.funding.findOneBy({ careRequestId: care.id });
    const authorization = hmoCase
      ? await this.auths.findOne({
          where: { hmoCaseId: hmoCase.id },
          order: { createdAt: "DESC" },
        })
      : null;
    return { hmoCase, authorization, funding };
  }
  async useSelfPay(reference: string, userId: string) {
    const care = await this.cares.findOneBy({ reference, userId });
    if (!care) throw new NotFoundException("Care Request was not found");
    const record = await this.funding.findOneBy({ careRequestId: care.id });
    if (record?.status === CareRequestFundingStatus.PAID)
      throw new ConflictException("Funding is already paid");
    if (record) {
      record.fundingRoute = "SELF_PAY";
      record.hmoCaseId = null;
      record.hmoCoverageId = null;
      record.hmoAuthorizationId = null;
      record.hmoApprovedAmountMinor = null;
      record.hmoSnapshot = null;
      record.amountMinor = care.servicePriceMinor!;
      record.baseAmountMinor = care.servicePriceMinor!;
      record.status = CareRequestFundingStatus.PENDING;
      await this.funding.save(record);
    }
    return { funding: record, route: "SELF_PAY" };
  }
  async verify(reference: string, d: VerifyEligibilityDto, user: User) {
    const c = await this.cases.findOne({
      where: { reference },
      relations: { coverage: true },
    });
    if (!c) throw new NotFoundException("HMO case not found");
    await this.assertHospitalAccess(user, c.hospitalProviderId);
    c.eligibilityStatus = d.result;
    c.eligibilityReference = d.verificationReference;
    c.eligibilityNotes = d.notes || null;
    c.eligibilityVerifiedAt = new Date();
    c.eligibilityVerifiedBy = user.id;
    c.coverage.eligibilityStatus = d.result as any;
    c.coverage.lastVerifiedAt = c.eligibilityVerifiedAt;
    c.coverage.verificationReference = d.verificationReference;
    await this.coverages.save(c.coverage);
    return this.cases.save(c);
  }
  async requestAuthorization(
    reference: string,
    d: RequestAuthorizationDto,
    user: User,
  ) {
    const c = await this.cases.findOneBy({ reference });
    if (!c) throw new NotFoundException("HMO case not found");
    await this.assertHospitalAccess(user, c.hospitalProviderId);
    if (c.eligibilityStatus !== "ELIGIBLE")
      throw new ConflictException(
        "Eligibility must be confirmed before authorization",
      );
    return this.auths.save(
      this.auths.create({
        hmoCaseId: c.id,
        status: "PENDING",
        requestedServices: d.requestedServices,
        clinicalReason: d.clinicalReason || null,
        requestedAmountMinor:
          d.requestedAmountMinor == null
            ? null
            : String(d.requestedAmountMinor),
        currency: d.currency || "NGN",
        supportingDocuments: d.supportingDocuments || [],
      }),
    );
  }
  async decide(reference: string, d: DecideAuthorizationDto) {
    const a = await this.auths.findOne({
      where: { reference },
      relations: { hmoCase: true },
    });
    if (!a) throw new NotFoundException("Authorization not found");
    a.status = d.status;
    a.authorizationCode = d.authorizationCode || null;
    a.approvedServices = d.approvedServices || [];
    a.approvedAmountMinor =
      d.approvedAmountMinor == null ? null : String(d.approvedAmountMinor);
    a.copayAmountMinor =
      d.copayAmountMinor == null ? null : String(d.copayAmountMinor);
    a.validUntil = d.validUntil ? new Date(d.validUntil) : null;
    a.hmoComments = d.hmoComments || null;
    if (
      (d.status === "APPROVED" || d.status === "PARTIALLY_APPROVED") &&
      !a.authorizationCode
    )
      throw new BadRequestException(
        "Authorization code is required for approval",
      );
    const saved = await this.auths.save(a);
    const funding = await this.funding.findOneBy({ hmoCaseId: a.hmoCaseId });
    if (funding) {
      if (["APPROVED", "PARTIALLY_APPROVED"].includes(a.status)) {
        funding.hmoAuthorizationId = a.id;
        funding.hmoApprovedAmountMinor = a.approvedAmountMinor;
        const copay = a.copayAmountMinor ?? "0";
        funding.amountMinor = copay;
        funding.status =
          BigInt(copay) === 0n
            ? CareRequestFundingStatus.SATISFIED_FREE
            : CareRequestFundingStatus.PENDING;
      } else {
        funding.hmoAuthorizationId = null;
        funding.hmoApprovedAmountMinor = null;
      }
      await this.funding.save(funding);
    }
    return saved;
  }
  async confirmDelivery(
    reference: string,
    d: ConfirmDeliveredServicesDto,
    user: User,
  ) {
    const a = await this.auths.findOne({
      where: { reference },
      relations: { hmoCase: true },
    });
    if (!a) throw new NotFoundException("Authorization not found");
    await this.assertHospitalAccess(user, a.hmoCase.hospitalProviderId);
    if (!["APPROVED", "PARTIALLY_APPROVED"].includes(a.status))
      throw new ConflictException(
        "Only approved authorization can be delivered",
      );
    if (!d.deliveredServices.length)
      throw new BadRequestException(
        "At least one delivered service is required",
      );
    a.deliveredServices = d.deliveredServices;
    a.serviceConfirmedAt = new Date();
    a.serviceConfirmedBy = user.id;
    return this.auths.save(a);
  }
  async generateClaim(reference: string, user: User) {
    const a = await this.auths.findOne({
      where: { reference },
      relations: { hmoCase: true },
    });
    if (!a) throw new NotFoundException("Authorization not found");
    await this.assertHospitalAccess(user, a.hmoCase.hospitalProviderId);
    if (!a.serviceConfirmedAt || !a.deliveredServices.length)
      throw new ConflictException(
        "Delivered service confirmation is required before claim generation",
      );
    const prior = await this.claims.findOneBy({ authorizationId: a.id });
    if (prior) return prior;
    const amount = a.approvedAmountMinor || a.requestedAmountMinor;
    if (!amount) throw new ConflictException("Claim amount is unavailable");
    return this.claims.save(
      this.claims.create({
        authorizationId: a.id,
        status: "DRAFT",
        services: a.deliveredServices,
        claimedAmountMinor: amount,
        currency: a.currency,
      }),
    );
  }
  async submitClaim(reference: string, d: SubmitClaimDto, user: User) {
    const claim = await this.claims.findOne({
      where: { reference },
      relations: { authorization: { hmoCase: true } },
    });
    if (!claim) throw new NotFoundException("Claim not found");
    await this.assertHospitalAccess(
      user,
      claim.authorization.hmoCase.hospitalProviderId,
    );
    if (claim.status !== "DRAFT")
      throw new ConflictException("Only draft claims can be submitted");
    claim.status = "SUBMITTED";
    claim.submittedAt = new Date();
    claim.externalClaimReference = d.externalClaimReference;
    return this.claims.save(claim);
  }
  async recordClaimPayment(reference: string, d: RecordClaimPaymentDto) {
    const claim = await this.claims.findOneBy({ reference });
    if (!claim) throw new NotFoundException("Claim not found");
    if (!["SUBMITTED", "APPROVED", "PARTIALLY_APPROVED"].includes(claim.status))
      throw new ConflictException("Claim must be submitted before payment");
    if (
      d.platformFeeBps != null &&
      (d.platformFeeBps < 0 || d.platformFeeBps > 10000)
    )
      throw new BadRequestException(
        "Platform fee must be between 0 and 10000 basis points",
      );
    const paid = BigInt(d.paidAmountMinor);
    const bps = BigInt(d.platformFeeBps || 0);
    const fee = (paid * bps) / 10000n;
    claim.status = "PAID";
    claim.approvedAmountMinor = String(
      d.approvedAmountMinor ?? d.paidAmountMinor,
    );
    claim.paidAmountMinor = String(d.paidAmountMinor);
    claim.platformFeeBps = d.platformFeeBps || 0;
    claim.platformFeeMinor = fee.toString();
    claim.hospitalNetMinor = (paid - fee).toString();
    claim.paymentReference = d.paymentReference;
    claim.paidAt = new Date();
    return this.claims.save(claim);
  }
  async reconcileClaim(reference: string, d: ReconcileClaimDto) {
    const claim = await this.claims.findOneBy({ reference });
    if (!claim) throw new NotFoundException("Claim not found");
    if (claim.status !== "PAID")
      throw new ConflictException("Only paid claims can be reconciled");
    if (claim.reconciledAt) return claim;
    claim.status = "RECONCILED";
    claim.reconciledAt = new Date();
    claim.reconciliationReference = d.reconciliationReference;
    return this.claims.save(claim);
  }
  async desk() {
    return this.cases.find({
      relations: {
        coverage: { hmo: true, plan: true, patient: true },
        careRequest: true,
        hospitalProvider: true,
      },
      order: { createdAt: "DESC" },
      take: 200,
    });
  }
  async funnel() {
    const cases = await this.cases.find();
    const auths = await this.auths.find();
    const claims = await this.claims.find();
    return {
      eligibility: cases.filter((x) => x.eligibilityStatus === "ELIGIBLE")
        .length,
      authorization: auths.filter((x) =>
        ["APPROVED", "PARTIALLY_APPROVED"].includes(x.status),
      ).length,
      careCompleted: auths.filter((x) => !!x.serviceConfirmedAt).length,
      claimsSubmitted: claims.filter(
        (x) => x.status !== "DRAFT" && x.status !== "READY",
      ).length,
      paid: claims.filter((x) => ["PAID", "RECONCILED"].includes(x.status))
        .length,
      reconciled: claims.filter((x) => x.status === "RECONCILED").length,
      primedRevenueMinor: claims
        .reduce((sum, x) => sum + BigInt(x.platformFeeMinor || "0"), 0n)
        .toString(),
    };
  }
  private async assertHospitalAccess(user: User, hospitalProviderId: string) {
    if (
      user.roles?.includes(UserRole.ADMIN) ||
      user.roles?.includes(UserRole.OPERATIONS)
    )
      return;
    const provider = await this.currentProvider.resolveOperational(user);
    if (provider.id !== hospitalProviderId)
      throw new ForbiddenException(
        "Provider is not authorized for this HMO hospital case",
      );
  }
}
