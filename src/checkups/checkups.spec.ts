import { BadRequestException } from '@nestjs/common';

import { split } from '../shop/shop.service';
import { evaluate, planAfter } from './checkups.service';
import { cleanCode, feeFor, newVoucherCode } from './free-checks.service';
import { adviceFor, averageBp, bmi, bpBand, glucoseBand, overallBand, toMmol } from './readings';

describe('what the numbers mean', () => {
  it('bands blood pressure like the guidelines', () => {
    expect(bpBand({ systolic: 118, diastolic: 76 })).toBe('NORMAL');
    expect(bpBand({ systolic: 132, diastolic: 80 })).toBe('RAISED');
    expect(bpBand({ systolic: 128, diastolic: 86 })).toBe('RAISED');
    expect(bpBand({ systolic: 145, diastolic: 88 })).toBe('HIGH');
    expect(bpBand({ systolic: 182, diastolic: 100 })).toBe('VERY_HIGH');
    expect(bpBand({ systolic: 150, diastolic: 121 })).toBe('VERY_HIGH');
    expect(bpBand({ systolic: 85, diastolic: 55 })).toBe('LOW');
  });

  it('averages readings, dropping the first of three', () => {
    expect(averageBp([{ systolic: 150, diastolic: 95 }, { systolic: 132, diastolic: 84 }, { systolic: 128, diastolic: 82 }])).toEqual({ systolic: 130, diastolic: 83 });
    expect(averageBp([{ systolic: 120, diastolic: 80 }, { systolic: 124, diastolic: 78 }])).toEqual({ systolic: 122, diastolic: 79 });
  });

  it('reads sugar by when it was taken, in either unit', () => {
    expect(toMmol(126, 'mg/dL')).toBe(7);
    expect(glucoseBand(5.2, 'FASTING')).toBe('NORMAL');
    expect(glucoseBand(6.1, 'FASTING')).toBe('RAISED');
    expect(glucoseBand(7.4, 'FASTING')).toBe('HIGH');
    expect(glucoseBand(7.4, 'RANDOM')).toBe('NORMAL');
    expect(glucoseBand(12, 'AFTER_MEAL')).toBe('HIGH');
    expect(glucoseBand(18, 'RANDOM')).toBe('VERY_HIGH');
    expect(glucoseBand(2.8, 'RANDOM')).toBe('VERY_HIGH');
    expect(glucoseBand(3.6, 'RANDOM')).toBe('LOW');
  });

  it('uses the most serious result, and weight alone never makes it urgent', () => {
    expect(overallBand('NORMAL', 'HIGH', 'NORMAL')).toBe('HIGH');
    expect(overallBand('NORMAL', 'UNKNOWN', 'HIGH')).toBe('RAISED');
    expect(overallBand('UNKNOWN', 'UNKNOWN', 'HIGH')).toBe('UNKNOWN');
    expect(bmi(80, 175)).toBe(26.1);
    expect(adviceFor('VERY_HIGH').urgent).toBe(true);
  });

  it('refuses numbers that can’t be real', () => {
    expect(() => evaluate({ bloodPressure: [{ systolic: 80, diastolic: 120 }] })).toThrow(BadRequestException);
    expect(() => evaluate({ glucose: { value: 600, unit: 'mmol/L', context: 'RANDOM' } })).toThrow(BadRequestException);
    expect(() => evaluate({})).toThrow(BadRequestException);
    const e = evaluate({ bloodPressure: [{ systolic: 128, diastolic: 82 }], weightKg: 70 }, new Date(), 170);
    expect(e).toMatchObject({ band: 'NORMAL', bmi: 24.2, heightCm: 170 });
  });
});

describe('the plan', () => {
  const at = new Date('2026-10-01T09:00:00Z');
  const days = (d: Date | null) => (d ? Math.round((d.getTime() - at.getTime()) / 86_400_000) : null);

  it('normal: first full check in 30 days, then yearly', () => {
    expect(days(planAfter(null, 'NORMAL', at, false).nextDueAt)).toBe(30);
    expect(planAfter(null, 'NORMAL', at, true)).toMatchObject({ nextStep: 'FULL_CHECK' });
    expect(days(planAfter(null, 'NORMAL', at, true).nextDueAt)).toBe(365);
  });

  it('raised: confirm in 3 weeks; raised again: see a doctor', () => {
    const first = planAfter(null, 'RAISED', at, false);
    expect(first.nextStep).toBe('CONFIRM');
    expect(days(first.nextDueAt)).toBe(21);
    const second = planAfter({ nextStep: 'CONFIRM', confirmedAt: null, numbersDoneAt: at }, 'RAISED', at, false);
    expect(second.nextStep).toBe('DOCTOR');
    expect(second.confirmedAt).toEqual(at);
    expect(planAfter({ nextStep: 'CONFIRM', confirmedAt: null, numbersDoneAt: at }, 'NORMAL', at, false).nextStep).toBe('FULL_CHECK');
  });

  it('high: doctor in a week; very high: now', () => {
    expect(planAfter(null, 'HIGH', at, false)).toMatchObject({ nextStep: 'DOCTOR' });
    expect(days(planAfter(null, 'HIGH', at, false).nextDueAt)).toBe(7);
    expect(planAfter(null, 'VERY_HIGH', at, false).nextStep).toBe('URGENT');
  });
});

describe('free checks and the shop', () => {
  it('makes short, readable codes and accepts them typed loosely', () => {
    const code = newVoucherCode();
    expect(code).toMatch(/^[ACDEFGHJKMNPQRTUVWXY34679]{8}$/);
    expect(cleanCode(' kn7f-4q9p ')).toBe('KN7F4Q9P');
  });

  it('reads fees per currency', () => {
    expect(feeFor('NGN:1000,GHS:12.5', 'NGN')).toBe(100000);
    expect(feeFor('NGN:1000,GHS:12.5', 'GHS')).toBe(1250);
    expect(feeFor(undefined, 'NGN')).toBe(0);
  });

  it('splits a price into supplier cost, referral share and margin', () => {
    expect(split(3_500_000, 2_500_000, 500)).toEqual({ referral: 175_000, margin: 825_000 });
    expect(split(1_000_000, 1_000_000, 500).margin).toBeLessThan(0);
  });
});

describe('the plan after a high reading', () => {
  it('a raised reading after a high one still means see a doctor', () => {
    const at = new Date('2026-10-01T09:00:00Z');
    expect(planAfter({ nextStep: 'DOCTOR', confirmedAt: null, numbersDoneAt: at, band: 'HIGH' }, 'RAISED', at, false).nextStep).toBe('DOCTOR');
    expect(planAfter({ nextStep: 'DOCTOR', confirmedAt: null, numbersDoneAt: at, band: 'HIGH' }, 'NORMAL', at, false).nextStep).toBe('CONFIRM');
    expect(planAfter({ nextStep: 'CONFIRM', confirmedAt: null, numbersDoneAt: at, band: 'NORMAL' }, 'NORMAL', at, false).nextStep).toBe('FULL_CHECK');
  });
});
