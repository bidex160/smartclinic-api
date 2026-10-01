import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { User } from "../users/entities/user.entity";
import {
  DailyCareProgressDto,
  DailyCheckInListDto,
  UpsertDailyCheckInDto,
} from "./dto/patient-daily-routine.dto";
import { PatientDailyCheckIn } from "./entities/patient-daily-check-in.entity";
import { Patient } from "./entities/patient.entity";
import { PatientStatus } from "./enums/patient-status.enum";
import {
  localDateIn,
  PatientDailyRoutineCompletionsService,
  shiftDate,
} from "./patient-daily-routine-completions.service";

const MAX_HISTORY_DAYS = 31;

@Injectable()
export class PatientDailyCheckInsService {
  constructor(
    @InjectRepository(PatientDailyCheckIn)
    private readonly checkIns: Repository<PatientDailyCheckIn>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    private readonly progress: PatientDailyRoutineCompletionsService,
  ) {}

  /** Saves (or replaces) today's check-in in the patient's timezone. */
  async upsertToday(
    user: User,
    dto: UpsertDailyCheckInDto,
    now = new Date(),
  ): Promise<DailyCareProgressDto> {
    const patient = await this.patient(user.id);
    const localDate = localDateIn(now, dto.timezone);
    await this.checkIns
      .createQueryBuilder()
      .insert()
      .values({
        patientId: patient.id,
        localDate,
        mood: dto.mood,
        energy: dto.energy ?? null,
        sleep: dto.sleep ?? null,
        timezone: dto.timezone,
      })
      .orUpdate(["mood", "energy", "sleep", "timezone", "updated_at"], ["patient_id", "local_date"])
      .execute();
    return this.progress.progress(patient.id, dto.timezone, now);
  }

  /** The patient's own check-ins for the last `days` local days, newest first. */
  async list(
    user: User,
    days: number,
    timezone: string,
    now = new Date(),
  ): Promise<DailyCheckInListDto> {
    const patient = await this.patient(user.id);
    const span = Math.min(Math.max(Math.trunc(days) || 7, 1), MAX_HISTORY_DAYS);
    const from = shiftDate(localDateIn(now, timezone), 1 - span);
    const rows = await this.checkIns
      .createQueryBuilder("checkIn")
      .where("checkIn.patient_id = :patientId", { patientId: patient.id })
      .andWhere("checkIn.local_date >= :from", { from })
      .orderBy("checkIn.local_date", "DESC")
      .getMany();
    return {
      items: rows.map((row) => ({
        localDate: String(row.localDate).slice(0, 10),
        mood: row.mood,
        energy: row.energy,
        sleep: row.sleep,
      })),
    };
  }

  private async patient(userId: string): Promise<Patient> {
    const row = await this.patients.findOne({
      where: { userId, status: PatientStatus.ACTIVE },
    });
    if (!row || row.deletedAt)
      throw new NotFoundException(
        "Patient profile was not found for the authenticated user",
      );
    return row;
  }
}
