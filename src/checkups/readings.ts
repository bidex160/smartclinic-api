/**
 * What a set of numbers means and what to do next. Plain, conservative adult thresholds
 * (ISH 2020 for blood pressure, WHO/ADA for glucose, WHO for BMI). Not a diagnosis: one high
 * reading is confirmed before anyone is told they have a condition, and very high readings always
 * say "get care today". The clinical team owns these numbers; they live in one place on purpose.
 */

export type Band = 'NORMAL' | 'RAISED' | 'HIGH' | 'VERY_HIGH' | 'LOW' | 'UNKNOWN';
export type GlucoseContext = 'FASTING' | 'RANDOM' | 'AFTER_MEAL';
export type NextStep = 'KNOW_NUMBERS' | 'CONFIRM' | 'DOCTOR' | 'URGENT' | 'FULL_CHECK';

export const BP = { veryHighSys: 180, veryHighDia: 120, highSys: 140, highDia: 90, raisedSys: 130, raisedDia: 85, lowSys: 90 } as const;
export const GLUCOSE_MMOL = { veryHigh: 16.7, randomHigh: 11.1, fastingHigh: 7.0, fastingRaised: 5.6, low: 3.9, veryLow: 3.0 } as const;
export const MGDL_PER_MMOL = 18;

/** Days until the next step, by result. */
export const NEXT_IN_DAYS: Record<Band, number> = { NORMAL: 365, RAISED: 21, HIGH: 7, VERY_HIGH: 0, LOW: 14, UNKNOWN: 0 };

export interface BpReading { systolic: number; diastolic: number }

/** Average of the readings, ignoring the first when there are three (the first is usually high). */
export function averageBp(readings: readonly BpReading[]): BpReading | null {
  const valid = readings.filter((r) => isPlausibleBp(r));
  if (!valid.length) return null;
  const use = valid.length >= 3 ? valid.slice(1) : valid;
  return {
    systolic: Math.round(use.reduce((s, r) => s + r.systolic, 0) / use.length),
    diastolic: Math.round(use.reduce((s, r) => s + r.diastolic, 0) / use.length),
  };
}

export function isPlausibleBp(r: BpReading): boolean {
  return Number.isFinite(r.systolic) && Number.isFinite(r.diastolic) && r.systolic >= 60 && r.systolic <= 280 && r.diastolic >= 30 && r.diastolic <= 180 && r.systolic > r.diastolic;
}

export function bpBand(r: BpReading | null): Band {
  if (!r) return 'UNKNOWN';
  if (r.systolic >= BP.veryHighSys || r.diastolic >= BP.veryHighDia) return 'VERY_HIGH';
  if (r.systolic >= BP.highSys || r.diastolic >= BP.highDia) return 'HIGH';
  if (r.systolic >= BP.raisedSys || r.diastolic >= BP.raisedDia) return 'RAISED';
  if (r.systolic < BP.lowSys) return 'LOW';
  return 'NORMAL';
}

export function toMmol(value: number, unit: 'mmol/L' | 'mg/dL'): number {
  return unit === 'mg/dL' ? Math.round((value / MGDL_PER_MMOL) * 10) / 10 : value;
}

export function isPlausibleGlucose(mmol: number): boolean {
  return Number.isFinite(mmol) && mmol >= 1 && mmol <= 40;
}

export function glucoseBand(mmol: number | null, context: GlucoseContext | null): Band {
  if (mmol === null || !isPlausibleGlucose(mmol)) return 'UNKNOWN';
  if (mmol >= GLUCOSE_MMOL.veryHigh || mmol < GLUCOSE_MMOL.veryLow) return 'VERY_HIGH';
  if (mmol < GLUCOSE_MMOL.low) return 'LOW';
  if (context === 'FASTING') {
    if (mmol >= GLUCOSE_MMOL.fastingHigh) return 'HIGH';
    if (mmol >= GLUCOSE_MMOL.fastingRaised) return 'RAISED';
    return 'NORMAL';
  }
  // Random or after a meal: only clearly high values mean anything.
  if (mmol >= GLUCOSE_MMOL.randomHigh) return 'HIGH';
  if (mmol >= 7.8) return 'RAISED';
  return 'NORMAL';
}

