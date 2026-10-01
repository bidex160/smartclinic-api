import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import { appConfig } from "../config/app.config";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { Booking } from "../bookings/entities/booking.entity";
import { BookingStatus } from "../bookings/enums/booking-status.enum";
import { CommissionResolutionService } from "../commissions/commission-resolution.service";
import { calculateCommission } from "../commissions/commission-calculator";
import { CommissionRateSource } from "../commissions/enums/commission-rate-source.enum";
import { PaymentTransaction } from "../payments/entities/payment-transaction.entity";
import { PaymentTransactionStatus } from "../payments/enums/payment-transaction-status.enum";
import { PaymentTransactionType } from "../payments/enums/payment-transaction-type.enum";
import { Provider } from "../providers/entities/provider.entity";
import { RewardBookingRedemption } from "../rewards/entities/reward-booking-redemption.entity";
import { RewardBookingRedemptionStatus } from "../rewards/enums/reward-booking-redemption-status.enum";
import { User } from "../users/entities/user.entity";
import { CareRequest } from "../care-requests/entities/care-request.entity";
import {
  DiagnosticExecution,
  DiagnosticExecutionStatus,
} from "../clinical-orders/entities/diagnostic-execution.entity";
import { PharmacyDispensing } from "../clinical-orders/entities/pharmacy-dispensing.entity";
import { PharmacyDispensingStatus } from "../clinical-orders/enums/pharmacy-quote-status.enum";
import { ClinicalOrderFulfillment } from "../clinical-orders/entities/clinical-order-fulfillment.entity";
import {
  AdminProviderEarningListQueryDto,
  ProviderEarningListQueryDto,
} from "./dto/provider-earning.dto";
import { ProviderEarning } from "./entities/provider-earning.entity";
import { ProviderEarningStatusHistory } from "./entities/provider-earning-status-history.entity";
import { ProviderEarningSourceType } from "./enums/provider-earning-source-type.enum";
import { ProviderEarningStatus } from "./enums/provider-earning-status.enum";

@Injectable()
export class ProviderEarningsService {
  constructor(
    @InjectRepository(ProviderEarning)
    private readonly earnings: Repository<ProviderEarning>,
    @InjectRepository(Provider)
    private readonly providers: Repository<Provider>,
    private readonly commissions: CommissionResolutionService,
    @Optional() @Inject(appConfig.KEY) private readonly config?: ConfigType<typeof appConfig>,
  ) {}

  /**
   * When a lab or pharmacy job came to this provider as a referral from
   * another provider, moves the referral fee (3% by default) out of this
   * provider's share into referralShareMinor, and records a held earning for
   * the referrer. The patient's price never changes.
   */
  async applyProviderReferral(manager: EntityManager, earning: ProviderEarning): Promise<ProviderEarning | null> {
    if (earning.sourceType !== ProviderEarningSourceType.PHARMACY_FULFILLMENT && earning.sourceType !== ProviderEarningSourceType.DIAGNOSTIC_FULFILLMENT) return null;
    const fulfillment = await manager.getRepository(ClinicalOrderFulfillment).findOne({ where: { reference: earning.sourceReference } });
    const referrerId = fulfillment?.referredFromFulfillmentId ? fulfillment.recommendedByProviderId : null;
    if (!referrerId || referrerId === earning.providerId) return null;
    if (!(await this.sourceTypeSupported(manager, ProviderEarningSourceType.PROVIDER_REFERRAL))) return null;
    const repository = manager.getRepository(ProviderEarning);
    const existing = await repository.findOne({
      where: { sourceType: ProviderEarningSourceType.PROVIDER_REFERRAL, sourceReference: earning.sourceReference },
      lock: { mode: "pessimistic_write" },
    });
    if (existing) return existing;
    const bps = this.providerReferralBps();
    const gross = BigInt(earning.grossAmountMinor);
    const fee = (gross * BigInt(bps) + 5000n) / 10000n;
    const providerShare = BigInt(earning.providerShareMinor);
    // A fee that doesn't fit the provider's share is skipped rather than failing the patient's payment.
    if (fee <= 0n || fee > providerShare) return null;
    earning.referralShareMinor = (BigInt(earning.referralShareMinor ?? "0") + fee).toString();
    earning.providerShareMinor = (providerShare - fee).toString();
    await repository.save(earning);
    const referral = await repository.save(
      repository.create({
        providerId: referrerId,
        paymentTransactionId: null,
        sourceType: ProviderEarningSourceType.PROVIDER_REFERRAL,
        sourceReference: earning.sourceReference,
        currency: earning.currency,
        grossAmountMinor: fee.toString(),
        commissionBps: 0,
        commissionSource: earning.commissionSource,
        commissionAmountMinor: "0",
        referralShareMinor: "0",
        providerShareMinor: fee.toString(),
        status: ProviderEarningStatus.HELD,
        payableAt: null,
        settledAt: null,
      }),
    );
    await manager.getRepository(ProviderEarningStatusHistory).save({
      providerEarningId: referral.id,
      fromStatus: null,
      toStatus: ProviderEarningStatus.HELD,
      actorUserId: null,
      reasonCode: "PROVIDER_REFERRAL_FEE_HELD",
      reasonNote: `${bps / 100}% of a referred job; payable once the job is completed`,
    });
    return referral;
  }

