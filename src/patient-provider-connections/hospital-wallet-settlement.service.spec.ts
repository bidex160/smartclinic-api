import { PharmacyCoordinationAllocation } from "../clinical-orders/entities/pharmacy-coordination-allocation.entity";
import { ClinicalOrder } from "../clinical-orders/entities/clinical-order.entity";
import { ClinicalOrderFulfillment } from "../clinical-orders/entities/clinical-order-fulfillment.entity";
import { DiagnosticFulfillmentFunding } from "../clinical-orders/entities/diagnostic-fulfillment-funding.entity";
import { PharmacyDispensing } from "../clinical-orders/entities/pharmacy-dispensing.entity";
import { PharmacyFulfillmentFunding } from "../clinical-orders/entities/pharmacy-fulfillment-funding.entity";
import { PharmacyFulfillmentMethod } from "../clinical-orders/enums/pharmacy-quote-status.enum";
import { CommissionRateSource } from "../commissions/enums/commission-rate-source.enum";
import { Patient } from "../patients/entities/patient.entity";
import { PatientProviderConnection } from "./entities/patient-provider-connection.entity";
import { PatientProviderConnectionStatus } from "./enums/patient-provider-connection-status.enum";
import { HospitalWalletSettlementService } from "./hospital-wallet-settlement.service";

describe("HospitalWalletSettlementService pharmacy coordination", () => {
  it("debits the complete bill while keeping pharmacy and coordination allocations separate", async () => {
    const patient = { id: "patient-1", userId: "user-1" };
    const connection = {
      id: "connection-1",
      reference: "SC-CONNECTION-1",
      patientId: patient.id,
      providerId: "hospital-1",
      status: PatientProviderConnectionStatus.CONNECTED,
    };
    const order = {
      id: "order-1",
      reference: "SC-ORD-WALLET",
      patientId: patient.id,
      orderingProviderId: connection.providerId,
    };
    const fulfillment = {
      id: "fulfillment-1",
      reference: "SC-ORF-WALLET",
      clinicalOrderId: order.id,
    };
    const funding: any = {
      id: "funding-1",
      quoteId: "quote-1",
      fulfillmentId: fulfillment.id,
      providerId: connection.providerId,
      grossAmountMinor: "12240",
      medicineAmountMinor: "10000",
      deliveryFeeMinor: "2000",
      doctorCoordinationBps: 100,
      doctorCoordinationAmountMinor: "100",
      doctorBeneficiaryUserId: "doctor-1",
      hospitalCoordinationBps: 100,
      hospitalCoordinationAmountMinor: "140",
      hospitalBeneficiaryProviderId: connection.providerId,
      commissionBps: 1000,
      commissionSource: CommissionRateSource.PLATFORM_DEFAULT,
      commissionAmountMinor: "1200",
      providerShareMinor: "10800",
      currency: "NGN",
      fulfillmentMethod: PharmacyFulfillmentMethod.HOSPITAL_DELIVERY,
    };
    const query = (rows: any[]) => {
      const qb: any = {};
      for (const name of ["setLock", "where", "andWhere"])
        qb[name] = jest.fn().mockReturnValue(qb);
      qb.getMany = jest.fn().mockResolvedValue(rows);
      return qb;
    };
    const allocations = {
      exists: jest.fn().mockResolvedValue(false),
      save: jest.fn(async (value: any) => value),
    };
    const dispensings = {
      exists: jest.fn().mockResolvedValue(false),
      save: jest.fn(async (value: any) => value),
    };
    const manager: any = {
      save: jest.fn(async (value: any) => value),
      getRepository: jest.fn((entity: any) => {
        if (entity === Patient)
          return { findOne: jest.fn().mockResolvedValue(patient) };
        if (entity === PatientProviderConnection)
          return { findOne: jest.fn().mockResolvedValue(connection) };
        if (entity === ClinicalOrder)
          return { find: jest.fn().mockResolvedValue([order]) };
        if (entity === ClinicalOrderFulfillment)
          return { createQueryBuilder: jest.fn(() => query([fulfillment])) };
        if (entity === DiagnosticFulfillmentFunding)
          return { createQueryBuilder: jest.fn(() => query([])) };
        if (entity === PharmacyFulfillmentFunding)
          return { createQueryBuilder: jest.fn(() => query([funding])) };
        if (entity === PharmacyCoordinationAllocation) return allocations;
        if (entity === PharmacyDispensing) return dispensings;
        return {};
      }),
    };
    const connections: any = {
      manager: { transaction: jest.fn(async (work: any) => work(manager)) },
    };
    const wallet = {
      debitHospitalPaymentWithManager: jest.fn().mockResolvedValue({
        debited: true,
        balanceMinor: 77760,
        walletEntryId: "wallet-entry-1",
      }),
    };
    const earnings = {
      createWalletFulfillmentEarning: jest.fn().mockResolvedValue({}),
    };
    const passes = {
      issueWithManager: jest.fn().mockResolvedValue({ reference: "PASS-1" }),
    };
    const subject = new HospitalWalletSettlementService(
      {} as any,
      connections,
      wallet as any,
      passes as any,
      earnings as any,
    );

    await subject.payAll("user-1", connection.reference);

    expect(wallet.debitHospitalPaymentWithManager).toHaveBeenCalledWith(
      manager,
      "user-1",
      12240,
      "NGN",
      expect.any(String),
      expect.any(Object),
    );
    expect(earnings.createWalletFulfillmentEarning).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        grossAmountMinor: "12000",
      }),
    );
    const earningInput =
      earnings.createWalletFulfillmentEarning.mock.calls[0][1];
    expect(earningInput.commercialSnapshot).toEqual(
      expect.objectContaining({
        commissionAmountMinor: "1200",
        providerShareMinor: "10800",
      }),
    );
    expect(allocations.save).toHaveBeenCalledTimes(2);
    expect(allocations.save).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentTransactionId: null,
        walletEntryId: "wallet-entry-1",
      }),
    );
    expect(dispensings.save).toHaveBeenCalledWith(
      expect.objectContaining({
        fulfillmentMethod: PharmacyFulfillmentMethod.HOSPITAL_DELIVERY,
      }),
    );
  });
});
