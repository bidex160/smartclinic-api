import { BadRequestException, ForbiddenException, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { NotificationEntityType } from '../notifications/enums/notification-entity-type.enum';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { Patient } from '../patients/entities/patient.entity';
import { PatientStatus } from '../patients/enums/patient-status.enum';
import { User } from '../users/entities/user.entity';
import { CheckupPlan, ReadingSource, VitalReading } from './checkup.entities';
import {
  adviceForPlan, averageBp, Band, bmi, bmiBand, bpBand, BpReading, glucoseBand, GlucoseContext, isPlausibleBp, isPlausibleGlucose,
  NEXT_IN_DAYS, nextStepFor, NextStep, overallBand, STEP_PACKAGE, toMmol,
} from './readings';

const DAY = 86_400_000;
/** Before anyone has had a full check, it comes 30 days after their first numbers; after that, yearly. */
const FIRST_FULL_CHECK_DAYS = 30;
const SCHEDULER_MS = 60 * 60_000;

export interface ReadingInput {
  bloodPressure?: { systolic: number; diastolic: number }[];
  pulse?: number | null;
  glucose?: { value: number; unit: 'mmol/L' | 'mg/dL'; context: GlucoseContext } | null;
  weightKg?: number | null;
  heightCm?: number | null;
  measuredAt?: string | Date | null;
}

export interface Evaluated {
  bp: BpReading | null;
  bpReadings: [number, number][] | null;
  pulse: number | null;
  glucoseMmol: number | null;
  glucoseContext: GlucoseContext | null;
  weightKg: number | null;
  heightCm: number | null;
  bmi: number | null;
  bands: { bloodPressure: Band; glucose: Band; bmi: Band };
  band: Band;
  measuredAt: Date;
}

/** Check and summarise one set of numbers. Throws on numbers that can't be real. */
export function evaluate(input: ReadingInput, now = new Date(), lastHeightCm: number | null = null): Evaluated {
  const bpList = (input.bloodPressure ?? []).slice(0, 3);
  for (const r of bpList) if (!isPlausibleBp(r)) throw new BadRequestException('Check the blood pressure numbers: the top number is usually 90–200 and the bottom 50–120.');
  const bp = averageBp(bpList);
  let glucoseMmol: number | null = null;
  if (input.glucose && input.glucose.value !== null && input.glucose.value !== undefined) {
    glucoseMmol = toMmol(Number(input.glucose.value), input.glucose.unit);
    if (!isPlausibleGlucose(glucoseMmol)) throw new BadRequestException('Check the sugar number and its unit (mmol/L or mg/dL).');
  }
  const pulse = input.pulse ? Math.round(Number(input.pulse)) : null;
  if (pulse !== null && (pulse < 30 || pulse > 220)) throw new BadRequestException('Check the pulse: it is usually 50–120.');
  const weightKg = input.weightKg ? Math.round(Number(input.weightKg) * 10) / 10 : null;
  if (weightKg !== null && (weightKg < 20 || weightKg > 350)) throw new BadRequestException('Check the weight (in kg).');
  const heightCm = input.heightCm ? Math.round(Number(input.heightCm) * 10) / 10 : lastHeightCm;
  if (input.heightCm && (heightCm! < 100 || heightCm! > 230)) throw new BadRequestException('Check the height (in cm).');
  if (!bp && glucoseMmol === null && weightKg === null && pulse === null) throw new BadRequestException('Add at least one number.');
  const measuredAt = input.measuredAt ? new Date(input.measuredAt) : now;
  if (Number.isNaN(measuredAt.getTime()) || measuredAt.getTime() > now.getTime() + 5 * 60_000 || measuredAt.getTime() < now.getTime() - 30 * DAY) {
    throw new BadRequestException('The date must be in the last 30 days.');
  }
  const bmiValue = bmi(weightKg, heightCm);
  const bands = { bloodPressure: bpBand(bp), glucose: glucoseBand(glucoseMmol, input.glucose?.context ?? null), bmi: bmiBand(bmiValue) };
  return {
    bp, bpReadings: bpList.length ? bpList.map((r) => [Math.round(r.systolic), Math.round(r.diastolic)] as [number, number]) : null,
    pulse, glucoseMmol, glucoseContext: glucoseMmol === null ? null : input.glucose?.context ?? 'RANDOM', weightKg, heightCm, bmi: bmiValue,
    bands, band: overallBand(bands.bloodPressure, bands.glucose, bands.bmi), measuredAt,
  };
}

/** Where the plan goes after a reading. Pure, so the rules are easy to test and to read. */
export function planAfter(
  prev: (Pick<CheckupPlan, 'nextStep' | 'confirmedAt' | 'numbersDoneAt'> & { band?: Band }) | null,
  band: Band,
  measuredAt: Date,
  hadFullCheck: boolean,
): { nextStep: NextStep; nextDueAt: Date | null; confirmedAt: Date | null } {
  if (band === 'UNKNOWN') return { nextStep: prev?.nextStep ?? 'KNOW_NUMBERS', nextDueAt: null, confirmedAt: prev?.confirmedAt ?? null };
  // A second raised reading after we asked them to confirm counts as confirmed.
  // So does a raised reading after a high one: two readings above normal.
  const wasHigh = prev?.band === 'HIGH' || prev?.band === 'VERY_HIGH';
  const confirming = (prev?.nextStep === 'CONFIRM' || wasHigh || prev?.nextStep === 'DOCTOR') && (band === 'RAISED' || band === 'LOW');
  const confirmedAt = confirming ? measuredAt : band === 'NORMAL' ? null : prev?.confirmedAt ?? null;
  // Normal after a high reading: good, but check once more before calling it settled.
  const nextStep = wasHigh && band === 'NORMAL' ? 'CONFIRM' : nextStepFor(band, Boolean(confirmedAt));
  let days = NEXT_IN_DAYS[band];
  if (nextStep === 'FULL_CHECK' && !hadFullCheck) days = FIRST_FULL_CHECK_DAYS;
  if (nextStep === 'DOCTOR' && band !== 'HIGH') days = 7;
  if (nextStep === 'CONFIRM' && band === 'NORMAL') days = 21;
  return { nextStep, nextDueAt: new Date(measuredAt.getTime() + days * DAY), confirmedAt };
}

/**
 * The check-up plan: "Know your numbers" first (free), then the next step chosen from the result,
 * with a reminder when it's due. Readings from home, a pharmacy free check, or a home visit all
 * feed the same plan.
 */
@Injectable()
export class CheckupsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CheckupsService.name);
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(VitalReading) private readonly readings: Repository<VitalReading>,
    @InjectRepository(CheckupPlan) private readonly plans: Repository<CheckupPlan>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  onModuleInit(): void {
    if (process.env['NODE_ENV'] === 'test' || this.config?.get('CHECKUP_REMINDERS_ENABLED') === 'false') return;
    this.interval = setInterval(() => {
      this.sendDueReminders().catch((e) => this.logger.warn(`Checkup reminders failed: ${e instanceof Error ? e.name : 'UNKNOWN'}`));
    }, SCHEDULER_MS);
    this.interval.unref?.();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
  }

  async patientFor(user: User): Promise<Patient> {
    const patient = await this.patients.findOne({ where: { userId: user.id, status: PatientStatus.ACTIVE } });
    if (!patient) throw new ForbiddenException('A patient profile is needed for check-ups');
    return patient;
  }

  /** Everything the check-up screen needs: the plan, latest numbers, advice and prices. */
  async view(user: User) {
    const patient = await this.patientFor(user);
    return this.viewFor(patient);
  }

  async viewFor(patient: Patient, now = new Date()) {
    const [plan, latest, history, prices] = await Promise.all([
      this.plans.findOne({ where: { patientId: patient.id } }),
      this.readings.findOne({ where: { patientId: patient.id }, order: { measuredAt: 'DESC' } }),
      this.readings.find({ where: { patientId: patient.id }, order: { measuredAt: 'DESC' }, take: 12 }),
      this.packagePrices(patient.countryCode === 'GH' ? 'GHS' : patient.countryCode === 'RW' ? 'RWF' : 'NGN'),
    ]);
    const band: Band = plan?.band ?? 'UNKNOWN';
    const nextStep: NextStep = plan?.nextStep ?? 'KNOW_NUMBERS';
    const packageCode = STEP_PACKAGE[nextStep] ?? null;
    return {
      band,
      advice: adviceForPlan(band, nextStep),
      latest: latest ? this.readingView(latest) : null,
      history: history.map((r) => this.readingView(r)),
      plan: {
        nextStep,
        nextDueAt: plan?.nextDueAt ?? null,
        overdue: Boolean(plan?.nextDueAt && plan.nextDueAt.getTime() < now.getTime()),
        numbersDoneAt: plan?.numbersDoneAt ?? null,
        confirmedAt: plan?.confirmedAt ?? null,
        package: packageCode ? prices.find((p) => p.code === packageCode) ?? { code: packageCode, name: null, fromPriceMinor: null, currency: null } : null,
        steps: this.steps(plan, latest),
      },
      packages: prices,
    };
  }

  /** Save numbers taken at home. */
  async addHomeReading(user: User, input: ReadingInput) {
    const patient = await this.patientFor(user);
    await this.dataSource.transaction((m) => this.record(m, { patientId: patient.id, voucherId: null, source: 'HOME', providerId: null, enteredByUserId: user.id }, input));
    return this.viewFor(patient);
  }

  /** Save a reading (from any source) and move the plan on. */
  async record(
    manager: EntityManager,
    who: { patientId: string | null; voucherId: string | null; source: ReadingSource; providerId: string | null; enteredByUserId: string | null },
    input: ReadingInput,
    now = new Date(),
  ): Promise<{ reading: VitalReading; evaluated: Evaluated }> {
    const lastHeight = who.patientId ? await this.lastHeight(manager, who.patientId) : null;
    const e = evaluate(input, now, lastHeight);
    const repo = manager.getRepository(VitalReading);
    const reading = await repo.save(repo.create({
      patientId: who.patientId, voucherId: who.voucherId, source: who.source, providerId: who.providerId, enteredByUserId: who.enteredByUserId,
      systolic: e.bp?.systolic ?? null, diastolic: e.bp?.diastolic ?? null, bpReadings: e.bpReadings, pulse: e.pulse,
      glucoseMmol: e.glucoseMmol === null ? null : e.glucoseMmol.toFixed(1), glucoseContext: e.glucoseContext,
      weightKg: e.weightKg === null ? null : e.weightKg.toFixed(1), heightCm: e.heightCm === null ? null : e.heightCm.toFixed(1),
      band: e.band, measuredAt: e.measuredAt,
    }));
    if (who.patientId) await this.advancePlan(manager, who.patientId, reading, e);
    return { reading, evaluated: e };
  }

  private async advancePlan(manager: EntityManager, patientId: string, reading: VitalReading, e: Evaluated) {
    const repo = manager.getRepository(CheckupPlan);
    const prev = await repo.findOne({ where: { patientId }, lock: { mode: 'pessimistic_write' } });
    // An older reading entered late doesn't move the plan backwards.
    if (prev?.lastReadingId && prev.numbersDoneAt && e.measuredAt.getTime() < prev.numbersDoneAt.getTime()) return;
    const hadFullCheck = await this.hadFullCheck(manager, patientId);
    const next = planAfter(prev, e.band, e.measuredAt, hadFullCheck);
    await repo.save({
      ...(prev ?? { reminderCount: 0, remindedFor: null }),
      patientId,
      band: e.band === 'UNKNOWN' ? prev?.band ?? 'UNKNOWN' : e.band,
      nextStep: next.nextStep,
      nextDueAt: next.nextDueAt,
      confirmedAt: next.confirmedAt,
      numbersDoneAt: e.measuredAt,
      lastReadingId: reading.id,
      reminderCount: 0,
    });
  }

  /** Hourly: remind people whose next step is due (once, and once more a week later). */
  async sendDueReminders(now = new Date()): Promise<number> {
    const due = await this.plans.createQueryBuilder('p')
      .where('p.nextDueAt IS NOT NULL AND p.nextDueAt <= :now', { now })
      .andWhere('p.nextStep IN (:...steps)', { steps: ['CONFIRM', 'DOCTOR', 'FULL_CHECK'] })
      .andWhere('(p.remindedFor IS NULL OR p.remindedFor <> p.nextDueAt OR (p.reminderCount < 2 AND p.updatedAt < :weekAgo))', { weekAgo: new Date(now.getTime() - 7 * DAY) })
      .take(500)
      .getMany();
    let sent = 0;
    for (const plan of due) {
      // Did a full Health Check since? Then the next one is a year after it, and no reminder now.
      if (plan.nextStep === 'FULL_CHECK') {
        const done = await this.lastFullCheck(plan.patientId);
        if (done && (!plan.numbersDoneAt || done.getTime() > plan.numbersDoneAt.getTime() - 30 * DAY)) {
          await this.plans.update({ patientId: plan.patientId }, { nextDueAt: new Date(done.getTime() + 365 * DAY), reminderCount: 0, remindedFor: null });
          continue;
        }
      }
      const patient = await this.patients.findOne({ where: { id: plan.patientId, status: PatientStatus.ACTIVE } });
      const sameDue = plan.remindedFor?.getTime() === plan.nextDueAt!.getTime();
      await this.plans.update({ patientId: plan.patientId }, { remindedFor: plan.nextDueAt, reminderCount: sameDue ? plan.reminderCount + 1 : 1 });
      if (!patient?.userId || !this.notifications) continue;
      const text = REMINDER_TEXT[plan.nextStep] ?? REMINDER_TEXT['FULL_CHECK']!;
      try {
        await this.dataSource.transaction((m) => this.notifications!.createTransactionalNotification(m, {
          userId: patient.userId!, type: NotificationType.CHECKUP_DUE, title: text.title, message: text.body,
          entityType: NotificationEntityType.WELLNESS, entityReference: patient.patientReference,
          metadata: { route: '/me/checkup', kind: 'checkupDue', step: plan.nextStep },
          idempotencyKey: `checkup-due:${plan.patientId}:${plan.nextDueAt!.toISOString()}:${sameDue ? plan.reminderCount + 1 : 1}`,
          email: { enabled: true },
        }));
        sent += 1;
      } catch {
        this.logger.warn('Checkup reminder could not be created');
      }
    }
    return sent;
  }

  readingView(r: VitalReading) {
    return {
      id: r.id,
      measuredAt: r.measuredAt,
      source: r.source,
      bloodPressure: r.systolic !== null ? { systolic: r.systolic, diastolic: r.diastolic } : null,
      bloodPressureReadings: r.bpReadings,
      pulse: r.pulse,
      glucose: r.glucoseMmol !== null ? { mmol: Number(r.glucoseMmol), mgdl: Math.round(Number(r.glucoseMmol) * 18), context: r.glucoseContext } : null,
      weightKg: r.weightKg === null ? null : Number(r.weightKg),
      bmi: bmi(r.weightKg === null ? null : Number(r.weightKg), r.heightCm === null ? null : Number(r.heightCm)),
      band: r.band,
    };
  }

  private steps(plan: CheckupPlan | null, latest: VitalReading | null) {
    const done = Boolean(latest);
    const step = plan?.nextStep ?? 'KNOW_NUMBERS';
    return [
      { key: 'KNOW_NUMBERS', status: done ? 'DONE' : 'NOW', at: plan?.numbersDoneAt ?? null },
      { key: 'CONFIRM', status: plan?.confirmedAt ? 'DONE' : step === 'CONFIRM' || step === 'DOCTOR' || step === 'URGENT' ? 'NEXT' : done && plan?.band === 'NORMAL' ? 'SKIPPED' : 'LATER', at: plan?.confirmedAt ?? (step === 'CONFIRM' ? plan?.nextDueAt ?? null : null) },
      { key: 'FULL_CHECK', status: step === 'FULL_CHECK' ? 'NEXT' : 'LATER', at: step === 'FULL_CHECK' ? plan?.nextDueAt ?? null : null },
    ];
  }

  private async lastHeight(manager: EntityManager, patientId: string): Promise<number | null> {
    const [row] = await manager.query('SELECT height_cm FROM vital_readings WHERE patient_id = $1 AND height_cm IS NOT NULL ORDER BY measured_at DESC LIMIT 1', [patientId]);
    return row?.height_cm ? Number(row.height_cm) : null;
  }

  private async lastFullCheck(patientId: string): Promise<Date | null> {
    try {
      const [row] = await this.dataSource.query(
        `SELECT MAX(e.completed_at) AS at FROM health_check_encounters e JOIN bookings b ON b.id = e.booking_id
         WHERE b.participant_patient_id = $1 AND e.status = 'COMPLETED'`,
        [patientId],
      );
      return row?.at ? new Date(row.at) : null;
    } catch {
      return null;
    }
  }

  private async hadFullCheck(manager: EntityManager, patientId: string): Promise<boolean> {
    try {
      const [row] = await manager.query(
        `SELECT 1 AS ok FROM health_check_encounters e JOIN bookings b ON b.id = e.booking_id
         WHERE b.participant_patient_id = $1 AND e.status = 'COMPLETED' AND e.completed_at > now() - interval '365 days' LIMIT 1`,
        [patientId],
      );
      return Boolean(row);
    } catch {
      return false;
    }
  }

  /** Current "from" price of each Health Check, for showing what the next step costs. */
  async packagePrices(currency = 'NGN'): Promise<{ code: string; name: string | null; fromPriceMinor: number | null; currency: string | null }[]> {
    try {
      const rows: { code: string; name: string; amount: string }[] = await this.dataSource.query(
        `SELECT p.code, p.name, MIN(pp.amount)::text AS amount FROM health_check_packages p
         JOIN package_prices pp ON pp.health_check_package_id = p.id
         WHERE p.is_active AND pp.is_active AND pp.currency = $1 AND pp.effective_from <= CURRENT_DATE AND (pp.effective_to IS NULL OR CURRENT_DATE < pp.effective_to)
         GROUP BY p.code, p.name ORDER BY MIN(pp.amount)`,
        [currency],
      );
      return rows.map((r) => ({ code: r.code, name: r.name, fromPriceMinor: Math.round(Number(r.amount) * 100), currency }));
    } catch {
      return [];
    }
  }
}

const REMINDER_TEXT: Partial<Record<NextStep, { title: string; body: string }>> = {
  CONFIRM: { title: 'Time to confirm your numbers', body: 'Your last check was a little high. A quick repeat check tells us if it was a one-off. It takes about 30 minutes.' },
  DOCTOR: { title: 'Please see a doctor about your numbers', body: 'Your numbers were high. Book a doctor’s check this week: it’s quick, and catching it early makes a big difference.' },
  FULL_CHECK: { title: 'Your full check-up is due', body: 'Time for your full health check. Your points can bring the price down.' },
};
