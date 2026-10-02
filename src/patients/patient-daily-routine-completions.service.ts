import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { User } from "../users/entities/user.entity";
import { DailyCareProgressDto } from "./dto/patient-daily-routine.dto";
import { PatientDailyCheckIn } from "./entities/patient-daily-check-in.entity";
import { PatientDailyRoutineCompletion } from "./entities/patient-daily-routine-completion.entity";
import { PatientDailyRoutine } from "./entities/patient-daily-routine.entity";
import { Patient } from "./entities/patient.entity";
import { PatientStatus } from "./enums/patient-status.enum";

const DEFAULT_TIMEZONE = "Africa/Lagos";
const STREAK_LOOKBACK_DAYS = 400;

@Injectable()
export class PatientDailyRoutineCompletionsService {
  constructor(
    @InjectRepository(PatientDailyRoutineCompletion)
    private readonly completions: Repository<PatientDailyRoutineCompletion>,
    @InjectRepository(PatientDailyRoutine)
    private readonly routines: Repository<PatientDailyRoutine>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(PatientDailyCheckIn)
    private readonly checkIns: Repository<PatientDailyCheckIn>,
  ) {}

  /** Marks a routine done for today in its own timezone. Idempotent. */
  async complete(
    user: User,
    reference: string,
    now = new Date(),
  ): Promise<DailyCareProgressDto> {
    const routine = await this.ownedRoutine(user, reference);
    const localDate = localDateIn(now, routine.timezone);
    await this.completions
      .createQueryBuilder()
      .insert()
      .values({ routineId: routine.id, patientId: routine.patientId, localDate })
      .orIgnore()
      .execute();
    return this.progress(routine.patientId, routine.timezone, now);
  }

  /** Removes today's tick for a routine, if any. Idempotent. */
  async undo(
    user: User,
    reference: string,
    now = new Date(),
  ): Promise<DailyCareProgressDto> {
    const routine = await this.ownedRoutine(user, reference);
    await this.completions.delete({
      routineId: routine.id,
      localDate: localDateIn(now, routine.timezone),
    });
    return this.progress(routine.patientId, routine.timezone, now);
  }

  /**
   * Today's ticks and check-in, the current and best streak, and the last
   * seven days. A day is "active" when a routine was ticked or a check-in was
   * saved; the current streak ends today, or yesterday while today is not
   * yet active, so it is never lost before the day is over.
   */
  async progress(
    patientId: string,
    timezone: string = DEFAULT_TIMEZONE,
    now = new Date(),
  ): Promise<DailyCareProgressDto> {
    const today = localDateIn(now, timezone);
    const window = { today, lookback: STREAK_LOOKBACK_DAYS };
    const [ticks, checkIns]: [
      { localDate: string; reference: string }[],
      { localDate: string; mood: number; energy: number | null; sleep: number | null }[],
    ] = await Promise.all([
      this.completions
        .createQueryBuilder("completion")
        .innerJoin("completion.routine", "routine")
        .select("completion.local_date::text", "localDate")
        .addSelect("routine.reference", "reference")
        .where("completion.patient_id = :patientId", { patientId })
        .andWhere("completion.local_date > (:today::date - :lookback::int)", window)
        .getRawMany(),
      this.checkIns
        .createQueryBuilder("checkIn")
        .select('"checkIn"."local_date"::text', "localDate")
        .addSelect("checkIn.mood", "mood")
        .addSelect("checkIn.energy", "energy")
        .addSelect("checkIn.sleep", "sleep")
        .where("checkIn.patient_id = :patientId", { patientId })
        .andWhere("checkIn.local_date > (:today::date - :lookback::int)", window)
        .getRawMany(),
    ]);

    const activeDays = new Set([
      ...ticks.map((row) => row.localDate),
      ...checkIns.map((row) => row.localDate),
    ]);
    const todayCheckIn = checkIns.find((row) => row.localDate === today);
    return {
      localDate: today,
      completedReferences: ticks
        .filter((row) => row.localDate === today)
        .map((row) => row.reference),
      streakDays: streakEndingAt(today, activeDays),
      bestStreak: longestStreak(activeDays),
      todayCheckIn: todayCheckIn
        ? {
            mood: Number(todayCheckIn.mood),
            energy: todayCheckIn.energy === null ? null : Number(todayCheckIn.energy),
            sleep: todayCheckIn.sleep === null ? null : Number(todayCheckIn.sleep),
          }
        : null,
      week: Array.from({ length: 7 }, (_, index) => {
        const localDate = shiftDate(today, index - 6);
        return { localDate, active: activeDays.has(localDate) };
      }),
    };
  }

  private async ownedRoutine(
    user: User,
    reference: string,
  ): Promise<PatientDailyRoutine> {
    const patient = await this.patients.findOne({
      where: { userId: user.id, status: PatientStatus.ACTIVE },
    });
    if (!patient || patient.deletedAt)
      throw new NotFoundException(
        "Patient profile was not found for the authenticated user",
      );
    const routine = await this.routines.findOne({
      where: { reference, patientId: patient.id, enabled: true },
    });
    if (!routine) throw new NotFoundException("Daily routine was not found");
    return routine;
  }
}

export function localDateIn(date: Date, timezone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function streakEndingAt(today: string, days: ReadonlySet<string>): number {
  let cursor = days.has(today) ? today : shiftDate(today, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = shiftDate(cursor, -1);
  }
  return streak;
}

export function longestStreak(days: ReadonlySet<string>): number {
  let best = 0;
  for (const day of days) {
    if (days.has(shiftDate(day, -1))) continue; // not the start of a run
    let length = 1;
    while (days.has(shiftDate(day, length))) length += 1;
    best = Math.max(best, length);
  }
  return best;
}

export function shiftDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
