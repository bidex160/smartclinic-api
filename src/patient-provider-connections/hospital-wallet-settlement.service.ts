import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Patient } from "../patients/entities/patient.entity";
import { PatientProviderConnection } from "./entities/patient-provider-connection.entity";
import { PatientProviderConnectionStatus } from "./enums/patient-provider-connection-status.enum";
import { ClinicalOrder } from "../clinical-orders/entities/clinical-order.entity";
import { ClinicalOrderFulfillment } from "../clinical-orders/entities/clinical-order-fulfillment.entity";
import {
  DiagnosticFulfillmentFunding,
  DiagnosticFundingStatus,
} from "../clinical-orders/entities/diagnostic-fulfillment-funding.entity";
import { PharmacyFulfillmentFunding } from "../clinical-orders/entities/pharmacy-fulfillment-funding.entity";
import { PharmacyCoordinationAllocation } from "../clinical-orders/entities/pharmacy-coordination-allocation.entity";
import { PharmacyDispensing } from "../clinical-orders/entities/pharmacy-dispensing.entity";
import {
  PharmacyCoordinationAllocationStatus,
  PharmacyCoordinationAllocationType,
} from "../clinical-orders/enums/pharmacy-coordination-allocation.enum";
import {
  PharmacyDispensingStatus,
  PharmacyFundingStatus,
} from "../clinical-orders/enums/pharmacy-quote-status.enum";
import { PatientWalletService } from "../wallet/patient-wallet.service";
import { HospitalServicePassService } from "./hospital-service-pass.service";
import { ProviderEarningsService } from "../earnings/provider-earnings.service";
import { ProviderEarningSourceType } from "../earnings/enums/provider-earning-source-type.enum";
import { hospitalSettlementReference } from "./hospital-settlement-reference";
import { ClinicalOrderStatus } from "../clinical-orders/enums/clinical-order-status.enum";
import { ClinicalOrderFulfillmentStatus } from "../clinical-orders/enums/clinical-order-fulfillment-status.enum";
@Injectable()
export class HospitalWalletSettlementService {
  constructor(
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(PatientProviderConnection)
    private readonly connections: Repository<PatientProviderConnection>,
    private readonly wallet: PatientWalletService,
    private readonly passes: HospitalServicePassService,
    private readonly earnings: ProviderEarningsService,
  ) {}
  async payAll(userId: string, connectionReference: string) {
    return this.connections.manager.transaction(async (manager) => {
      const patient = await manager
        .getRepository(Patient)
        .findOne({ where: { userId } });
      if (!patient)
        throw new NotFoundException("Patient profile was not found");
      const connection = await manager
        .getRepository(PatientProviderConnection)
        .findOne({
          where: { reference: connectionReference, patientId: patient.id },
          lock: { mode: "pessimistic_write" },
        });
      if (
        !connection ||
        connection.status !== PatientProviderConnectionStatus.CONNECTED
      )
        throw new ConflictException("A connected hospital is required");
      const orders = await manager.getRepository(ClinicalOrder).find({
        where: {
          patientId: patient.id,
          orderingProviderId: connection.providerId,
          status: ClinicalOrderStatus.ISSUED,
        },
      });
      const orderIds = orders.map((o) => o.id);
      if (!orderIds.length)
        throw new ConflictException("There are no hospital requests to pay");
      const fulfillments = await manager
        .getRepository(ClinicalOrderFulfillment)
        .createQueryBuilder("f")
        .setLock("pessimistic_write")
        .where("f.clinicalOrderId IN (:...ids)", { ids: orderIds })
        .andWhere("f.status <> :cancelled", {
          cancelled: ClinicalOrderFulfillmentStatus.CANCELLED,
        })
        .getMany();
      const fulfillmentIds = fulfillments.map((f) => f.id);
      if (!fulfillmentIds.length)
        throw new ConflictException("There are no payable hospital requests");
      const diagnostic = await manager
        .getRepository(DiagnosticFulfillmentFunding)
        .createQueryBuilder("f")
        .setLock("pessimistic_write")
        .where("f.fulfillmentId IN (:...ids)", { ids: fulfillmentIds })
        .andWhere("f.status=:status", {
          status: DiagnosticFundingStatus.PENDING,
        })
        .getMany();
      const pharmacy = await manager
        .getRepository(PharmacyFulfillmentFunding)
        .createQueryBuilder("f")
        .setLock("pessimistic_write")
        .where("f.fulfillmentId IN (:...ids)", { ids: fulfillmentIds })
        .andWhere("f.status=:status", { status: PharmacyFundingStatus.PENDING })
        .getMany();
      const all = [
        ...diagnostic.map((f) => ({
          kind: "DIAGNOSTIC",
          id: f.id,
          fulfillmentId: f.fulfillmentId,
          providerId: f.providerId,
          amountMinor: f.grossAmountMinor,
          currency: f.currency,
        })),
        ...pharmacy.map((f) => ({
          kind: "PHARMACY",
          id: f.id,
          fulfillmentId: f.fulfillmentId,
          providerId: f.providerId,
          amountMinor: f.grossAmountMinor,
          currency: f.currency,
        })),
      ];
      if (!all.length)
        throw new ConflictException("There are no payable hospital requests");
      if (all.some((x) => x.providerId !== connection.providerId))
        throw new ConflictException(
          "Pay all currently supports services fulfilled by this hospital only",
        );
      const currencies = [...new Set(all.map((x) => x.currency))];
      if (currencies.length !== 1)
        throw new ConflictException("Hospital requests must use one currency");
      const amount = all.reduce((s, x) => s + BigInt(x.amountMinor), 0n);
      if (amount <= 0n)
        throw new ConflictException(
          "There is no positive hospital balance to pay",
        );
      const settlementReference = hospitalSettlementReference(
        connection.reference,
        all.map((x) => x.id),
      );
      const debit = await this.wallet.debitHospitalPaymentWithManager(
        manager,
        userId,
        Number(amount),
        currencies[0],
        settlementReference,
        { connectionReference, items: all.map((x) => x.id) },
      );
      if (!debit.debited)
        throw new ConflictException(
          "These hospital requests have already been settled",
        );
      const now = new Date();
      for (const f of diagnostic) {
        f.status = DiagnosticFundingStatus.PAID;
        f.paidAt = now;
        await manager.save(f);
      }
      for (const f of pharmacy) {
        f.status = PharmacyFundingStatus.PAID;
        f.paidAt = now;
        await manager.save(f);
      }
      for (const f of diagnostic) {
        const fulfillment = fulfillments.find((x) => x.id === f.fulfillmentId)!;
        await this.earnings.createWalletFulfillmentEarning(manager, {
          providerId: f.providerId,
          fulfillmentReference: fulfillment.reference,
          grossAmountMinor: f.grossAmountMinor,
          currency: f.currency,
          sourceType: ProviderEarningSourceType.DIAGNOSTIC_FULFILLMENT,
        });
      }
      const fulfillmentById = new Map(fulfillments.map((f) => [f.id, f]));
      const orderById = new Map(orders.map((o) => [o.id, o]));
      const allocationRepository = manager.getRepository(
        PharmacyCoordinationAllocation,
      );
      for (const f of pharmacy) {
        const fulfillment = fulfillmentById.get(f.fulfillmentId)!;
        const order = orderById.get(fulfillment.clinicalOrderId)!;
        await this.earnings.createWalletFulfillmentEarning(manager, {
          providerId: f.providerId,
          fulfillmentReference: fulfillment.reference,
          grossAmountMinor: (
            BigInt(f.medicineAmountMinor) + BigInt(f.deliveryFeeMinor)
          ).toString(),
          currency: f.currency,
          sourceType: ProviderEarningSourceType.PHARMACY_FULFILLMENT,
          commercialSnapshot: {
            commissionBps: f.commissionBps,
            commissionSource: f.commissionSource,
            commissionAmountMinor: f.commissionAmountMinor,
            providerShareMinor: f.providerShareMinor,
          },
        });
        if (
          BigInt(f.doctorCoordinationAmountMinor) > 0n &&
          !(await allocationRepository.exists({
            where: {
              fundingId: f.id,
              type: PharmacyCoordinationAllocationType.DOCTOR,
            },
          }))
        )
          await allocationRepository.save({
            fundingId: f.id,
            paymentTransactionId: null,
            walletEntryId: debit.walletEntryId,
            type: PharmacyCoordinationAllocationType.DOCTOR,
            beneficiaryUserId: f.doctorBeneficiaryUserId,
            beneficiaryProviderId: null,
            sourceOrderReference: order.reference,
            sourceFulfillmentReference: fulfillment.reference,
            basisAmountMinor: f.medicineAmountMinor,
            bpsSnapshot: f.doctorCoordinationBps,
            amountMinor: f.doctorCoordinationAmountMinor,
            currency: f.currency,
            status: PharmacyCoordinationAllocationStatus.HELD,
            payableAt: null,
            settledAt: null,
            reversedAt: null,
          });
        if (
          f.hospitalBeneficiaryProviderId &&
          BigInt(f.hospitalCoordinationAmountMinor) > 0n &&
          !(await allocationRepository.exists({
            where: {
              fundingId: f.id,
              type: PharmacyCoordinationAllocationType.HOSPITAL,
            },
          }))
        )
          await allocationRepository.save({
            fundingId: f.id,
            paymentTransactionId: null,
            walletEntryId: debit.walletEntryId,
            type: PharmacyCoordinationAllocationType.HOSPITAL,
            beneficiaryUserId: null,
            beneficiaryProviderId: f.hospitalBeneficiaryProviderId,
            sourceOrderReference: order.reference,
            sourceFulfillmentReference: fulfillment.reference,
            basisAmountMinor: f.medicineAmountMinor,
            bpsSnapshot: f.hospitalCoordinationBps,
            amountMinor: f.hospitalCoordinationAmountMinor,
            currency: f.currency,
            status: PharmacyCoordinationAllocationStatus.HELD,
            payableAt: null,
            settledAt: null,
            reversedAt: null,
          });
        if (
          !(await manager
            .getRepository(PharmacyDispensing)
            .exists({ where: { fulfillmentId: fulfillment.id } }))
        )
          await manager.getRepository(PharmacyDispensing).save({
            fulfillmentId: fulfillment.id,
            quoteId: f.quoteId,
            fundingId: f.id,
            status: PharmacyDispensingStatus.READY_TO_DISPENSE,
            fulfillmentMethod: f.fulfillmentMethod,
            startedAt: null,
            readyAt: null,
            completedAt: null,
          });
      }
      const covered = all.map((x) => {
        const f = fulfillmentById.get(x.fulfillmentId)!;
        const o = orderById.get(f.clinicalOrderId)!;
        return {
          orderReference: o.reference,
          fulfillmentReference: f.reference,
          amountMinor: Number(x.amountMinor),
        };
      });
      const pass = await this.passes.issueWithManager(manager, {
        connectionId: connection.id,
        patientId: patient.id,
        providerId: connection.providerId,
        amountMinor: Number(amount),
        currency: currencies[0],
        coveredServices: covered,
        paidAt: now,
      });
      return {
        settlementReference,
        amountMinor: Number(amount),
        currency: currencies[0],
        walletBalanceMinor: debit.balanceMinor,
        servicePass: pass,
      };
    });
  }
}
