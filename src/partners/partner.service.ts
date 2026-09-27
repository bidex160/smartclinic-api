import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { CareRequest } from "../care-requests/entities/care-request.entity";
import { CareRequestFunding } from "../care-requests/entities/care-request-funding.entity";
import { PaymentTransaction } from "../payments/entities/payment-transaction.entity";
import { PaymentTransactionStatus } from "../payments/enums/payment-transaction-status.enum";
import { User } from "../users/entities/user.entity";
import { normalizePhoneNumber } from "../users/phone-normalization";
import { Partner } from "./entities/partner.entity";
import { PartnerProgram } from "./entities/partner-program.entity";
import { PartnerInvitation } from "./entities/partner-invitation.entity";
import { PartnerFamily } from "./entities/partner-family.entity";
import { PartnerCampaign } from "./entities/partner-campaign.entity";
import { PartnerWellnessEvent } from "./entities/partner-wellness-event.entity";
import { PartnerSplitLedger } from "./entities/partner-split-ledger.entity";
import {
  ActivateFamilyDto,
  AllocatePartnerPaymentDto,
  CreateCampaignDto,
  CreatePartnerDto,
  CreateProgramDto,
  InviteFamilyDto,
  RecordWellnessDto,
} from "./partner.dto";
@Injectable()
export class PartnerService {
  constructor(
    @InjectRepository(Partner) private partners: Repository<Partner>,
    @InjectRepository(PartnerProgram)
    private programs: Repository<PartnerProgram>,
    @InjectRepository(PartnerInvitation)
    private invitations: Repository<PartnerInvitation>,
    @InjectRepository(PartnerFamily)
    private families: Repository<PartnerFamily>,
    @InjectRepository(PartnerSplitLedger)
    private ledger: Repository<PartnerSplitLedger>,
    @InjectRepository(PartnerCampaign)
    private campaigns: Repository<PartnerCampaign>,
    @InjectRepository(PartnerWellnessEvent)
    private wellness: Repository<PartnerWellnessEvent>,
    @InjectRepository(User) private users: Repository<User>,
  ) {}
  listPartners() {
    return this.partners.find({ order: { createdAt: "DESC" } });
  }
  programsForPartner(partnerId: string) {
    return this.programs.find({
      where: { partnerId },
      order: { createdAt: "DESC" },
    });
  }
  createPartner(d: CreatePartnerDto) {
    return this.partners.save(
      this.partners.create({ ...d, status: "LEAD", active: true }),
    );
  }
  async activatePartner(id: string) {
    const p = await this.partners.findOneBy({ id });
    if (!p) throw new NotFoundException("Partner not found");
    p.status = "ACTIVE";
    p.active = true;
    return this.partners.save(p);
  }
  async createProgram(d: CreateProgramDto) {
    if (
      d.providerBps + d.platformBps + d.partnerBps + d.wellnessCreditBps !==
      10000
    )
      throw new BadRequestException(
        "Commercial split must total 10000 basis points",
      );
    const p = await this.partners.findOneBy({ id: d.partnerId, active: true });
    if (!p) throw new NotFoundException("Partner not found");
    return this.programs.save(
      this.programs.create({
        ...d,
        checkinIntervalDays: d.checkinIntervalDays || 60,
        active: true,
      }),
    );
  }
  async invite(d: InviteFamilyDto) {
    if (!d.email && !d.phone)
      throw new BadRequestException("Email or phone is required");
    const program = await this.programs.findOneBy({
      id: d.programId,
      partnerId: d.partnerId,
      active: true,
    });
    if (!program)
      throw new NotFoundException("Active partner programme not found");
    return this.invitations.save(
      this.invitations.create({ ...d, status: "INVITED" }),
    );
  }
  async invitationRecord(token: string) {
    const i = await this.invitations.findOneBy({ token });
    if (!i) throw new NotFoundException("Invitation not found");
    return i;
  }
  async invitation(token: string) {
    const i = await this.invitationRecord(token);
    const p = await this.partners.findOneBy({ id: i.partnerId });
    return {
      token: i.token,
      status: i.status,
      partner: { id: p?.id, name: p?.name, type: p?.type },
      programId: i.programId,
      campaignId: i.campaignId,
    };
  }
  async activateFamily(token: string, userId: string, d: ActivateFamilyDto) {
    const i = await this.invitationRecord(token);
    await this.assertInvitationRecipient(i, userId);
    if (i.status === "ACTIVATED") {
      const existing = await this.families.findOneBy({
        invitationId: i.id,
        userId,
      });
      if (existing) return existing;
      throw new ConflictException("Invitation already activated");
    }
    const program = await this.programs.findOneBy({
      id: i.programId!,
      active: true,
    });
    if (!program) throw new NotFoundException("Programme not found");
    const next = new Date(Date.now() + program.checkinIntervalDays * 86400000);
    const f = await this.families.save(
      this.families.create({
        partnerId: i.partnerId,
        programId: program.id,
        userId,
        invitationId: i.id,
        campaignId: i.campaignId,
        consentVersion: d.consentVersion,
        consentedAt: new Date(),
        nextWellnessAt: next,
        status: "ACTIVE",
      }),
    );
    i.status = "ACTIVATED";
    i.activatedAt = new Date();
    await this.invitations.save(i);
    return f;
  }