  /** Releases the referrer's fee once the referred job's own earning is payable. */
  async releaseProviderReferral(manager: EntityManager, sourceReference: string, actorUserId: string | null) {
    // Querying an enum value the database doesn't have yet would abort the whole transaction.
    if (!(await this.sourceTypeSupported(manager, ProviderEarningSourceType.PROVIDER_REFERRAL))) return null;
    const repository = manager.getRepository(ProviderEarning);
    const referral = await repository.findOne({
      where: { sourceType: ProviderEarningSourceType.PROVIDER_REFERRAL, sourceReference },
      lock: { mode: "pessimistic_write" },
    });
    if (!referral || referral.status !== ProviderEarningStatus.HELD) return referral;
    referral.status = ProviderEarningStatus.PAYABLE;
    referral.payableAt = new Date();
    await repository.save(referral);
    await manager.getRepository(ProviderEarningStatusHistory).save({
      providerEarningId: referral.id,
      fromStatus: ProviderEarningStatus.HELD,
      toStatus: ProviderEarningStatus.PAYABLE,
      actorUserId,
      reasonCode: "PROVIDER_REFERRAL_JOB_COMPLETED",
      reasonNote: null,
    });
    return referral;
  }

  /**
   * Lab jobs paid by card. Uses the provider's configured commission; when
   * none is configured nothing is recorded, as before, so payment never fails here.
   */
  async createHeldDiagnosticFulfillmentEarning(
    manager: EntityManager,
    input: { providerId: string; fulfillmentReference: string; grossAmountMinor: string; currency: string; paymentTransaction: PaymentTransaction },
  ) {
    const repository = manager.getRepository(ProviderEarning);
    const sourceType = ProviderEarningSourceType.DIAGNOSTIC_FULFILLMENT;
    if (!(await this.sourceTypeSupported(manager, sourceType))) return null;
    const existing = await repository.findOne({ where: { sourceType, sourceReference: input.fulfillmentReference }, lock: { mode: "pessimistic_write" } });
    if (existing) return existing;
    const resolution = await this.commissions.resolveForProvider(input.providerId, manager);
    if (!resolution.configured) return null;
    const calculation = calculateCommission(BigInt(input.grossAmountMinor), resolution.rateBasisPoints);
    const earning = await repository.save(
      repository.create({
        providerId: input.providerId,
        paymentTransactionId: input.paymentTransaction.id,
        sourceType,
        sourceReference: input.fulfillmentReference,
        currency: input.currency,
        grossAmountMinor: input.grossAmountMinor,
        commissionBps: resolution.rateBasisPoints,
        commissionSource: resolution.source,
        commissionAmountMinor: calculation.commissionAmountMinor.toString(),
        providerShareMinor: calculation.providerShareMinor.toString(),
        status: ProviderEarningStatus.HELD,
        payableAt: null,
        settledAt: null,
      }),
    );
    await manager.getRepository(ProviderEarningStatusHistory).save({
      providerEarningId: earning.id,
      fromStatus: null,
      toStatus: ProviderEarningStatus.HELD,
      actorUserId: null,
      reasonCode: "DIAGNOSTIC_PAYMENT_SETTLED",
      reasonNote: null,
    });
    await this.applyProviderReferral(manager, earning);
    return earning;
  }

  private readonly supportedSourceTypes = new Set<string>();

  /**
   * True once the database's earning-type enum has this value. Guards new
   * earning types deployed before their migration has run, so a payment is
   * never rolled back because an earning couldn't be recorded.
   */
  private async sourceTypeSupported(manager: EntityManager, type: ProviderEarningSourceType): Promise<boolean> {
    if (this.supportedSourceTypes.has(type)) return true;
    try {
      const rows = await manager.query(`SELECT $1 = ANY(enum_range(NULL::provider_earning_source_type_enum)::text[]) AS "supported"`, [type]);
      if (rows?.[0]?.supported) {
        this.supportedSourceTypes.add(type);
        return true;
      }
    } catch {
      // Not Postgres (tests) or no permission: assume supported, as before.
      return true;
    }
    return false;
  }

  private providerReferralBps(): number {
    const value = this.config?.referrals?.providerReferralBps;
    return Number.isInteger(value) && value! >= 0 && value! <= 2000 ? value! : 300;
  }

