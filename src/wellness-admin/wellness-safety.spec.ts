import { BadRequestException, ConflictException } from '@nestjs/common';

import { BookingLifecycleService } from '../bookings/booking-lifecycle.service';
import { Booking } from '../bookings/entities/booking.entity';
import { BookingStatus } from '../bookings/enums/booking-status.enum';
import { AppSetting } from '../health-passport/engagement/app-setting.entity';
import { WellnessPointAdjustment } from '../health-passport/engagement/wellness-point-adjustment.entity';
import { WellnessPointsService } from '../health-passport/engagement/wellness-points.service';
import { RewardBookingRedemption } from '../rewards/entities/reward-booking-redemption.entity';
import { RewardPointsLedger } from '../rewards/entities/reward-points-ledger.entity';
import { RewardBookingRedemptionStatus as S } from '../rewards/enums/reward-booking-redemption-status.enum';
import { RewardPointSource } from '../rewards/enums/reward-point-source.enum';
import { WellnessAdminService } from './wellness-admin.service';

describe('points come back when a paid Health Check is cancelled', () => {
  function setup(source: RewardPointSource) {
    const booking = { id: 'b1', bookingReference: 'SC-2026-ABCDEFGHIJKL', status: BookingStatus.PENDING_PROVIDER_MATCH };
    const redemptions = [{ id: 'r1', bookingId: 'b1', userId: 'u1', pointsReserved: 400, pointSource: source, status: S.SETTLED, releasedAt: null }];
    const ledger: any[] = [];
    const repos = new Map<unknown, any>([
      [Booking, { findOne: jest.fn(async () => booking), save: jest.fn(async (v) => v) }],
      [RewardBookingRedemption, { findOne: jest.fn(async ({ where }) => redemptions.find((r) => r.status === where.status) ?? null), save: jest.fn(async (v) => v) }],
      [RewardPointsLedger, { exists: jest.fn(async ({ where }) => ledger.some((l) => l.eventKey === where.eventKey)), create: jest.fn((v) => v), save: jest.fn(async (v) => ledger.push(v)) }],
    ]);
    const generic = { find: jest.fn(async () => []), findOne: jest.fn(async () => null), save: jest.fn(async (v) => v), create: jest.fn((v) => v) };
    const manager: any = { getRepository: (e: unknown) => repos.get(e) ?? generic };
    manager.transaction = (cb: any) => cb(manager);
    const subject = new BookingLifecycleService({ manager } as any);
    return { subject, redemptions, ledger, booking };
  }

  it('wellness points: marked refunded, so they count again; the cash ledger is untouched', async () => {
    const { subject, redemptions, ledger } = setup(RewardPointSource.WELLNESS);
    await subject.cancelBooking('SC-2026-ABCDEFGHIJKL', 'admin', { reason: 'Patient unwell' } as any);
    expect(redemptions[0].status).toBe(S.REFUNDED);
    expect(ledger).toHaveLength(0);
  });

  it('referral points: credited back to the ledger exactly once', async () => {
    const { subject, redemptions, ledger } = setup(RewardPointSource.REFERRAL);
    await subject.cancelBooking('SC-2026-ABCDEFGHIJKL', 'admin', {} as any);
    expect(redemptions[0].status).toBe(S.REFUNDED);
    expect(ledger).toEqual([expect.objectContaining({ eventKey: 'HEALTH_CHECK_REDEMPTION_REFUND:b1', direction: 'CREDIT', points: 400, userId: 'u1' })]);
  });
});

describe('WellnessPointsService settings and adjustments', () => {
  const settingsRepo = (value: unknown) => ({ findOne: jest.fn(async () => (value ? { key: 'wellness_points', value } : null)), save: jest.fn(async (v) => v) });
  const make = (value: unknown, adjustTotal = 0) =>
    new WellnessPointsService(
      { earnedPoints: jest.fn(async () => 300) } as any,
      { findOne: jest.fn(async () => ({ id: 'p1', userId: 'u1' })) } as any,
      { createQueryBuilder: () => ({ select: () => ({ where: () => ({ andWhere: () => ({ andWhere: () => ({ getRawOne: async () => ({ used: '100' }) }) }) }) }) }) } as any,
      { createQueryBuilder: () => ({ select: () => ({ where: () => ({ getRawOne: async () => ({ total: String(adjustTotal) }) }) }) }) } as any,
      settingsRepo(value) as any,
      { get: (k: string) => ({ WELLNESS_POINT_VALUES: 'NGN:5,GHS:0.04,RWF:4' } as Record<string, string>)[k] } as any,
    );

  it('uses server defaults, with staff changes on top', async () => {
    expect(await make(null).rules()).toEqual({ valuePerPointMinor: { NGN: 500, GHS: 4, RWF: 400 }, maxPercent: 20, minPoints: 100, paused: false });
    expect(await make({ paused: true, maxPercent: 10, valuePerPoint: { NGN: '2.50' } }).rules()).toMatchObject({ paused: true, maxPercent: 10, valuePerPointMinor: { NGN: 250, GHS: 4 } });
  });

  it('counts staff adjustments in the balance and never goes below zero', async () => {
    expect(await make(null, 50).wallet('u1')).toEqual({ earnedPoints: 300, usedPoints: 100, adjustedPoints: 50, availablePoints: 250 });
    expect((await make(null, -900).wallet('u1')).availablePoints).toBe(0);
  });
});

