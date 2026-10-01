import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { User } from "../users/entities/user.entity";
import { DailyCareProgressDto } from "./dto/patient-daily-routine.dto";
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
   * Today's completed routines and the number of consecutive local days
   * (ending today, or yesterday when nothing is ticked yet today) on which
   * the patient completed at least one routine.
   */
  async progress(
    patientId: string,
    timezone: string = DEFAULT_TIMEZONE,
    now = new Date(),
  ): Promise<DailyCareProgressDto> {
    const today = localDateIn(now, timezone);
    const rows: { localDate: string; reference: string }[] = await this.completions
      .createQueryBuilder("completion")
      .innerJoin("completion.routine", "routine")
      .select('completion.local_date::text', "localDate")
      .addSelect("routine.reference", "reference")
      .where("completion.patient_id = :patientId", { patientId })
      .andWhere("completion.local_date > (:today::date - :lookback::int)", {
        today,
        lookback: STREAK_LOOKBACK_DAYS,
      })
      .orderBy("completion.local_date", "DESC")
      .getRawMany();

    return {
      localDate: today,
      completedReferences: rows
        .filter((row) => row.localDate === today)
        .map((row) => row.reference),
      streakDays: streakEndingAt(
        today,
        new Set(rows.map((row) => row.localDate)),
      ),
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

function shiftDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