  async createHeldHealthCheckEarning(
    manager: EntityManager,
    booking: Booking,
    paymentTransaction: PaymentTransaction | null,
  ): Promise<ProviderEarning> {
    if (
      !booking.commercialProviderId ||
      !booking.quotedAmount ||
      !booking.currency
    )
      throw new ConflictException(
        "Health Check booking has no authoritative Provider commercial snapshot",
      );
    const sourceType = ProviderEarningSourceType.HEALTH_CHECK;
    const repository = manager.getRepository(ProviderEarning);
    const existing = await repository.findOne({
      where: { sourceType, sourceReference: booking.bookingReference },
      lock: { mode: "pessimistic_write" },
    });
    if (existing) {
      if (
        paymentTransaction &&
        existing.paymentTransactionId &&
        existing.paymentTransactionId !== paymentTransaction.id
      )
        throw new ConflictException(
          "Health Check earning belongs to another payment transaction",
        );
      return existing;
    }
    if (paymentTransaction) {
      if (
        paymentTransaction.status !== PaymentTransactionStatus.SUCCEEDED ||
        paymentTransaction.transactionType !== PaymentTransactionType.COLLECTION
      )
        throw new ConflictException(
          "Provider earning requires a successful collection transaction",
        );
      if (paymentTransaction.currency !== booking.currency)
        throw new ConflictException(
          "Payment transaction currency does not match the Health Check commercial snapshot",
        );
    }
    const grossMinor = this.toMinor(booking.quotedAmount);
    const redemption = await manager
      .getRepository(RewardBookingRedemption)
      .findOne({
        where: {
          bookingId: booking.id,
          status: RewardBookingRedemptionStatus.SETTLED,
        },
      });
    const fundedMinor =
      (paymentTransaction ? this.toMinor(paymentTransaction.amount) : 0n) +
      (redemption ? BigInt(redemption.amountMinor) : 0n);
    if (fundedMinor !== grossMinor)
      throw new ConflictException(
        "Settled funding does not match the Health Check commercial snapshot",
      );
    const resolution = await this.commissions.requireForProvider(
      booking.commercialProviderId,
      manager,
    );
    const calculation = calculateCommission(
      grossMinor,
      resolution.rateBasisPoints,
    );
    const status =
      booking.status === BookingStatus.COMPLETED
        ? ProviderEarningStatus.PAYABLE
        : ProviderEarningStatus.HELD;
    const now = new Date();
    const earning = await repository.save(
      repository.create({
        providerId: booking.commercialProviderId,
        paymentTransactionId: paymentTransaction?.id ?? null,
        sourceType,
        sourceReference: booking.bookingReference,
        currency: booking.currency,
        grossAmountMinor: grossMinor.toString(),
        commissionBps: resolution.rateBasisPoints,
        commissionSource: resolution.source,
        commissionAmountMinor: calculation.commissionAmountMinor.toString(),
        providerShareMinor: calculation.providerShareMinor.toString(),
        status,
        payableAt: status === ProviderEarningStatus.PAYABLE ? now : null,
        settledAt: null,
      }),
    );
    await manager.getRepository(ProviderEarningStatusHistory).save({
      providerEarningId: earning.id,
      fromStatus: null,
      toStatus: status,
      actorUserId: null,
      reasonCode:
        status === ProviderEarningStatus.PAYABLE
          ? "HEALTH_CHECK_ALREADY_COMPLETED"
          : "HEALTH_CHECK_PAYMENT_SETTLED",
      reasonNote: null,
    });
    return earning;
  }

  async createHeldGeneralCareEarning(
    manager: EntityManager,
    care: CareRequest,
    paymentTransaction: PaymentTransaction,
  ): Promise<ProviderEarning> {
    if (
      !care.assignedProviderId ||
      care.servicePriceMinor == null ||
      !care.serviceCurrency ||
      BigInt(care.servicePriceMinor) <= 0n
    )
      throw new ConflictException(
        "General Care request has no paid Provider commercial snapshot",
      );
    if (
      paymentTransaction.status !== PaymentTransactionStatus.SUCCEEDED ||
      paymentTransaction.transactionType !==
        PaymentTransactionType.COLLECTION ||
      paymentTransaction.currency !== care.serviceCurrency ||
      this.toMinor(paymentTransaction.amount) < BigInt(care.servicePriceMinor)
    )
      throw new ConflictException(
        "Payment transaction does not match the General Care commercial snapshot",
      );
    const repository = manager.getRepository(ProviderEarning);
    const sourceType = ProviderEarningSourceType.GENERAL_CARE;
    const existing = await repository.findOne({
      where: { sourceType, sourceReference: care.reference },
      lock: { mode: "pessimistic_write" },
    });
    if (existing) {
      if (existing.paymentTransactionId !== paymentTransaction.id)
        throw new ConflictException(
          "General Care earning belongs to another payment transaction",
        );
      return existing;
    }
    const resolution = await this.commissions.requireForProvider(
      care.assignedProviderId,
      manager,
    );
    const calculation = calculateCommission(
      BigInt(care.servicePriceMinor),
      resolution.rateBasisPoints,
    );
    const earning = await repository.save(
      repository.create({
        providerId: care.assignedProviderId,
        paymentTransactionId: paymentTransaction.id,
        sourceType,
        sourceReference: care.reference,
        currency: care.serviceCurrency,
        grossAmountMinor: care.servicePriceMinor,
        commissionBps: resolution.rateBasisPoints,
        commissionSource: resolution.source,
        commissionAmountMinor: calculation.commissionAmountMinor.toString(),
        providerShareMinor: calculation.providerShareMinor.toString(),
        status: ProviderEarningStatus.HELD,
        payableAt: null,
        settledAt: null,
      }),
    );
    await manager.getRepository(ProviderEarningStatusHistory).save({
      providerEarningId: earning.id,
      fromStatus: null,
      toStatus: ProviderEarningStatus.HELD,
      actorUserId: null,
      reasonCode: "GENERAL_CARE_PAYMENT_SETTLED",
      reasonNote: null,
    });
    return earning;
  }

