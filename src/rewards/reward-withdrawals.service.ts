import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomBytes } from "node:crypto";
import { EntityManager, Repository } from "typeorm";
import { User } from "../users/entities/user.entity";
import { AdminRewardWithdrawalQueryDto, CreateRewardWithdrawalDto, MarkWithdrawalPaidDto, RewardWithdrawalQueryDto } from "./dto/reward-withdrawal.dto";
import { RewardConversionRate } from "./entities/reward-conversion-rate.entity";
import { RewardPointsLedger } from "./entities/reward-points-ledger.entity";
import { RewardWithdrawalRequest } from "./entities/reward-withdrawal-request.entity";
import { RewardWithdrawalStatusHistory } from "./entities/reward-withdrawal-status-history.entity";
import { RewardLedgerDirection } from "./enums/reward-ledger-direction.enum";
import { RewardWithdrawalStatus } from "./enums/reward-withdrawal-status.enum";
import { RewardBookingRedemption } from "./entities/reward-booking-redemption.entity";
import { RewardBookingRedemptionStatus } from "./enums/reward-booking-redemption-status.enum";

const RESERVED = [RewardWithdrawalStatus.REQUESTED, RewardWithdrawalStatus.PROCESSING];

@Injectable()
export class RewardWithdrawalsService {
  constructor(
    @InjectRepository(RewardWithdrawalRequest) private readonly withdrawals: Repository<RewardWithdrawalRequest>,
    @InjectRepository(RewardConversionRate) private readonly rates: Repository<RewardConversionRate>,
    @InjectRepository(RewardBookingRedemption) private readonly redemptions: Repository<RewardBookingRedemption>,
  ) {}

  async create(userId: string, input: CreateRewardWithdrawalDto) {
    return this.withdrawals.manager.transaction(async (manager) => {
      await this.lockUser(manager, userId);
      const rate = await manager.getRepository(RewardConversionRate).findOne({ where: { isActive: true }, order: { effectiveFrom: "DESC" } });
      if (!rate) throw new ConflictException("Cash withdrawal conversion is not currently configured");
      const balance = await this.balance(userId, manager);
      if (input.points > balance.availablePoints) throw new ConflictException("Insufficient available reward points");
      const rateMinor = this.toMinor(rate.amount);
      const amountMinor = (BigInt(input.points) * rateMinor) / BigInt(rate.points);
      if (amountMinor <= 0n) throw new BadRequestException("Requested points do not convert to a payable amount");
      const repository = manager.getRepository(RewardWithdrawalRequest);
      const withdrawal = repository.create({
        publicReference: await this.reference(manager), userId, pointsRequested: input.points,
        ratePoints: rate.points, rateAmountMinor: rateMinor.toString(), amountMinor: amountMinor.toString(),
        currency: rate.currency.toUpperCase(), bankName: input.bankName.trim(), bankCode: null,
        accountNumber: input.accountNumber.trim(), accountName: input.accountName.trim(), status: RewardWithdrawalStatus.REQUESTED,
        requestedAt: new Date(), processingAt: null, paidAt: null, failedAt: null, cancelledAt: null,
        processedByUserId: null, adminNote: null, externalReference: null,
      });
      await repository.save(withdrawal);
      await this.history(manager, withdrawal, null, RewardWithdrawalStatus.REQUESTED, userId, "WITHDRAWAL_REQUESTED", null);
      return this.userView(withdrawal);
    });
  }

  async listMine(userId: string, query: RewardWithdrawalQueryDto) {
    const [items, total] = await this.withdrawals.findAndCount({ where: { userId, ...(query.status ? { status: query.status } : {}) }, order: { requestedAt: "DESC", id: "DESC" }, skip: (query.page - 1) * query.limit, take: query.limit });
    return this.page(items.map((item) => this.userView(item)), total, query);
  }

  async getMine(userId: string, reference: string) {
    const item = await this.withdrawals.findOne({ where: { userId, publicReference: reference.toUpperCase() } });
    if (!item) throw new NotFoundException("Withdrawal request not found");
    return this.userView(item);
  }