export function bmi(weightKg: number | null, heightCm: number | null): number | null {
  if (!weightKg || !heightCm || weightKg < 20 || weightKg > 350 || heightCm < 100 || heightCm > 230) return null;
  return Math.round((weightKg / (heightCm / 100) ** 2) * 10) / 10;
}

export function bmiBand(value: number | null): Band {
  if (value === null) return 'UNKNOWN';
  if (value >= 30) return 'HIGH';
  if (value >= 25) return 'RAISED';
  if (value < 18.5) return 'LOW';
  return 'NORMAL';
}

const ORDER: Band[] = ['UNKNOWN', 'NORMAL', 'LOW', 'RAISED', 'HIGH', 'VERY_HIGH'];
/** The band that decides the plan: the most serious of blood pressure and sugar (BMI never makes it urgent). */
export function overallBand(bp: Band, glucose: Band, bmiResult: Band): Band {
  const main = [bp, glucose].reduce((a, b) => (ORDER.indexOf(b) > ORDER.indexOf(a) ? b : a), 'UNKNOWN' as Band);
  if (main === 'UNKNOWN') return 'UNKNOWN';
  if (main === 'NORMAL' && (bmiResult === 'HIGH' || bmiResult === 'RAISED')) return 'RAISED';
  return main;
}

export function nextStepFor(band: Band, hasConfirmed: boolean): NextStep {
  switch (band) {
    case 'VERY_HIGH': return 'URGENT';
    case 'HIGH': return 'DOCTOR';
    case 'RAISED':
    case 'LOW': return hasConfirmed ? 'DOCTOR' : 'CONFIRM';
    case 'NORMAL': return 'FULL_CHECK';
    default: return 'KNOW_NUMBERS';
  }
}

/** Which Health Check package each step books. */
export const STEP_PACKAGE: Partial<Record<NextStep, string>> = { CONFIRM: 'BASIC', DOCTOR: 'BASIC', FULL_CHECK: 'ESSENTIAL' };

export interface Advice { title: string; body: string; urgent: boolean }

export function adviceFor(band: Band): Advice {
  switch (band) {
    case 'VERY_HIGH':
      return { urgent: true, title: 'Please get care today', body: 'This reading is very high. Go to a clinic or hospital today. If you have chest pain, a bad headache, trouble breathing or speaking, weakness on one side, or confusion, call an ambulance or go to emergency now.' };
    case 'HIGH':
      return { urgent: false, title: 'See a doctor this week', body: 'Your numbers are high. That doesn’t mean something is wrong yet, but a doctor should check you within a week. Book below.' };
    case 'RAISED':
      return { urgent: false, title: 'Let’s confirm in a few weeks', body: 'Your numbers are a little above where they should be. One reading can be high for many reasons, so we’ll check again in about 3 weeks.' };
    case 'LOW':
      return { urgent: false, title: 'A bit low', body: 'Your reading is on the low side. If you feel dizzy, faint or shaky, eat or drink something and sit down, and see a doctor if it keeps happening.' };
    case 'NORMAL':
      return { urgent: false, title: 'Looking good', body: 'Your numbers are in a healthy range. Keep it up. We’ll remind you when your yearly full check is due.' };
    default:
      return { urgent: false, title: 'Know your numbers', body: 'Your blood pressure and sugar tell you a lot, even when you feel fine. The first check is free.' };
  }
}

/** Advice for where the plan stands (a second raised reading means a doctor, not another wait). */
export function adviceForPlan(band: Band, step: NextStep): Advice {
  if (step === 'DOCTOR' && (band === 'RAISED' || band === 'LOW')) {
    return { urgent: false, title: 'Time to see a doctor', body: 'Your numbers have been above where they should be more than once. A doctor should check you in the next week or so. Book below.' };
  }
  if (step === 'CONFIRM' && band === 'NORMAL') {
    return { urgent: false, title: 'Better: let’s check once more', body: 'This reading is in a healthy range. Because an earlier one was high, we’ll check again in about 3 weeks to be sure.' };
  }
  return adviceFor(band);
}