  private async assertInvitationRecipient(
    invitation: PartnerInvitation,
    userId: string,
  ): Promise<void> {
    if (!invitation.email && !invitation.phone) return;
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");
    const emailMatches =
      !invitation.email ||
      invitation.email.trim().toLowerCase() === user.emailNormalized;
    const invitationPhone = invitation.phone
      ? normalizePhoneNumber(invitation.phone)
      : null;
    const phoneMatches =
      !invitation.phone ||
      (invitationPhone !== null && invitationPhone === user.phoneNormalized);
    if (!emailMatches || !phoneMatches)
      throw new ForbiddenException(
        "This invitation was addressed to a different SmartClinic account",
      );
  }
  async allocate(d: AllocatePartnerPaymentDto) {
    const program = await this.programs.findOneBy({
      id: d.programId,
      active: true,
    });
    if (!program) throw new NotFoundException("Programme not found");
    const family = await this.families.findOneBy({
      id: d.familyId,
      programId: d.programId,
      status: "ACTIVE",
    });
    if (!family) throw new NotFoundException("Active family not found");
    const gross = BigInt(d.grossAmountMinor);
    const parts = [
      ["PROVIDER", program.providerBps, d.providerId || null],
      ["PLATFORM", program.platformBps, null],
      ["PARTNER", program.partnerBps, program.partnerId],
      ["WELLNESS_CREDIT", program.wellnessCreditBps, family.id],
    ] as const;
    let allocated = 0n;
    const rows = [];
    for (let x = 0; x < parts.length; x++) {
      const [kind, bps, beneficiary] = parts[x];
      const amount =
        x === parts.length - 1
          ? gross - allocated
          : (gross * BigInt(bps)) / 10000n;
      allocated += amount;
      const prior = await this.ledger.findOneBy({
        eventKey: d.eventKey,
        beneficiaryType: kind,
      });
      if (prior) {
        rows.push(prior);
        continue;
      }
      rows.push(
        await this.ledger.save(
          this.ledger.create({
            eventKey: d.eventKey,
            sourceTransactionId: d.sourceTransactionId,
            partnerId: program.partnerId,
            programId: program.id,
            familyId: family.id,
            beneficiaryType: kind,
            beneficiaryId: beneficiary,
            amountMinor: amount.toString(),
            currency: program.currency,
            status: "PENDING",
            metadata: { bps },
          }),
        ),
      );
    }
    return {
      grossAmountMinor: gross.toString(),
      allocatedAmountMinor: allocated.toString(),
      entries: rows,
    };
  }
  async preparePaymentAttribution(
    manager: EntityManager,
    userId: string,
    familyId: string,
    baseAmountMinor: string,
    currency: string,
  ) {
    const family = await manager.getRepository(PartnerFamily).findOne({
      where: { id: familyId, userId, status: "ACTIVE" },
      lock: { mode: "pessimistic_read" },
    });
    if (!family)
      throw new NotFoundException("Active programme relationship not found");
    const program = await manager.getRepository(PartnerProgram).findOneBy({
      id: family.programId,
      partnerId: family.partnerId,
      active: true,
    });
    if (!program)
      throw new NotFoundException("Active partner programme not found");
    if (program.currency !== currency)
      throw new ConflictException(
        "Programme currency does not match the encounter",
      );
    const base = BigInt(baseAmountMinor);
    const partnerAmount = (base * BigInt(program.partnerBps) + 5000n) / 10000n;
    const wellnessAmount =
      (base * BigInt(program.wellnessCreditBps) + 5000n) / 10000n;
    return {
      familyId: family.id,
      programId: program.id,
      surchargeAmountMinor: (partnerAmount + wellnessAmount).toString(),
      snapshot: {
        model: "EMBEDDED_SURCHARGE_V1",
        partnerId: program.partnerId,
        programId: program.id,
        providerBps: program.providerBps,
        platformBps: program.platformBps,
        partnerBps: program.partnerBps,
        wellnessCreditBps: program.wellnessCreditBps,
        partnerAmountMinor: partnerAmount.toString(),
        wellnessAmountMinor: wellnessAmount.toString(),
        baseAmountMinor,
        currency,
      },
    };
  }