  async cancelMine(userId: string, reference: string) {
    return this.transition(reference, userId, [RewardWithdrawalStatus.REQUESTED], RewardWithdrawalStatus.CANCELLED, "WITHDRAWAL_CANCELLED_BY_USER", null, true);
  }

  async adminList(query: AdminRewardWithdrawalQueryDto) {
    const builder = this.withdrawals.createQueryBuilder("withdrawal").innerJoinAndSelect("withdrawal.user", "user");
    if (query.status) builder.andWhere("withdrawal.status = :status", { status: query.status });
    if (query.userEmail) builder.andWhere("user.emailNormalized = :email", { email: query.userEmail });
    if (query.reference) builder.andWhere("withdrawal.publicReference = :reference", { reference: query.reference.toUpperCase() });
    if (query.requestedFrom) builder.andWhere("withdrawal.requestedAt >= :from", { from: `${query.requestedFrom}T00:00:00.000Z` });
    if (query.requestedTo) builder.andWhere("withdrawal.requestedAt < (:to::date + INTERVAL '1 day')", { to: query.requestedTo });
    builder.orderBy("withdrawal.requestedAt", "DESC").addOrderBy("withdrawal.id", "DESC").skip((query.page - 1) * query.limit).take(query.limit);
    const [items, total] = await builder.getManyAndCount();
    return this.page(items.map((item) => this.adminView(item)), total, query);
  }

  async adminDetail(reference: string) {
    const item = await this.withdrawals.findOne({ where: { publicReference: reference.toUpperCase() }, relations: { user: true, histories: true } });
    if (!item) throw new NotFoundException("Withdrawal request not found");
    item.histories.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return { ...this.adminView(item), history: item.histories.map((row) => ({ fromStatus: row.fromStatus, toStatus: row.toStatus, reasonCode: row.reasonCode, reasonNote: row.reasonNote, createdAt: row.createdAt })) };
  }

  processing(reference: string, actorUserId: string) { return this.transition(reference, actorUserId, [RewardWithdrawalStatus.REQUESTED], RewardWithdrawalStatus.PROCESSING, "WITHDRAWAL_PROCESSING", null, false); }
  failed(reference: string, actorUserId: string, reason: string) { return this.transition(reference, actorUserId, RESERVED, RewardWithdrawalStatus.FAILED, "WITHDRAWAL_FAILED", reason, false); }
  adminCancel(reference: string, actorUserId: string, reason: string) { return this.transition(reference, actorUserId, RESERVED, RewardWithdrawalStatus.CANCELLED, "WITHDRAWAL_CANCELLED_BY_ADMIN", reason, false); }

  async paid(reference: string, actorUserId: string, input: MarkWithdrawalPaidDto) {
    return this.withdrawals.manager.transaction(async (manager) => {
      const withdrawal = await this.lockWithdrawal(manager, reference);
      if (withdrawal.status === RewardWithdrawalStatus.PAID) return this.adminView(withdrawal);
      if (!RESERVED.includes(withdrawal.status)) throw new ConflictException("Withdrawal cannot be marked paid from its current status");
      await this.lockUser(manager, withdrawal.userId);
      const normalizedExternalReference = input.externalReference.trim();
      const conflictingReference = await manager.getRepository(RewardWithdrawalRequest).findOne({ where: { externalReference: normalizedExternalReference } });
      if (conflictingReference && conflictingReference.id !== withdrawal.id) throw new ConflictException("External transfer reference has already been recorded");
      const eventKey = `WITHDRAWAL_PAID:${withdrawal.publicReference}`;
      const ledger = manager.getRepository(RewardPointsLedger);
      if (!(await ledger.exists({ where: { eventKey } }))) await ledger.save(ledger.create({ userId: withdrawal.userId, referralId: null, eventKey, eventType: "WITHDRAWAL_PAID", direction: RewardLedgerDirection.DEBIT, points: withdrawal.pointsRequested, reasonCode: "MANUAL_CASH_WITHDRAWAL_PAID" }));
      const from = withdrawal.status;
      withdrawal.status = RewardWithdrawalStatus.PAID; withdrawal.paidAt = new Date(); withdrawal.processedByUserId = actorUserId;
      withdrawal.externalReference = normalizedExternalReference; withdrawal.adminNote = input.adminNote?.trim() || null;
      await manager.getRepository(RewardWithdrawalRequest).save(withdrawal);
      await this.history(manager, withdrawal, from, withdrawal.status, actorUserId, "WITHDRAWAL_PAID", withdrawal.adminNote);
      return this.adminView(withdrawal);
    });
  }

