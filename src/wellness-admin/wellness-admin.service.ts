import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { WellnessPointAdjustment } from '../health-passport/engagement/wellness-point-adjustment.entity';
import { WellnessPointsService, WellnessSettingsOverride } from '../health-passport/engagement/wellness-points.service';
import { Patient } from '../patients/entities/patient.entity';
import { RewardBookingRedemption } from '../rewards/entities/reward-booking-redemption.entity';
import { RewardBookingRedemptionStatus } from '../rewards/enums/reward-booking-redemption-status.enum';
import { RewardPointSource } from '../rewards/enums/reward-point-source.enum';
import { User } from '../users/entities/user.entity';

export const MAX_ADJUSTMENT = 10_000;
const CURRENCIES = ['NGN', 'GHS', 'RWF'];

const money = (minor: string | number | bigint) => {
  const v = BigInt(minor);
  return `${v / 100n}.${(v % 100n).toString().padStart(2, '0')}`;
};

/** Staff view of wellness points: how they are used, one patient's balance, adjustments and settings. */
@Injectable()
export class WellnessAdminService {
  constructor(
    private readonly wellness: WellnessPointsService,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(RewardBookingRedemption) private readonly redemptions: Repository<RewardBookingRedemption>,
    @InjectRepository(WellnessPointAdjustment) private readonly adjustments: Repository<WellnessPointAdjustment>,
  ) {}