  async markGeneralCarePayable(
    manager: EntityManager,
    careRequestReference: string,
    actorUserId: string,
  ): Promise<ProviderEarning | null> {
    const repository = manager.getRepository(ProviderEarning);
    const earning = await repository.findOne({
      where: {
        sourceType: ProviderEarningSourceType.GENERAL_CARE,
        sourceReference: careRequestReference,
      },
      lock: { mode: "pessimistic_write" },
    });
    if (!earning) return null;
    if (
      [ProviderEarningStatus.PAYABLE, ProviderEarningStatus.SETTLED].includes(
        earning.status,
      )
    )
      return earning;
    if (earning.status !== ProviderEarningStatus.HELD)
      throw new ConflictException(
        `Provider earning in ${earning.status} cannot become payable`,
      );
    earning.status = ProviderEarningStatus.PAYABLE;
    earning.payableAt = new Date();
    await repository.save(earning);
    await manager.getRepository(ProviderEarningStatusHistory).save({
      providerEarningId: earning.id,
      fromStatus: ProviderEarningStatus.HELD,
      toStatus: ProviderEarningStatus.PAYABLE,
      actorUserId,
      reasonCode: "GENERAL_CARE_COMPLETED",
      reasonNote: null,
    });
    return earning;
  }
  async createHeldPharmacyFulfillmentEarning(
    manager: EntityManager,
    input: {
      providerId: string;
      fulfillmentReference: string;
      grossAmountMinor: string;
      currency: string;
      commissionBps: number;
      commissionSource: CommissionRateSource;
      commissionAmountMinor: string;
      providerShareMinor: string;
      collectedAmountMinor?: string;
      paymentTransaction: PaymentTransaction;
    },
  ) {
    const repository = manager.getRepository(ProviderEarning);
    const sourceType = ProviderEarningSourceType.PHARMACY_FULFILLMENT;
    const existing = await repository.findOne({
      where: { sourceType, sourceReference: input.fulfillmentReference },
      lock: { mode: "pessimistic_write" },
    });
    if (existing) {
      if (existing.paymentTransactionId !== input.paymentTransaction.id)
        throw new ConflictException(
          "Pharmacy earning belongs to another payment transaction",
        );
      return existing;
    }
    const gross = BigInt(input.grossAmountMinor),
      commission = BigInt(input.commissionAmountMinor),
      providerShare = BigInt(input.providerShareMinor);
    if (
      input.paymentTransaction.status !== PaymentTransactionStatus.SUCCEEDED ||
      input.paymentTransaction.transactionType !==
        PaymentTransactionType.COLLECTION ||
      input.paymentTransaction.currency !== input.currency ||
      this.toMinor(input.paymentTransaction.amount) !== BigInt(input.collectedAmountMinor ?? input.grossAmountMinor) ||
      input.commissionBps < 0 ||
      input.commissionBps > 10000 ||
      commission < 0n ||
      providerShare < 0n ||
      commission + providerShare !== gross
    )
      throw new ConflictException(
        "Payment transaction does not match pharmacy funding snapshot",
      );
    const earning = await repository.save(
      repository.create({
        providerId: input.providerId,
        paymentTransactionId: input.paymentTransaction.id,
        sourceType,
        sourceReference: input.fulfillmentReference,
        currency: input.currency,
        grossAmountMinor: input.grossAmountMinor,
        commissionBps: input.commissionBps,
        commissionSource: input.commissionSource,
        commissionAmountMinor: input.commissionAmountMinor,
        providerShareMinor: input.providerShareMinor,
        status: ProviderEarningStatus.HELD,
        payableAt: null,
        settledAt: null,
      }),
    );
    await manager.getRepository(ProviderEarningStatusHistory).save({
      providerEarningId: earning.id,
      fromStatus: null,
      toStatus: ProviderEarningStatus.HELD,
      actorUserId: null,
      reasonCode: "PHARMACY_PAYMENT_SETTLED",
      reasonNote: null,
    });
    await this.applyProviderReferral(manager, earning);
    return earning;
  }
  async markWalletDiagnosticPayable(
    manager: EntityManager,
    fulfillmentReference: string,
    actorUserId: string,
  ) {
    const repository = manager.getRepository(ProviderEarning);
    const earning = await repository.findOne({
      where: {
        sourceType: ProviderEarningSourceType.DIAGNOSTIC_FULFILLMENT,
        sourceReference: fulfillmentReference,
      },
      lock: { mode: "pessimistic_write" },
    });
    if (!earning) return null;
    if (
      [ProviderEarningStatus.PAYABLE, ProviderEarningStatus.SETTLED].includes(
        earning.status,
      )
    )
      return earning;
    if (earning.status !== ProviderEarningStatus.HELD)
      throw new ConflictException("Diagnostic earning cannot become payable");
    const now = new Date();
    if (earning.payableAt && earning.payableAt.getTime() > now.getTime())
      return earning;
    earning.status = ProviderEarningStatus.PAYABLE;
    earning.payableAt = now;
    await repository.save(earning);
    await manager
      .getRepository(ProviderEarningStatusHistory)
      .save({
        providerEarningId: earning.id,
        fromStatus: ProviderEarningStatus.HELD,
        toStatus: ProviderEarningStatus.PAYABLE,
        actorUserId,
        reasonCode: "DIAGNOSTIC_RESULT_COMPLETED",
        reasonNote: null,
      });
    await this.releaseProviderReferral(manager, fulfillmentReference, actorUserId);
    return earning;
  }

