import {
  ConflictException,
  Inject,
  Injectable,
  Optional,
} from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { CareRequest } from "../care-requests/entities/care-request.entity";
import { appConfig } from "../config/app.config";
import { PaymentTransaction } from "../payments/entities/payment-transaction.entity";
import { Referral } from "../rewards/entities/referral.entity";
import { ReferralTargetType } from "../rewards/enums/referral-target-type.enum";
import { ProviderEarning } from "./entities/provider-earning.entity";
import { ReferralEarning } from "./entities/referral-earning.entity";
import { ReferralEarningStatus } from "./enums/referral-earning-status.enum";

const DEFAULT_REFERRAL_BPS = 300;

@Injectable()
export class ReferralEarningsService {
  constructor(
    @InjectRepository(ReferralEarning)
    private readonly earnings: Repository<ReferralEarning>,
    @Optional()
    @Inject(appConfig.KEY)
    private readonly config?: ConfigType<typeof appConfig>,
  ) {}

  async createHeldForGeneralCare(
    manager: EntityManager,
    care: CareRequest,
    paymentTransaction: PaymentTransaction,
    providerEarning: ProviderEarning,
    referralBps?: number,
  ): Promise<ReferralEarning | null> {
    const referral = await manager.getRepository(Referral).findOne({
      where: {
        referredPatientId: care.patientId,
        targetType: ReferralTargetType.PATIENT,
      },
      relations: { referralCode: true },
    });
    if (!referral) return null;
    if (referral.referrerUserId === care.userId)
      throw new ConflictException(
        "Self-referral cannot receive monetary earnings",
      );
    const repository = manager.getRepository(ReferralEarning);
    const existing = await repository.findOne({
      where: { paymentTransactionId: paymentTransaction.id },
      lock: { mode: "pessimistic_write" },
    });
    if (existing) return existing;
    const appliedReferralBps =
      referralBps ??
      this.config?.referrals.monetaryShareBps ??
      DEFAULT_REFERRAL_BPS;
    if (
      !Number.isInteger(appliedReferralBps) ||
      appliedReferralBps < 0 ||
      appliedReferralBps > 10000
    )
      throw new ConflictException("Referral share basis points are invalid");
    const gross = BigInt(providerEarning.grossAmountMinor);
    const platform = BigInt(providerEarning.commissionAmountMinor);
    const referralAmount =
      (gross * BigInt(appliedReferralBps) + 5000n) / 10000n;
    if (platform + referralAmount > gross)
      throw new ConflictException("Commercial shares exceed gross payment");
    const providerAmount = gross - platform - referralAmount;
    providerEarning.referralShareMinor = referralAmount.toString();
    providerEarning.providerShareMinor = providerAmount.toString();
    await manager.getRepository(ProviderEarning).save(providerEarning);
    return repository.save(
      repository.create({
        referralId: referral.id,
        referralCodeId: referral.referralCodeId,
        referralCodeSnapshot: referral.referralCode.codeNormalized,
        referrerUserId: referral.referrerUserId,
        patientId: care.patientId,
        paymentTransactionId: paymentTransaction.id,
        sourceType: "GENERAL_CARE",
        sourceReference: care.reference,
        grossAmountMinor: gross.toString(),
        platformBps: providerEarning.commissionBps,
        platformAmountMinor: platform.toString(),
        referralBps: appliedReferralBps,
        referralAmountMinor: referralAmount.toString(),
        providerAmountMinor: providerAmount.toString(),
        currency: providerEarning.currency,
        status: ReferralEarningStatus.HELD,
        payableAt: null,
        settledAt: null,
        reversedAt: null,
      }),
    );
  }

  async markGeneralCarePayable(
    manager: EntityManager,
    sourceReference: string,
  ) {
    const repository = manager.getRepository(ReferralEarning);
    const earning = await repository.findOne({
      where: { sourceType: "GENERAL_CARE", sourceReference },
      lock: { mode: "pessimistic_write" },
    });
    if (
      !earning ||
      earning.status === ReferralEarningStatus.PAYABLE ||
      earning.status === ReferralEarningStatus.SETTLED
    )
      return earning;
    if (earning.status !== ReferralEarningStatus.HELD)
      throw new ConflictException("Referral earning cannot become payable");
    earning.status = ReferralEarningStatus.PAYABLE;
    earning.payableAt = new Date();
    return repository.save(earning);
  }

  async balancesOwn(userId: string) {
    const rows = await this.earnings
      .createQueryBuilder("earning")
      .select("earning.currency", "currency")
      .addSelect("SUM(earning.referralAmountMinor)", "totalMinor")
      .addSelect(
        `SUM(CASE WHEN earning.status = 'HELD' THEN earning.referralAmountMinor ELSE 0 END)`,
        "heldMinor",
      )
      .addSelect(
        `SUM(CASE WHEN earning.status = 'PAYABLE' THEN earning.referralAmountMinor ELSE 0 END)`,
        "payableMinor",
      )
      .addSelect(
        `SUM(CASE WHEN earning.status = 'SETTLED' THEN earning.referralAmountMinor ELSE 0 END)`,
        "settledMinor",
      )
      .where("earning.referrerUserId = :userId", { userId })
      .groupBy("earning.currency")
      .getRawMany();
    return rows;
  }

  listOwn(userId: string) {
    return this.earnings.find({
      where: { referrerUserId: userId },
      order: { createdAt: "DESC" },
      take: 100,
    });
  }

  listAdmin(filters: {
    referrerUserId?: string;
    status?: ReferralEarningStatus;
    currency?: string;
    sourceType?: string;
  }) {
    return this.earnings.find({
      where: {
        ...(filters.referrerUserId
          ? { referrerUserId: filters.referrerUserId }
          : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.currency
          ? { currency: filters.currency.toUpperCase() }
          : {}),
        ...(filters.sourceType ? { sourceType: filters.sourceType } : {}),
      },
      order: { createdAt: "DESC" },
      take: 200,
    });
  }
}