  async summary() {
    const rules = await this.wellness.rules();
    const rows = await this.redemptions
      .createQueryBuilder('r')
      .select('r.status', 'status')
      .addSelect('r.currency', 'currency')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(r.pointsReserved), 0)', 'points')
      .addSelect('COALESCE(SUM(r.amountMinor), 0)', 'amountMinor')
      .where('r.pointSource = :source', { source: RewardPointSource.WELLNESS })
      .groupBy('r.status')
      .addGroupBy('r.currency')
      .getRawMany<{ status: RewardBookingRedemptionStatus; currency: string; count: string; points: string; amountMinor: string }>();
    const adj = await this.adjustments
      .createQueryBuilder('a')
      .select('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(CASE WHEN a.points > 0 THEN a.points ELSE 0 END), 0)', 'added')
      .addSelect('COALESCE(SUM(CASE WHEN a.points < 0 THEN -a.points ELSE 0 END), 0)', 'removed')
      .getRawOne<{ count: string; added: string; removed: string }>();
    return {
      settings: {
        paused: rules.paused,
        maxPercent: rules.maxPercent,
        minPoints: rules.minPoints,
        valuePerPoint: Object.fromEntries(Object.entries(rules.valuePerPointMinor).map(([c, m]) => [c, money(m)])),
      },
      redemptions: rows.map((r) => ({ status: r.status, currency: r.currency, count: Number(r.count), points: Number(r.points), amount: money(r.amountMinor) })),
      adjustments: { count: Number(adj?.count ?? 0), pointsAdded: Number(adj?.added ?? 0), pointsRemoved: Number(adj?.removed ?? 0) },
    };
  }

  async list(q: { status?: RewardBookingRedemptionStatus; page?: number; limit?: number }) {
    const page = Math.max(1, q.page ?? 1);
    const limit = Math.min(50, Math.max(1, q.limit ?? 20));
    const qb = this.redemptions
      .createQueryBuilder('r')
      .innerJoin('r.booking', 'b')
      .innerJoin('r.user', 'u')
      .select(['r.id', 'r.pointsReserved', 'r.amountMinor', 'r.currency', 'r.status', 'r.createdAt', 'r.settledAt', 'r.releasedAt', 'b.bookingReference', 'u.displayName'])
      .where('r.pointSource = :source', { source: RewardPointSource.WELLNESS })
      .orderBy('r.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    if (q.status) qb.andWhere('r.status = :status', { status: q.status });
    const [items, total] = await qb.getManyAndCount();
    return {
      items: items.map((r) => ({
        bookingReference: r.booking.bookingReference,
        patientName: r.user.displayName,
        points: r.pointsReserved,
        amount: money(r.amountMinor),
        currency: r.currency,
        status: r.status,
        createdAt: r.createdAt,
        settledAt: r.settledAt,
        releasedAt: r.releasedAt,
      })),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async patient(patientReference: string) {
    const patient = await this.patientWithAccount(patientReference);
    const [wallet, adjustments, redemptions] = await Promise.all([
      this.wellness.wallet(patient.userId!),
      this.adjustments.find({ where: { userId: patient.userId! }, relations: { admin: true }, order: { createdAt: 'DESC' }, take: 20 }),
      this.redemptions.find({ where: { userId: patient.userId!, pointSource: RewardPointSource.WELLNESS }, relations: { booking: true }, order: { createdAt: 'DESC' }, take: 20 }),
    ]);
    return {
      patientReference: patient.patientReference,
      name: [patient.givenName, patient.familyName].filter(Boolean).join(' '),
      wallet,
      adjustments: adjustments.map((a) => ({ points: a.points, reason: a.reason, by: a.admin?.displayName ?? null, createdAt: a.createdAt })),
      redemptions: redemptions.map((r) => ({ bookingReference: r.booking.bookingReference, points: r.pointsReserved, amount: money(r.amountMinor), currency: r.currency, status: r.status, createdAt: r.createdAt })),
    };
  }

  /** Add or remove points with a reason. Removing can't take a patient below zero. */
  async adjust(patientReference: string, points: number, reason: string, admin: User) {
    if (!Number.isInteger(points) || points === 0 || Math.abs(points) > MAX_ADJUSTMENT)
      throw new BadRequestException(`Points must be a whole number between -${MAX_ADJUSTMENT} and ${MAX_ADJUSTMENT}, not 0`);
    const why = reason?.trim() ?? '';
    if (why.length < 5) throw new BadRequestException('Give a short reason (at least 5 characters)');
    const patient = await this.patientWithAccount(patientReference);
    await this.adjustments.manager.transaction(async (manager) => {
      await manager.getRepository(User).findOne({ where: { id: patient.userId! }, lock: { mode: 'pessimistic_write' } });
      if (points < 0) {
        const wallet = await this.wellness.wallet(patient.userId!, manager);
        if (wallet.availablePoints + points < 0)
          throw new ConflictException(`This patient has ${wallet.availablePoints} points to spend; you can remove at most that many`);
      }
      const repo = manager.getRepository(WellnessPointAdjustment);
      await repo.save(repo.create({ userId: patient.userId!, points, reason: why.slice(0, 300), adminUserId: admin.id }));
    });
    return this.patient(patientReference);
  }

  async updateSettings(input: WellnessSettingsOverride, admin: User) {
    const next: WellnessSettingsOverride = {};
    if (input.paused !== undefined) {
      if (typeof input.paused !== 'boolean') throw new BadRequestException('paused must be true or false');
      next.paused = input.paused;
    }
    if (input.maxPercent !== undefined) {
      if (!Number.isInteger(input.maxPercent) || input.maxPercent < 0 || input.maxPercent > 50) throw new BadRequestException('maxPercent must be a whole number from 0 to 50');
      next.maxPercent = input.maxPercent;
    }
    if (input.minPoints !== undefined) {
      if (!Number.isInteger(input.minPoints) || input.minPoints < 1 || input.minPoints > 10_000) throw new BadRequestException('minPoints must be a whole number from 1 to 10000');
      next.minPoints = input.minPoints;
    }
    if (input.valuePerPoint !== undefined) {
      const values: Record<string, string> = {};
      for (const [currency, value] of Object.entries(input.valuePerPoint ?? {})) {
        if (!CURRENCIES.includes(currency)) throw new BadRequestException(`Unknown currency ${currency}`);
        if (!/^\d{1,4}(\.\d{1,2})?$/.test(String(value)) || Number(value) <= 0) throw new BadRequestException(`Value per point for ${currency} must be a positive amount like 5 or 0.04`);
        values[currency] = Number(value).toFixed(2);
      }
      next.valuePerPoint = { ...((await this.wellness.override()).valuePerPoint ?? {}), ...values };
    }
    await this.wellness.saveOverride(next, admin.id);
    return (await this.summary()).settings;
  }

  private async patientWithAccount(patientReference: string): Promise<Patient> {
    const patient = await this.patients.findOne({ where: { patientReference: patientReference.trim().toUpperCase() } });
    if (!patient) throw new NotFoundException('No patient with that SmartClinic ID');
    if (!patient.userId) throw new ConflictException('This person is a family member on someone else’s account and has no points of their own');
    return patient;
  }
}