  async releaseMaturedCompletedWalletEarnings(manager?: EntityManager) {
    const m = manager ?? this.earnings.manager;
    const rows = await m
      .getRepository(ProviderEarning)
      .createQueryBuilder("e")
      .where("e.status=:status", { status: ProviderEarningStatus.HELD })
      .andWhere("e.paymentTransactionId IS NULL")
      .andWhere("e.payableAt IS NOT NULL AND e.payableAt<=:now", {
        now: new Date(),
      })
      .andWhere("e.sourceType IN (:...types)", {
        types: [
          ProviderEarningSourceType.PHARMACY_FULFILLMENT,
          ProviderEarningSourceType.DIAGNOSTIC_FULFILLMENT,
        ],
      })
      .getMany();
    let released = 0;
    for (const earning of rows) {
      const fulfillment = await m
        .getRepository(ClinicalOrderFulfillment)
        .findOne({ where: { reference: earning.sourceReference } });
      if (!fulfillment) continue;
      let completed = false;
      if (
        earning.sourceType === ProviderEarningSourceType.PHARMACY_FULFILLMENT
      ) {
        completed = await m
          .getRepository(PharmacyDispensing)
          .exists({
            where: {
              fulfillmentId: fulfillment.id,
              status: PharmacyDispensingStatus.COMPLETED,
            },
          });
      } else {
        completed = await m
          .getRepository(DiagnosticExecution)
          .exists({
            where: {
              fulfillmentId: fulfillment.id,
              status: DiagnosticExecutionStatus.RESULT_READY,
            },
          });
      }
      if (!completed) continue;
      const locked = await m
        .getRepository(ProviderEarning)
        .findOne({
          where: { id: earning.id },
          lock: manager ? { mode: "pessimistic_write" } : undefined,
        });
      if (!locked || locked.status !== ProviderEarningStatus.HELD) continue;
      locked.status = ProviderEarningStatus.PAYABLE;
      await m.getRepository(ProviderEarning).save(locked);
      await m
        .getRepository(ProviderEarningStatusHistory)
        .save({
          providerEarningId: locked.id,
          fromStatus: ProviderEarningStatus.HELD,
          toStatus: ProviderEarningStatus.PAYABLE,
          actorUserId: null,
          reasonCode: "WALLET_SETTLEMENT_HOLD_MATURED",
          reasonNote: "Service completion verified before release",
        });
      await this.releaseProviderReferral(m, locked.sourceReference, null);
      released++;
    }
    return { released };
  }

  async createWalletFulfillmentEarning(
    manager: EntityManager,
    input: {
      providerId: string;
      fulfillmentReference: string;
      grossAmountMinor: string;
      currency: string;
      sourceType:
        | ProviderEarningSourceType.PHARMACY_FULFILLMENT
        | ProviderEarningSourceType.DIAGNOSTIC_FULFILLMENT;
      commercialSnapshot?: {
        commissionBps: number;
        commissionSource: CommissionRateSource;
        commissionAmountMinor: string;
        providerShareMinor: string;
      };
    },
  ) {
    const repository = manager.getRepository(ProviderEarning);
    const existing = await repository.findOne({
      where: {
        sourceType: input.sourceType,
        sourceReference: input.fulfillmentReference,
      },
      lock: { mode: "pessimistic_write" },
    });
    if (existing) {
      if (
        existing.providerId !== input.providerId ||
        existing.currency !== input.currency ||
        existing.grossAmountMinor !== input.grossAmountMinor
      )
        throw new ConflictException(
          "Existing wallet earning does not match hospital settlement",
        );
      return existing;
    }
    const resolution = input.commercialSnapshot
      ? {
          rateBasisPoints: input.commercialSnapshot.commissionBps,
          source: input.commercialSnapshot.commissionSource,
        }
      : await this.commissions.requireForProvider(input.providerId, manager);
    const calculation = input.commercialSnapshot
      ? {
          commissionAmountMinor: BigInt(
            input.commercialSnapshot.commissionAmountMinor,
          ),
          providerShareMinor: BigInt(
            input.commercialSnapshot.providerShareMinor,
          ),
        }
      : calculateCommission(
          BigInt(input.grossAmountMinor),
          resolution.rateBasisPoints,
        );
    if (
      calculation.commissionAmountMinor + calculation.providerShareMinor !==
      BigInt(input.grossAmountMinor)
    )
      throw new ConflictException(
        "Hospital commercial snapshot does not equal gross amount",
      );
    const payableAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const earning = await repository.save(
      repository.create({
        providerId: input.providerId,
        paymentTransactionId: null,
        sourceType: input.sourceType,
        sourceReference: input.fulfillmentReference,
        currency: input.currency,
        grossAmountMinor: input.grossAmountMinor,
        commissionBps: resolution.rateBasisPoints,
        commissionSource: resolution.source,
        commissionAmountMinor: calculation.commissionAmountMinor.toString(),
        providerShareMinor: calculation.providerShareMinor.toString(),
        status: ProviderEarningStatus.HELD,
        payableAt,
        settledAt: null,
      }),
    );
    await manager
      .getRepository(ProviderEarningStatusHistory)
      .save({
        providerEarningId: earning.id,
        fromStatus: null,
        toStatus: ProviderEarningStatus.HELD,
        actorUserId: null,
        reasonCode: "WALLET_HOSPITAL_PAYMENT_SETTLED",
        reasonNote: "Eligible for release after 24-hour hold",
      });
    await this.applyProviderReferral(manager, earning);
    return earning;
  }

