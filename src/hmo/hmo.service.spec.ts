import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { HmoService } from "./hmo.service";
import { UserRole } from "../users/enums/user-role.enum";
describe("HmoService Phase 1 gates", () => {
  const admin: any = { id: "admin-1", roles: [UserRole.ADMIN] };
  const hmos: any = {
    findOneBy: jest.fn().mockResolvedValue({ id: "h1", active: true }),
    save: jest.fn(async (x: any) => x),
    create: (x: any) => x,
  };
  const plans: any = {
    findOneBy: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(async (x: any) => x),
    create: (x: any) => x,
  };
  const coverages: any = {
    findOne: jest.fn(),
    save: jest.fn(async (x: any) => x),
    create: (x: any) => x,
  };
  const cases: any = {
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    save: jest.fn(async (x: any) => x),
    create: (x: any) => x,
  };
  const auths: any = {
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    save: jest.fn(async (x: any) => x),
    create: (x: any) => x,
  };
  const claims: any = {
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    save: jest.fn(async (x: any) => x),
    create: (x: any) => x,
  };
  const cares: any = { findOne: jest.fn(), findOneBy: jest.fn() };
  const enrollmentLeads: any = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(async (x: any) => x),
    create: (x: any) => x,
  };
  const access: any = { resolveAccessiblePatient: jest.fn() };
  const currentProvider: any = { resolveOperational: jest.fn() };
  const funding: any = {
    findOneBy: jest.fn(),
    save: jest.fn(async (x: any) => x),
  };
  let s: HmoService;
  beforeEach(() => {
    jest.clearAllMocks();
    s = new HmoService(
      hmos,
      plans,
      coverages,
      cases,
      auths,
      claims,
      cares,
      enrollmentLeads,
      funding,
      access,
      currentProvider,
    );
  });
  it("does not request PA until encounter eligibility is Eligible", async () => {
    cases.findOneBy.mockResolvedValue({
      id: "c1",
      eligibilityStatus: "PENDING",
    });
    await expect(
      s.requestAuthorization(
        "SCHMO-1",
        {
          requestedServices: [{ name: "Consultation" }],
        } as any,
        admin,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(auths.save).not.toHaveBeenCalled();
  });
  it("requires a PA code for approved authorization", async () => {
    auths.findOne.mockResolvedValue({ reference: "SCPA-1" });
    await expect(
      s.decide("SCPA-1", { status: "APPROVED", approvedServices: [] } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it("turns an approved HMO decision into only the authoritative co-pay obligation", async () => {
    auths.findOne.mockResolvedValue({
      id: "auth-1",
      reference: "SCPA-1",
      hmoCaseId: "case-1",
      hmoCase: { id: "case-1" },
    });
    const obligation: any = {
      fundingRoute: "HMO",
      amountMinor: "500000",
      status: "PENDING",
    };
    funding.findOneBy.mockResolvedValue(obligation);
    await s.decide("SCPA-1", {
      status: "APPROVED",
      authorizationCode: "LW-PA-1",
      approvedAmountMinor: 450000,
      copayAmountMinor: 50000,
    } as any);
    expect(obligation).toMatchObject({
      hmoAuthorizationId: "auth-1",
      hmoApprovedAmountMinor: "450000",
      amountMinor: "50000",
      status: "PENDING",
    });
  });
  it("does not expose a rejected HMO case as a payable co-pay", async () => {
    auths.findOne.mockResolvedValue({
      id: "auth-2",
      reference: "SCPA-2",
      hmoCaseId: "case-2",
      hmoCase: { id: "case-2" },
    });
    const obligation: any = { fundingRoute: "HMO", amountMinor: "500000" };
    funding.findOneBy.mockResolvedValue(obligation);
    await s.decide("SCPA-2", { status: "REJECTED" } as any);
    expect(obligation.hmoAuthorizationId).toBeNull();
    expect(obligation.amountMinor).toBe("500000");
  });
  it("does not generate a claim from authorization alone", async () => {
    auths.findOne.mockResolvedValue({
      id: "a1",
      hmoCase: { hospitalProviderId: "hospital-1" },
      status: "APPROVED",
      serviceConfirmedAt: null,
      deliveredServices: [],
    });
    await expect(s.generateClaim("SCPA-1", admin)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(claims.save).not.toHaveBeenCalled();
  });
  it("generates one claim only after delivered services are explicitly confirmed", async () => {
    auths.findOne.mockResolvedValue({
      id: "a1",
      hmoCase: { hospitalProviderId: "hospital-1" },
      status: "APPROVED",
      serviceConfirmedAt: new Date(),
      deliveredServices: [{ name: "Consultation" }],
      approvedAmountMinor: "500000",
      requestedAmountMinor: "500000",
      currency: "NGN",
    });
    claims.findOneBy.mockResolvedValue(null);
    await expect(s.generateClaim("SCPA-1", admin)).resolves.toMatchObject({
      status: "DRAFT",
      claimedAmountMinor: "500000",
    });
    expect(claims.save).toHaveBeenCalledTimes(1);
  });
  it("prevents a coverage record from being attached through another patient identity", async () => {
    access.resolveAccessiblePatient.mockRejectedValue(
      new Error("not accessible"),
    );
    await expect(
      s.addMine("u1", "SCP-OTHER", { hmoId: "h1", memberId: "LW-001" } as any),
    ).rejects.toThrow();
    expect(coverages.save).not.toHaveBeenCalled();
  });
  it("records HMO interest without creating or verifying coverage", async () => {
    access.resolveAccessiblePatient.mockResolvedValue({ id: "patient-1" });
    enrollmentLeads.findOne.mockResolvedValue(null);
    await expect(
      s.createEnrollmentLead("user-1", "SCP-1", {
        consentAcknowledged: true,
        preferredHmoId: "h1",
        employerOrganisation: "Example Employer",
      }),
    ).resolves.toMatchObject({
      userId: "user-1",
      patientId: "patient-1",
      preferredHmoId: "h1",
      status: "NEW",
    });
    expect(coverages.save).not.toHaveBeenCalled();
  });
  it("reuses an existing open enrollment lead for the same patient", async () => {
    access.resolveAccessiblePatient.mockResolvedValue({ id: "patient-1" });
    enrollmentLeads.findOne.mockResolvedValue({ id: "lead-1", status: "NEW" });
    await expect(
      s.createEnrollmentLead("user-1", "SCP-1", { consentAcknowledged: true }),
    ).resolves.toMatchObject({ id: "lead-1" });
    expect(enrollmentLeads.save).toHaveBeenCalledWith(expect.objectContaining({ consentCapturedAt: expect.any(Date) }));
  });
  it("snapshots the selected priced plan on an enrollment follow-up lead", async () => {
    access.resolveAccessiblePatient.mockResolvedValue({ id: "patient-1" });
    enrollmentLeads.findOne.mockResolvedValue(null);
    plans.findOne.mockResolvedValue({ id: 'plan-1', hmoId: 'h1', amountMinor: '800000', currency: 'NGN', active: true, hmo: { active: true } });
    await expect(s.createEnrollmentLead("user-1", "SCP-1", { consentAcknowledged: true, planId: 'plan-1' })).resolves.toMatchObject({
      preferredHmoId: 'h1', planId: 'plan-1', quotedAmountMinor: '800000', quotedCurrency: 'NGN', status: 'NEW',
    });
  });
  it('only lists active priced plans from active HMOs to patients', async () => {
    plans.find.mockResolvedValue([
      { id: 'priced', amountMinor: '800000', active: true, hmo: { active: true } },
      { id: 'unpriced', amountMinor: null, active: true, hmo: { active: true } },
      { id: 'inactive-hmo', amountMinor: '800000', active: true, hmo: { active: false } },
    ]);
    await expect(s.listPlans()).resolves.toEqual([{ id: 'priced', amountMinor: '800000', active: true, hmo: { active: true } }]);
  });
  it("keeps payment and reconciliation as separate finance states", async () => {
    const claim: any = {
      reference: "SCC-1",
      status: "SUBMITTED",
      externalClaimReference: "LW-C-1",
      platformFeeMinor: "0",
    };
    claims.findOneBy.mockResolvedValue(claim);
    await expect(
      s.recordClaimPayment("SCC-1", {
        paidAmountMinor: 1000000,
        platformFeeBps: 500,
        paymentReference: "PAY-1",
      } as any),
    ).resolves.toMatchObject({
      status: "PAID",
      platformFeeMinor: "50000",
      hospitalNetMinor: "950000",
      externalClaimReference: "LW-C-1",
      paymentReference: "PAY-1",
    });
    expect(claim.reconciledAt).toBeUndefined();
    claims.findOneBy.mockResolvedValue(claim);
    await expect(
      s.reconcileClaim("SCC-1", { reconciliationReference: "REC-1" } as any),
    ).resolves.toMatchObject({
      status: "RECONCILED",
      reconciliationReference: "REC-1",
    });
  });
  it("does not allow reconciliation before payment", async () => {
    claims.findOneBy.mockResolvedValue({
      reference: "SCC-2",
      status: "SUBMITTED",
    });
    await expect(
      s.reconcileClaim("SCC-2", { reconciliationReference: "REC-2" } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it("rejects HMO actions from a provider assigned to another hospital", async () => {
    const providerUser: any = {
      id: "provider-user-2",
      roles: [UserRole.PROVIDER],
    };
    currentProvider.resolveOperational.mockResolvedValue({ id: "hospital-2" });
    cases.findOneBy.mockResolvedValue({
      id: "case-1",
      hospitalProviderId: "hospital-1",
      eligibilityStatus: "ELIGIBLE",
    });

    await expect(
      s.requestAuthorization(
        "SCHMO-1",
        { requestedServices: [{ name: "Consultation" }] } as any,
        providerUser,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(auths.save).not.toHaveBeenCalled();
  });
  it("allows the hospital assigned to the HMO case to request authorization", async () => {
    const providerUser: any = {
      id: "provider-user-1",
      roles: [UserRole.PROVIDER],
    };
    currentProvider.resolveOperational.mockResolvedValue({ id: "hospital-1" });
    cases.findOneBy.mockResolvedValue({
      id: "case-1",
      hospitalProviderId: "hospital-1",
      eligibilityStatus: "ELIGIBLE",
    });

    await expect(
      s.requestAuthorization(
        "SCHMO-1",
        { requestedServices: [{ name: "Consultation" }] } as any,
        providerUser,
      ),
    ).resolves.toMatchObject({ hmoCaseId: "case-1", status: "PENDING" });
  });
});