  async allocateAttributedPayment(
    manager: EntityManager,
    input: {
      funding: CareRequestFunding;
      care: CareRequest;
      paymentTransaction: PaymentTransaction;
    },
  ) {
    const snapshot = input.funding.programmeSnapshot as {
      model?: string;
      partnerId?: string;
      partnerBps?: number;
      wellnessCreditBps?: number;
      partnerAmountMinor?: string;
      wellnessAmountMinor?: string;
      baseAmountMinor?: string;
      currency?: string;
    } | null;
    if (
      !input.funding.partnerFamilyId ||
      !input.funding.partnerProgramId ||
      snapshot?.model !== "EMBEDDED_SURCHARGE_V1" ||
      !snapshot.partnerId
    )
      throw new ConflictException(
        "Programme payment attribution snapshot is invalid",
      );
    const expectedSurcharge =
      BigInt(snapshot.partnerAmountMinor ?? "0") +
      BigInt(snapshot.wellnessAmountMinor ?? "0");
    if (
      expectedSurcharge !== BigInt(input.funding.programmeSurchargeMinor) ||
      BigInt(input.funding.amountMinor) !==
        BigInt(snapshot.baseAmountMinor ?? "0") + expectedSurcharge ||
      input.paymentTransaction.currency !== snapshot.currency
    )
      throw new ConflictException(
        "Programme surcharge does not reconcile to payment",
      );
    const eventKey = `CARE_PAYMENT:${input.paymentTransaction.id}`;
    const repository = manager.getRepository(PartnerSplitLedger);
    const entries = [
      {
        beneficiaryType: "PARTNER",
        beneficiaryId: snapshot.partnerId,
        amountMinor: snapshot.partnerAmountMinor ?? "0",
        bps: snapshot.partnerBps ?? 0,
      },
      {
        beneficiaryType: "WELLNESS_CREDIT",
        beneficiaryId: input.funding.partnerFamilyId,
        amountMinor: snapshot.wellnessAmountMinor ?? "0",
        bps: snapshot.wellnessCreditBps ?? 0,
      },
    ];
    const rows = [];
    for (const entry of entries) {
      const existing = await repository.findOneBy({
        eventKey,
        beneficiaryType: entry.beneficiaryType,
      });
      if (existing) {
        rows.push(existing);
        continue;
      }
      rows.push(
        await repository.save(
          repository.create({
            eventKey,
            sourceTransactionId: input.paymentTransaction.id,
            partnerId: snapshot.partnerId,
            programId: input.funding.partnerProgramId,
            familyId: input.funding.partnerFamilyId,
            beneficiaryType: entry.beneficiaryType,
            beneficiaryId: entry.beneficiaryId,
            amountMinor: entry.amountMinor,
            currency: snapshot.currency!,
            status: "HELD",
            metadata: { ...snapshot, appliedBps: entry.bps },
          }),
        ),
      );
    }
    return rows;
  }
  async markAttributedPaymentPayable(
    manager: EntityManager,
    careRequestReference: string,
  ) {
    const funding = await manager.getRepository(CareRequestFunding).findOne({
      where: { careRequest: { reference: careRequestReference } },
      relations: { careRequest: true },
    });
    if (!funding?.partnerFamilyId) return [];
    const transaction = await manager
      .getRepository(PaymentTransaction)
      .findOne({
        where: {
          paymentAttempt: { careRequestFundingId: funding.id },
          status: PaymentTransactionStatus.SUCCEEDED,
        },
        relations: { paymentAttempt: true },
      });
    if (!transaction) return [];
    const repository = manager.getRepository(PartnerSplitLedger);
    const rows = await repository.find({
      where: { eventKey: `CARE_PAYMENT:${transaction.id}`, status: "HELD" },
    });
    for (const row of rows) {
      row.status = "PAYABLE";
      row.metadata = {
        ...(row.metadata ?? {}),
        payableAt: new Date().toISOString(),
      };
      await repository.save(row);
    }
    return rows;
  }
  async createCampaign(d: CreateCampaignDto) {
    const p = await this.partners.findOneBy({ id: d.partnerId, active: true });
    if (!p) throw new NotFoundException("Partner not found");
    return this.campaigns.save(
      this.campaigns.create({
        partnerId: d.partnerId,
        programId: d.programId || null,
        name: d.name,
        status: "DRAFT",
        startsAt: null,
        endsAt: null,
        metadata: null,
      }),
    );
  }
  async recordWellness(userId: string, d: RecordWellnessDto) {
    const family = await this.families.findOneBy({
      id: d.familyId,
      userId,
      status: "ACTIVE",
    });
    if (!family) throw new NotFoundException("Active family not found");
    const program = await this.programs.findOneBy({
      id: family.programId,
      active: true,
    });
    if (!program) throw new NotFoundException("Programme not found");
    const occurredAt = new Date(),
      nextDueAt = new Date(
        occurredAt.getTime() + program.checkinIntervalDays * 86400000,
      );
    const e = await this.wellness.save(
      this.wellness.create({
        familyId: family.id,
        patientId: d.patientId || null,
        eventType: d.eventType,
        occurredAt,
        nextDueAt,
        providerId: d.providerId || null,
        careReference: d.careReference || null,
        metadata: null,
      }),
    );
    family.nextWellnessAt = nextDueAt;
    await this.families.save(family);
    return e;
  }
  async familyHome(userId: string) {
    const fs = await this.families.find({
      where: { userId, status: "ACTIVE" },
    });
    const out = [];
    for (const f of fs) {
      const p = await this.partners.findOneBy({ id: f.partnerId });
      const program = await this.programs.findOneBy({
        id: f.programId,
        active: true,
      });
      const credits = await this.ledger.find({
        where: { familyId: f.id, beneficiaryType: "WELLNESS_CREDIT" },
      });
      out.push({
        familyId: f.id,
        partner: { id: p?.id, name: p?.name, type: p?.type },
        program: program
          ? {
              id: program.id,
              name: program.name,
              partnerBps: program.partnerBps,
              wellnessCreditBps: program.wellnessCreditBps,
              currency: program.currency,
            }
          : null,
        nextWellnessAt: f.nextWellnessAt,
        wellnessCreditMinor: credits
          .reduce((a, x) => a + BigInt(x.amountMinor), 0n)
          .toString(),
        currency: credits[0]?.currency || "NGN",
      });
    }
    return out;
  }
  async dashboard(partnerId: string) {
    const families = await this.families.count({
      where: { partnerId, status: "ACTIVE" },
    });
    const invitations = await this.invitations.count({ where: { partnerId } });
    const rows = await this.ledger.find({ where: { partnerId } });
    const sum = (k: string) =>
      rows
        .filter((x) => x.beneficiaryType === k)
        .reduce((a, x) => a + BigInt(x.amountMinor), 0n)
        .toString();
    return {
      invitations,
      families,
      activationRate: invitations ? families / invitations : 0,
      grossProgrammeMinor: rows
        .reduce((a, x) => a + BigInt(x.amountMinor), 0n)
        .toString(),
      partnerBenefitMinor: sum("PARTNER"),
      wellnessCreditMinor: sum("WELLNESS_CREDIT"),
      platformRevenueMinor: sum("PLATFORM"),
    };
  }
}