  async markPharmacyFulfillmentPayable(
    manager: EntityManager,
    reference: string,
    actorUserId: string,
  ) {
    const repository = manager.getRepository(ProviderEarning);
    const earning = await repository.findOne({
      where: {
        sourceType: ProviderEarningSourceType.PHARMACY_FULFILLMENT,
        sourceReference: reference,
      },
      lock: { mode: "pessimistic_write" },
    });
    if (!earning) return null;
    if (
      [ProviderEarningStatus.PAYABLE, ProviderEarningStatus.SETTLED].includes(
        earning.status,
      )
    )
      return earning;
    if (earning.status !== ProviderEarningStatus.HELD)
      throw new ConflictException("Pharmacy earning cannot become payable");
    const now = new Date();
    if (earning.payableAt && earning.payableAt.getTime() > now.getTime())
      return earning;
    earning.status = ProviderEarningStatus.PAYABLE;
    earning.payableAt = now;
    await repository.save(earning);
    await manager.getRepository(ProviderEarningStatusHistory).save({
      providerEarningId: earning.id,
      fromStatus: ProviderEarningStatus.HELD,
      toStatus: ProviderEarningStatus.PAYABLE,
      actorUserId,
      reasonCode: "PHARMACY_HANDOVER_COMPLETED",
      reasonNote: null,
    });
    await this.releaseProviderReferral(manager, reference, actorUserId);
    return earning;
  }

  async createHeldPatientConnectionEarning(
    manager: EntityManager,
    input: {
      providerId: string;
      sourceType:
        | ProviderEarningSourceType.PATIENT_REGISTRATION
        | ProviderEarningSourceType.PATIENT_LINKING;
      sourceReference: string;
      grossAmountMinor: string;
      currency: string;
      paymentTransaction: PaymentTransaction;
    },
  ): Promise<ProviderEarning> {
    const repository = manager.getRepository(ProviderEarning);
    const existing = await repository.findOne({
      where: {
        sourceType: input.sourceType,
        sourceReference: input.sourceReference,
      },
      lock: { mode: "pessimistic_write" },
    });
    if (existing) {
      if (existing.paymentTransactionId !== input.paymentTransaction.id)
        throw new ConflictException(
          "Patient connection earning belongs to another payment transaction",
        );
      return existing;
    }
    if (
      input.paymentTransaction.status !== PaymentTransactionStatus.SUCCEEDED ||
      input.paymentTransaction.transactionType !==
        PaymentTransactionType.COLLECTION ||
      input.paymentTransaction.currency !== input.currency ||
      this.toMinor(input.paymentTransaction.amount) !==
        BigInt(input.grossAmountMinor)
    )
      throw new ConflictException(
        "Payment transaction does not match the Patient connection commercial snapshot",
      );
    const resolution = await this.commissions.requireForProvider(
      input.providerId,
      manager,
    );
    const calculation = calculateCommission(
      BigInt(input.grossAmountMinor),
      resolution.rateBasisPoints,
    );
    const earning = await repository.save(
      repository.create({
        providerId: input.providerId,
        paymentTransactionId: input.paymentTransaction.id,
        sourceType: input.sourceType,
        sourceReference: input.sourceReference,
        currency: input.currency,
        grossAmountMinor: input.grossAmountMinor,
        commissionBps: resolution.rateBasisPoints,
        commissionSource: resolution.source,
        commissionAmountMinor: calculation.commissionAmountMinor.toString(),
        providerShareMinor: calculation.providerShareMinor.toString(),
        status: ProviderEarningStatus.HELD,
        payableAt: null,
        settledAt: null,
      }),
    );
    await manager.getRepository(ProviderEarningStatusHistory).save({
      providerEarningId: earning.id,
      fromStatus: null,
      toStatus: ProviderEarningStatus.HELD,
      actorUserId: null,
      reasonCode: "PATIENT_CONNECTION_PAYMENT_SETTLED",
      reasonNote: null,
    });
    return earning;
  }

