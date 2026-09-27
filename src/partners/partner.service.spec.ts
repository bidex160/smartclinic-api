import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { PartnerService } from "./partner.service";
import { PartnerFamily } from "./entities/partner-family.entity";
import { PartnerProgram } from "./entities/partner-program.entity";
import { PartnerSplitLedger } from "./entities/partner-split-ledger.entity";
describe("PartnerService", () => {
  const repo = () =>
    ({
      findOneBy: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(async (x: any) => x),
      create: (x: any) => x,
      count: jest.fn().mockResolvedValue(0),
      find: jest.fn().mockResolvedValue([]),
    }) as any;
  let partners: any,
    programs: any,
    invitations: any,
    families: any,
    ledger: any,
    campaigns: any,
    wellness: any,
    users: any,
    s: PartnerService;
  beforeEach(() => {
    partners = repo();
    programs = repo();
    invitations = repo();
    families = repo();
    ledger = repo();
    campaigns = repo();
    wellness = repo();
    users = repo();
    s = new PartnerService(
      partners,
      programs,
      invitations,
      families,
      ledger,
      campaigns,
      wellness,
      users,
    );
  });
  it("rejects commercial splits that do not total 100%", async () => {
    await expect(
      s.createProgram({
        partnerId: "11111111-1111-1111-1111-111111111111",
        name: "Healthy Families",
        providerBps: 8000,
        platformBps: 1000,
        partnerBps: 300,
        wellnessCreditBps: 200,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it("allocates exact gross amount and is retry-safe per beneficiary", async () => {
    programs.findOneBy.mockResolvedValue({
      id: "p1",
      partnerId: "school1",
      providerBps: 8500,
      platformBps: 1000,
      partnerBps: 300,
      wellnessCreditBps: 200,
      currency: "NGN",
      active: true,
    });
    families.findOneBy.mockResolvedValue({ id: "f1" });
    ledger.findOneBy.mockResolvedValue(null);
    const x = await s.allocate({
      programId: "p1",
      familyId: "f1",
      sourceTransactionId: "11111111-1111-1111-1111-111111111111",
      grossAmountMinor: 1000000,
      providerId: "22222222-2222-2222-2222-222222222222",
      eventKey: "PAY-1",
    });
    expect(x.allocatedAmountMinor).toBe("1000000");
    expect(x.entries.map((e: any) => e.amountMinor)).toEqual([
      "850000",
      "100000",
      "30000",
      "20000",
    ]);
    expect(ledger.save).toHaveBeenCalledTimes(4);
  });
  it("requires explicit consent version to activate a family", async () => {
    invitations.findOneBy.mockResolvedValue({
      id: "i1",
      token: "t",
      partnerId: "school1",
      programId: "p1",
      status: "INVITED",
    });
    programs.findOneBy.mockResolvedValue({
      id: "p1",
      checkinIntervalDays: 60,
      active: true,
    });
    await s.activateFamily("t", "u1", {
      consentVersion: "healthy-families-v1",
    });
    expect(families.save).toHaveBeenCalledWith(
      expect.objectContaining({
        consentVersion: "healthy-families-v1",
        status: "ACTIVE",
      }),
    );
  });
  it("activates an addressed invitation only for the matching SmartClinic identity", async () => {
    invitations.findOneBy.mockResolvedValue({
      id: "i1",
      token: "t",
      partnerId: "school1",
      programId: "p1",
      status: "INVITED",
      email: "Parent@Example.com",
      phone: null,
    });
    programs.findOneBy.mockResolvedValue({
      id: "p1",
      checkinIntervalDays: 60,
      active: true,
    });
    users.findOne.mockResolvedValue({
      id: "u1",
      emailNormalized: "parent@example.com",
      phoneNormalized: null,
    });
    await expect(
      s.activateFamily("t", "u1", { consentVersion: "healthy-families-v1" }),
    ).resolves.toMatchObject({ userId: "u1", status: "ACTIVE" });
  });
  it("rejects cross-account activation of an addressed invitation", async () => {
    invitations.findOneBy.mockResolvedValue({
      id: "i1",
      token: "t",
      partnerId: "school1",
      programId: "p1",
      status: "INVITED",
      email: "invited@example.com",
      phone: null,
    });
    users.findOne.mockResolvedValue({
      id: "other",
      emailNormalized: "other@example.com",
      phoneNormalized: null,
    });
    await expect(
      s.activateFamily("t", "other", {
        consentVersion: "healthy-families-v1",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(families.save).not.toHaveBeenCalled();
  });
  it("does not expose invitee contact details from public invitation lookup", async () => {
    invitations.findOneBy.mockResolvedValue({
      id: "i1",
      token: "secret",
      partnerId: "school1",
      programId: "p1",
      status: "INVITED",
      email: "parent@example.com",
      phone: "08000000000",
    });
    partners.findOneBy.mockResolvedValue({
      id: "school1",
      name: "Demo School",
      type: "SCHOOL",
    });
    const x: any = await s.invitation("secret");
    expect(x.email).toBeUndefined();
    expect(x.phone).toBeUndefined();
    expect(x.partner.name).toBe("Demo School");
  });
  it("scopes wellness events to the authenticated family owner", async () => {
    families.findOneBy.mockResolvedValue(null);
    await expect(
      s.recordWellness("user-a", {
        familyId: "11111111-1111-1111-1111-111111111111",
        eventType: "CHECK_IN",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(families.findOneBy).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-a" }),
    );
  });
  it("snapshots only partner and wellness amounts as an embedded surcharge", async () => {
    const familyRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: "family-1",
        userId: "user-1",
        partnerId: "school-1",
        programId: "program-1",
        status: "ACTIVE",
      }),
    };
    const programRepo = {
      findOneBy: jest.fn().mockResolvedValue({
        id: "program-1",
        partnerId: "school-1",
        providerBps: 8500,
        platformBps: 1000,
        partnerBps: 300,
        wellnessCreditBps: 200,
        currency: "NGN",
        active: true,
      }),
    };
    const manager: any = {
      getRepository: jest.fn((entity) =>
        entity === PartnerFamily
          ? familyRepo
          : entity === PartnerProgram
            ? programRepo
            : {},
      ),
    };
    await expect(
      s.preparePaymentAttribution(
        manager,
        "user-1",
        "family-1",
        "500000",
        "NGN",
      ),
    ).resolves.toMatchObject({
      surchargeAmountMinor: "25000",
      snapshot: {
        model: "EMBEDDED_SURCHARGE_V1",
        partnerAmountMinor: "15000",
        wellnessAmountMinor: "10000",
      },
    });
  });
  it("creates exactly two retry-safe surcharge ledger entries after payment", async () => {
    const rows: any[] = [];
    const ledgerRepo = {
      findOneBy: jest.fn(async ({ eventKey, beneficiaryType }) =>
        rows.find(
          (row) =>
            row.eventKey === eventKey &&
            row.beneficiaryType === beneficiaryType,
        ),
      ),
      create: (value: any) => value,
      save: jest.fn(async (value) => {
        rows.push(value);
        return value;
      }),
    };
    const manager: any = {
      getRepository: jest.fn((entity) =>
        entity === PartnerSplitLedger ? ledgerRepo : {},
      ),
    };
    const input: any = {
      funding: {
        amountMinor: "525000",
        baseAmountMinor: "500000",
        programmeSurchargeMinor: "25000",
        partnerFamilyId: "family-1",
        partnerProgramId: "program-1",
        programmeSnapshot: {
          model: "EMBEDDED_SURCHARGE_V1",
          partnerId: "school-1",
          partnerBps: 300,
          wellnessCreditBps: 200,
          partnerAmountMinor: "15000",
          wellnessAmountMinor: "10000",
          baseAmountMinor: "500000",
          currency: "NGN",
        },
      },
      care: { reference: "SC-CARE-1" },
      paymentTransaction: { id: "transaction-1", currency: "NGN" },
    };
    await s.allocateAttributedPayment(manager, input);
    await s.allocateAttributedPayment(manager, input);
    expect(ledgerRepo.save).toHaveBeenCalledTimes(2);
    expect(rows).toEqual([
      expect.objectContaining({
        beneficiaryType: "PARTNER",
        amountMinor: "15000",
        status: "HELD",
      }),
      expect.objectContaining({
        beneficiaryType: "WELLNESS_CREDIT",
        amountMinor: "10000",
        status: "HELD",
      }),
    ]);
  });
});