  async balance(userId: string, manager: EntityManager = this.withdrawals.manager) {
    const [ledger, withdrawals, healthChecks] = await Promise.all([
      manager.getRepository(RewardPointsLedger).createQueryBuilder("entry")
        .select(`COALESCE(SUM(CASE WHEN entry.direction = :credit THEN entry.points ELSE -entry.points END), 0)`, "net")
        .addSelect(`COALESCE(SUM(CASE WHEN entry.direction = :credit THEN entry.points ELSE 0 END), 0)`, "earned")
        .addSelect(`COALESCE(SUM(CASE WHEN entry.direction = :debit THEN entry.points ELSE 0 END), 0)`, "redeemed")
        .where("entry.userId = :userId", { userId }).setParameters({ credit: RewardLedgerDirection.CREDIT, debit: RewardLedgerDirection.DEBIT })
        .getRawOne<{ net: string; earned: string; redeemed: string }>(),
      manager.getRepository(RewardWithdrawalRequest).createQueryBuilder("withdrawal").select("COALESCE(SUM(withdrawal.pointsRequested), 0)", "reserved")
        .where("withdrawal.userId = :userId", { userId }).andWhere("withdrawal.status IN (:...statuses)", { statuses: RESERVED }).getRawOne<{ reserved: string }>(),
      manager.getRepository(RewardBookingRedemption).createQueryBuilder("redemption").select("COALESCE(SUM(redemption.pointsReserved), 0)", "reserved")
        .where("redemption.userId = :userId", { userId }).andWhere("redemption.status = :status", { status: RewardBookingRedemptionStatus.RESERVED }).getRawOne<{ reserved: string }>(),
    ]);
    const withdrawalReservedPoints = Number(withdrawals?.reserved ?? 0);
    const healthCheckReservedPoints = Number(healthChecks?.reserved ?? 0);
    const reservedPoints = withdrawalReservedPoints + healthCheckReservedPoints;
    return { availablePoints: Number(ledger?.net ?? 0) - reservedPoints, reservedPoints, withdrawalReservedPoints, healthCheckReservedPoints, lifetimeEarnedPoints: Number(ledger?.earned ?? 0), lifetimeRedeemedPoints: Number(ledger?.redeemed ?? 0) };
  }

  async metrics() {
    const row = await this.withdrawals.createQueryBuilder("withdrawal")
      .select(`COUNT(*) FILTER (WHERE withdrawal.status = :requested)`, "requested")
      .addSelect(`COUNT(*) FILTER (WHERE withdrawal.status = :processing)`, "processing")
      .addSelect(`COUNT(*) FILTER (WHERE withdrawal.status = :paid)`, "paid")
      .addSelect(`COUNT(*) FILTER (WHERE withdrawal.status = :failed)`, "failed")
      .addSelect(`COALESCE(SUM(withdrawal.pointsRequested) FILTER (WHERE withdrawal.status IN (:...reserved)), 0)`, "pointsReserved")
      .setParameters({ requested: RewardWithdrawalStatus.REQUESTED, processing: RewardWithdrawalStatus.PROCESSING, paid: RewardWithdrawalStatus.PAID, failed: RewardWithdrawalStatus.FAILED, reserved: RESERVED }).getRawOne<any>();
    return { requested: Number(row?.requested ?? 0), processing: Number(row?.processing ?? 0), paid: Number(row?.paid ?? 0), failed: Number(row?.failed ?? 0), pointsReserved: Number(row?.pointsReserved ?? 0) };
  }