  async markPatientConnectionPayable(
    manager: EntityManager,
    sourceReference: string,
    actorUserId: string,
  ): Promise<void> {
    const repository = manager.getRepository(ProviderEarning);
    const rows = await repository
      .createQueryBuilder("earning")
      .setLock("pessimistic_write")
      .where("earning.sourceReference = :sourceReference", { sourceReference })
      .andWhere("earning.sourceType IN (:...types)", {
        types: [
          ProviderEarningSourceType.PATIENT_REGISTRATION,
          ProviderEarningSourceType.PATIENT_LINKING,
        ],
      })
      .getMany();
    for (const earning of rows) {
      if (
        [ProviderEarningStatus.PAYABLE, ProviderEarningStatus.SETTLED].includes(
          earning.status,
        )
      )
        continue;
      if (earning.status !== ProviderEarningStatus.HELD)
        throw new ConflictException(
          `Provider earning in ${earning.status} cannot become payable`,
        );
      earning.status = ProviderEarningStatus.PAYABLE;
      earning.payableAt = new Date();
      await repository.save(earning);
      await manager.getRepository(ProviderEarningStatusHistory).save({
        providerEarningId: earning.id,
        fromStatus: ProviderEarningStatus.HELD,
        toStatus: ProviderEarningStatus.PAYABLE,
        actorUserId,
        reasonCode: "PATIENT_CONNECTION_CONNECTED",
        reasonNote: null,
      });
    }
  }

  async markHealthCheckPayable(
    manager: EntityManager,
    bookingId: string,
    actorUserId: string,
  ): Promise<ProviderEarning | null> {
    const booking = await manager.getRepository(Booking).findOne({
      where: { id: bookingId },
      lock: { mode: "pessimistic_write" },
    });
    if (!booking || booking.status !== BookingStatus.COMPLETED)
      throw new ConflictException(
        "Health Check must be completed before Provider earnings become payable",
      );
    const repository = manager.getRepository(ProviderEarning);
    const earning = await repository.findOne({
      where: {
        sourceType: ProviderEarningSourceType.HEALTH_CHECK,
        sourceReference: booking.bookingReference,
      },
      lock: { mode: "pessimistic_write" },
    });
    if (!earning) return null;
    if (
      earning.status === ProviderEarningStatus.PAYABLE ||
      earning.status === ProviderEarningStatus.SETTLED
    )
      return earning;
    if (earning.status !== ProviderEarningStatus.HELD)
      throw new ConflictException(
        `Provider earning in ${earning.status} cannot become payable`,
      );
    earning.status = ProviderEarningStatus.PAYABLE;
    earning.payableAt = new Date();
    await repository.save(earning);
    await manager.getRepository(ProviderEarningStatusHistory).save({
      providerEarningId: earning.id,
      fromStatus: ProviderEarningStatus.HELD,
      toStatus: ProviderEarningStatus.PAYABLE,
      actorUserId,
      reasonCode: "HEALTH_CHECK_COMPLETED",
      reasonNote: null,
    });
    return earning;
  }

  async resolveProviderForRead(user: User): Promise<Provider> {
    const provider = await this.providers.findOne({
      where: { userId: user.id },
      withDeleted: true,
    });
    if (!provider || provider.deletedAt)
      throw new NotFoundException("Provider earnings were not found");
    return provider;
  }
  async listOwn(user: User, query: ProviderEarningListQueryDto) {
    const provider = await this.resolveProviderForRead(user);
    return this.listForProvider(provider.id, query);
  }
  async getOwn(user: User, reference: string) {
    const provider = await this.resolveProviderForRead(user);
    return this.getForProvider(provider.id, reference);
  }
  async balancesOwn(user: User) {
    const provider = await this.resolveProviderForRead(user);
    return this.balances(provider.id);
  }
  async listAdmin(query: AdminProviderEarningListQueryDto) {
    return this.listForProvider(query.providerId, query, true);
  }
  async getAdmin(reference: string) {
    const earning = await this.earnings.findOne({
      where: { reference },
      relations: { provider: true },
    });
    if (!earning) throw new NotFoundException("Provider earning not found");
    return this.map(earning, true);
  }
  async balancesAdmin(providerId?: string, providerReference?: string) {
    return this.balances(providerId, providerReference);
  }

