import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { Patient } from '../../patients/entities/patient.entity';
import { PatientStatus } from '../../patients/enums/patient-status.enum';
import { RewardBookingRedemption } from '../../rewards/entities/reward-booking-redemption.entity';
import { RewardBookingRedemptionStatus } from '../../rewards/enums/reward-booking-redemption-status.enum';
import { RewardPointSource } from '../../rewards/enums/reward-point-source.enum';
import { User } from '../../users/entities/user.entity';
import { EngagementService } from './engagement.service';

/** Value of one wellness point, in minor units (kobo, pesewas, RWF cents). */
export const DEFAULT_POINT_VALUES_MINOR: Readonly<Record<string, number>> = { NGN: 500, GHS: 4, RWF: 400 };
export const DEFAULT_MAX_PERCENT = 20;
export const DEFAULT_MIN_POINTS = 100;

export interface WellnessRedeemRules {
  /** Minor units per point, by currency. */
  readonly valuePerPointMinor: Readonly<Record<string, number>>;
  readonly maxPercent: number;
  readonly minPoints: number;
}

export interface WellnessWallet {
  readonly earnedPoints: number;
  readonly usedPoints: number;
  readonly availablePoints: number;
}

/** "NGN:5,GHS:0.04" → { NGN: 500, GHS: 4 }. Bad entries are skipped rather than breaking checkout. */
export function parsePointValues(raw: string | undefined | null): Record<string, number> {
  if (!raw?.trim()) return { ...DEFAULT_POINT_VALUES_MINOR };
  const out: Record<string, number> = {};
  for (const part of raw.split(',')) {
    const [currency, value] = part.split(':').map((x) => x?.trim());
    if (!currency || !/^[A-Za-z]{3}$/.test(currency) || !value || !/^\d+(\.\d{1,2})?$/.test(value)) continue;
    const minor = Math.round(Number(value) * 100);
    if (minor > 0) out[currency.toUpperCase()] = minor;
  }
  return Object.keys(out).length ? out : { ...DEFAULT_POINT_VALUES_MINOR };
}

/**
 * Most points a patient can usefully spend on a booking:
 * capped by their balance and by a share of the price, so the Health Check is still mostly paid.
 */
export function maxRedeemablePoints(totalMinor: bigint, valuePerPointMinor: number, maxPercent: number, available: number): number {
  if (valuePerPointMinor <= 0 || maxPercent <= 0 || available <= 0) return 0;
  const capMinor = (totalMinor * BigInt(maxPercent)) / 100n;
  const byPrice = Number(capMinor / BigInt(valuePerPointMinor));
  return Math.max(0, Math.min(available, byPrice));
}

@Injectable()
export class WellnessPointsService {
  constructor(
    private readonly engagement: EngagementService,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(RewardBookingRedemption) private readonly redemptions: Repository<RewardBookingRedemption>,
    @Optional() private readonly config?: ConfigService,
  ) {}

  rules(): WellnessRedeemRules {
    const maxPercent = Number(this.config?.get('WELLNESS_REDEEM_MAX_PERCENT') ?? DEFAULT_MAX_PERCENT);
    const minPoints = Number(this.config?.get('WELLNESS_REDEEM_MIN_POINTS') ?? DEFAULT_MIN_POINTS);
    return {
      valuePerPointMinor: parsePointValues(this.config?.get<string>('WELLNESS_POINT_VALUES')),
      maxPercent: Number.isFinite(maxPercent) ? Math.min(Math.max(maxPercent, 0), 100) : DEFAULT_MAX_PERCENT,
      minPoints: Number.isFinite(minPoints) && minPoints > 0 ? Math.floor(minPoints) : DEFAULT_MIN_POINTS,
    };
  }

  /** Earned for healthy habits, minus points already used or held for a Health Check. */
  async wallet(userId: string, manager?: EntityManager): Promise<WellnessWallet> {
    const patient = await this.patients.findOne({ where: { userId, status: PatientStatus.ACTIVE } });
    if (!patient) throw new NotFoundException('Patient profile not found');
    const earnedPoints = await this.engagement.earnedPoints(patient, { id: userId } as User);
    const usedPoints = await this.usedPoints(userId, manager);
    return { earnedPoints, usedPoints, availablePoints: Math.max(0, earnedPoints - usedPoints) };
  }

  async usedPoints(userId: string, manager?: EntityManager): Promise<number> {
    const repo = manager ? manager.getRepository(RewardBookingRedemption) : this.redemptions;
    const row = await repo
      .createQueryBuilder('r')
      .select('COALESCE(SUM(r.pointsReserved), 0)', 'used')
      .where('r.userId = :userId', { userId })
      .andWhere('r.pointSource = :source', { source: RewardPointSource.WELLNESS })
      .andWhere('r.status IN (:...statuses)', { statuses: [RewardBookingRedemptionStatus.RESERVED, RewardBookingRedemptionStatus.SETTLED] })
      .getRawOne<{ used: string }>();
    return Number(row?.used ?? 0);
  }
}