describe('WellnessAdminService', () => {
  function setup(available = 120) {
    const saved: any[] = [];
    const wellness: any = {
      wallet: jest.fn(async () => ({ earnedPoints: available, usedPoints: 0, adjustedPoints: 0, availablePoints: available })),
      rules: jest.fn(async () => ({ valuePerPointMinor: { NGN: 500 }, maxPercent: 20, minPoints: 100, paused: false })),
      override: jest.fn(async () => ({ valuePerPoint: { GHS: '0.04' } })),
      saveOverride: jest.fn(async (v) => v),
    };
    const manager: any = {
      getRepository: (e: unknown) => (e === WellnessPointAdjustment ? { create: (v: any) => v, save: async (v: any) => saved.push(v) } : { findOne: async () => ({ id: 'u1' }) }),
    };
    manager.transaction = (cb: any) => cb(manager);
    const adjustments: any = { manager, find: jest.fn(async () => []), createQueryBuilder: () => ({ select: () => ({ addSelect: () => ({ addSelect: () => ({ getRawOne: async () => ({}) }) }) }) }) };
    const redemptions: any = { find: jest.fn(async () => []), createQueryBuilder: () => { const qb: any = {}; for (const m of ['select', 'addSelect', 'where', 'groupBy', 'addGroupBy']) qb[m] = () => qb; qb.getRawMany = async () => []; return qb; } };
    const patients: any = { findOne: jest.fn(async () => ({ patientReference: 'SCP-DH73-T4JW', userId: 'u1', givenName: 'Ada', familyName: 'Obi' })) };
    return { subject: new WellnessAdminService(wellness, patients, redemptions, adjustments), saved, wellness, patients };
  }
  const admin: any = { id: 'admin-1' };

  it('adds points with a reason and records who did it', async () => {
    const { subject, saved } = setup();
    await subject.adjust('SCP-DH73-T4JW', 100, '  Goodwill after a missed visit ', admin);
    expect(saved).toEqual([{ userId: 'u1', points: 100, reason: 'Goodwill after a missed visit', adminUserId: 'admin-1' }]);
  });

  it('refuses zero, huge amounts, a missing reason, or taking a patient below zero', async () => {
    const { subject, saved } = setup(120);
    await expect(subject.adjust('SCP-DH73-T4JW', 0, 'reason here', admin)).rejects.toBeInstanceOf(BadRequestException);
    await expect(subject.adjust('SCP-DH73-T4JW', 20000, 'reason here', admin)).rejects.toBeInstanceOf(BadRequestException);
    await expect(subject.adjust('SCP-DH73-T4JW', 10, 'no', admin)).rejects.toBeInstanceOf(BadRequestException);
    await expect(subject.adjust('SCP-DH73-T4JW', -121, 'correction', admin)).rejects.toBeInstanceOf(ConflictException);
    await subject.adjust('SCP-DH73-T4JW', -120, 'correction', admin);
    expect(saved).toHaveLength(1);
  });

  it('has no points for family members without their own account', async () => {
    const { subject, patients } = setup();
    patients.findOne.mockResolvedValueOnce({ patientReference: 'SCP-AAAA-BBBB', userId: null });
    await expect(subject.patient('SCP-AAAA-BBBB')).rejects.toBeInstanceOf(ConflictException);
  });

  it('checks settings before saving and keeps other currencies', async () => {
    const { subject, wellness } = setup();
    await expect(subject.updateSettings({ maxPercent: 80 }, admin)).rejects.toBeInstanceOf(BadRequestException);
    await expect(subject.updateSettings({ valuePerPoint: { USD: '1' } }, admin)).rejects.toBeInstanceOf(BadRequestException);
    await expect(subject.updateSettings({ valuePerPoint: { NGN: '-1' } }, admin)).rejects.toBeInstanceOf(BadRequestException);
    await subject.updateSettings({ paused: true, valuePerPoint: { NGN: '6' } }, admin);
    expect(wellness.saveOverride).toHaveBeenCalledWith({ paused: true, valuePerPoint: { GHS: '0.04', NGN: '6.00' } }, 'admin-1');
  });
});

// Keep the AppSetting import used (entity registered with the module).
void AppSetting;