  private async transition(reference: string, actorUserId: string, allowed: RewardWithdrawalStatus[], to: RewardWithdrawalStatus, reasonCode: string, note: string | null, owner: boolean) {
    return this.withdrawals.manager.transaction(async (manager) => {
      const withdrawal = await this.lockWithdrawal(manager, reference);
      if (owner && withdrawal.userId !== actorUserId) throw new NotFoundException("Withdrawal request not found");
      if (!allowed.includes(withdrawal.status)) throw new ConflictException("Withdrawal cannot make this status transition");
      const from = withdrawal.status; withdrawal.status = to; withdrawal.processedByUserId = owner ? withdrawal.processedByUserId : actorUserId;
      if (to === RewardWithdrawalStatus.PROCESSING) withdrawal.processingAt = new Date();
      if (to === RewardWithdrawalStatus.FAILED) { withdrawal.failedAt = new Date(); withdrawal.adminNote = note; }
      if (to === RewardWithdrawalStatus.CANCELLED) { withdrawal.cancelledAt = new Date(); withdrawal.adminNote = note; }
      await manager.getRepository(RewardWithdrawalRequest).save(withdrawal);
      await this.history(manager, withdrawal, from, to, actorUserId, reasonCode, note);
      return owner ? this.userView(withdrawal) : this.adminView(withdrawal);
    });
  }

  private async lockWithdrawal(manager: EntityManager, reference: string) { const row = await manager.getRepository(RewardWithdrawalRequest).findOne({ where: { publicReference: reference.toUpperCase() }, lock: { mode: "pessimistic_write" } }); if (!row) throw new NotFoundException("Withdrawal request not found"); return row; }
  private async lockUser(manager: EntityManager, userId: string) { const user = await manager.getRepository(User).findOne({ where: { id: userId }, lock: { mode: "pessimistic_write" } }); if (!user) throw new NotFoundException("User not found"); }
  private async history(manager: EntityManager, withdrawal: RewardWithdrawalRequest, fromStatus: RewardWithdrawalStatus | null, toStatus: RewardWithdrawalStatus, actorUserId: string, reasonCode: string, reasonNote: string | null) { const repo = manager.getRepository(RewardWithdrawalStatusHistory); await repo.save(repo.create({ withdrawalId: withdrawal.id, fromStatus, toStatus, actorUserId, reasonCode, reasonNote })); }
  private async reference(manager: EntityManager) { for (let i = 0; i < 8; i += 1) { const value = `SCW-${new Date().getUTCFullYear()}-${randomBytes(4).toString("hex").toUpperCase()}`; if (!(await manager.getRepository(RewardWithdrawalRequest).exists({ where: { publicReference: value } }))) return value; } throw new ConflictException("Unable to create a withdrawal reference"); }
  private toMinor(amount: string) { const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount); if (!match) throw new ConflictException("Configured conversion rate is invalid"); return BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0")); }
  private amount(value: string) { const minor = BigInt(value); return `${minor / 100n}.${(minor % 100n).toString().padStart(2, "0")}`; }
  private mask(number: string) { return number.length <= 4 ? number : `${"*".repeat(number.length - 4)}${number.slice(-4)}`; }
  private userView(row: RewardWithdrawalRequest) { return { withdrawalReference: row.publicReference, points: row.pointsRequested, amount: this.amount(row.amountMinor), currency: row.currency, status: row.status, bankName: row.bankName, maskedAccountNumber: this.mask(row.accountNumber), accountName: row.accountName, requestedAt: row.requestedAt, processingAt: row.processingAt, paidAt: row.paidAt, failedAt: row.failedAt, cancelledAt: row.cancelledAt, adminNote: row.adminNote }; }
  private adminView(row: RewardWithdrawalRequest) { return { withdrawalReference: row.publicReference, user: row.user ? { displayName: row.user.displayName, email: row.user.email } : undefined, points: row.pointsRequested, amount: this.amount(row.amountMinor), currency: row.currency, conversionRate: { points: row.ratePoints, amount: this.amount(row.rateAmountMinor) }, bankName: row.bankName, accountNumber: row.accountNumber, accountName: row.accountName, status: row.status, requestedAt: row.requestedAt, processingAt: row.processingAt, paidAt: row.paidAt, failedAt: row.failedAt, cancelledAt: row.cancelledAt, externalReference: row.externalReference, adminNote: row.adminNote } }
  private page(items: unknown[], total: number, query: { page: number; limit: number }) { return { items, page: query.page, limit: query.limit, total, totalPages: total ? Math.ceil(total / query.limit) : 0 }; }
}