  private async listForProvider(
    providerId: string | undefined,
    query: ProviderEarningListQueryDto,
    includeProvider = false,
  ) {
    const qb = this.earnings.createQueryBuilder("earning");
    if (includeProvider) qb.innerJoinAndSelect("earning.provider", "provider");
    if (providerId)
      qb.andWhere("earning.providerId = :providerId", { providerId });
    const adminQuery = query as AdminProviderEarningListQueryDto;
    if (adminQuery.providerReference)
      qb.andWhere("provider.providerReference = :providerReference", {
        providerReference: adminQuery.providerReference,
      });
    if (query.status)
      qb.andWhere("earning.status = :status", { status: query.status });
    if (query.sourceType)
      qb.andWhere("earning.sourceType = :sourceType", {
        sourceType: query.sourceType,
      });
    if (query.currency)
      qb.andWhere("earning.currency = :currency", {
        currency: query.currency.toUpperCase(),
      });
    this.applyDateRange(qb, query);
    qb.orderBy("earning.createdAt", "DESC")
      .addOrderBy("earning.id", "DESC")
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    const [rows, total] = await qb.getManyAndCount();
    return {
      items: rows.map((row) => this.map(row, includeProvider)),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: total ? Math.ceil(total / query.limit) : 0,
    };
  }
  private async getForProvider(providerId: string, reference: string) {
    const earning = await this.earnings.findOne({
      where: { providerId, reference },
    });
    if (!earning) throw new NotFoundException("Provider earning not found");
    return this.map(earning);
  }
  private async balances(providerId?: string, providerReference?: string) {
    const base = () => {
      const qb = this.earnings.createQueryBuilder("earning");
      if (providerReference)
        qb.innerJoin("earning.provider", "provider").andWhere(
          "provider.providerReference = :providerReference",
          { providerReference },
        );
      if (providerId)
        qb.andWhere("earning.providerId = :providerId", { providerId });
      return qb;
    };
    const totals = await base()
      .select("earning.currency", "currency")
      .addSelect("COUNT(*)", "earningCount")
      .addSelect("COALESCE(SUM(earning.gross_amount_minor), 0)", "gross")
      .addSelect(
        "COALESCE(SUM(earning.commission_amount_minor), 0)",
        "commission",
      )
      .addSelect(
        "COALESCE(SUM(earning.provider_share_minor), 0)",
        "providerShare",
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN earning.status = 'HELD' THEN earning.provider_share_minor ELSE 0 END), 0)`,
        "held",
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN earning.status = 'PAYABLE' THEN earning.provider_share_minor ELSE 0 END), 0)`,
        "payable",
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN earning.status = 'SETTLED' THEN earning.provider_share_minor ELSE 0 END), 0)`,
        "settled",
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN earning.status = 'VOIDED' THEN earning.provider_share_minor ELSE 0 END), 0)`,
        "voided",
      )
      .groupBy("earning.currency")
      .orderBy("earning.currency", "ASC")
      .getRawMany();
    const statuses = await base()
      .select("earning.currency", "currency")
      .addSelect("earning.status", "key")
      .addSelect("COUNT(*)", "earningCount")
      .addSelect("COALESCE(SUM(earning.gross_amount_minor), 0)", "gross")
      .addSelect(
        "COALESCE(SUM(earning.commission_amount_minor), 0)",
        "commission",
      )
      .addSelect(
        "COALESCE(SUM(earning.provider_share_minor), 0)",
        "providerShare",
      )
      .groupBy("earning.currency")
      .addGroupBy("earning.status")
      .orderBy("earning.currency", "ASC")
      .addOrderBy("earning.status", "ASC")
      .getRawMany();
    const sources = await base()
      .select("earning.currency", "currency")
      .addSelect("earning.sourceType", "key")
      .addSelect("COUNT(*)", "earningCount")
      .addSelect("COALESCE(SUM(earning.gross_amount_minor), 0)", "gross")
      .addSelect(
        "COALESCE(SUM(earning.commission_amount_minor), 0)",
        "commission",
      )
      .addSelect(
        "COALESCE(SUM(earning.provider_share_minor), 0)",
        "providerShare",
      )
      .groupBy("earning.currency")
      .addGroupBy("earning.sourceType")
      .orderBy("earning.currency", "ASC")
      .addOrderBy("earning.sourceType", "ASC")
      .getRawMany();
    const breakdown = (rows: any[], currency: string) =>
      rows
        .filter((row) => row.currency === currency)
        .map((row) => ({
          key: row.key,
          earningCount: Number(row.earningCount),
          grossAmountMinor: Number(row.gross),
          commissionAmountMinor: Number(row.commission),
          providerShareMinor: Number(row.providerShare),
        }));
    return totals.map((row) => ({
      currency: row.currency,
      earningCount: Number(row.earningCount),
      grossAmountMinor: Number(row.gross),
      commissionAmountMinor: Number(row.commission),
      providerShareMinor: Number(row.providerShare),
      heldAmountMinor: Number(row.held),
      payableAmountMinor: Number(row.payable),
      settledAmountMinor: Number(row.settled),
      voidedAmountMinor: Number(row.voided),
      statusBreakdown: breakdown(statuses, row.currency),
      sourceBreakdown: breakdown(sources, row.currency),
    }));
  }
  private applyDateRange(qb: any, query: ProviderEarningListQueryDto) {
    if (query.from && query.to && new Date(query.from) > new Date(query.to))
      throw new BadRequestException("from must not be after to");
    if (query.from)
      qb.andWhere("earning.createdAt >= :from", { from: new Date(query.from) });
    if (query.to)
      qb.andWhere("earning.createdAt <= :to", { to: new Date(query.to) });
  }
  private map(row: ProviderEarning, includeProvider = false) {
    return {
      reference: row.reference,
      sourceType: row.sourceType,
      sourceReference: row.sourceReference,
      currency: row.currency,
      grossAmountMinor: Number(row.grossAmountMinor),
      commissionBasisPoints: row.commissionBps,
      commissionSource: row.commissionSource,
      commissionAmountMinor: Number(row.commissionAmountMinor),
      providerShareMinor: Number(row.providerShareMinor),
      status: row.status,
      payableAt: row.payableAt,
      settledAt: row.settledAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      ...(includeProvider
        ? {
            provider: {
              reference: row.provider.providerReference,
              displayName: row.provider.displayName,
            },
          }
        : {}),
    };
  }
  private toMinor(amount: string): bigint {
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
    if (!match)
      throw new ConflictException("Invalid authoritative money amount");
    return BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  }
}
