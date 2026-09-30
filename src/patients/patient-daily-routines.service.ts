import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { User } from "../users/entities/user.entity";
import {
  CreatePatientDailyRoutineDto,
  PatientDailyRoutineDto,
  UpdatePatientDailyRoutineDto,
} from "./dto/patient-daily-routine.dto";
import { PatientDailyRoutine } from "./entities/patient-daily-routine.entity";
import { Patient } from "./entities/patient.entity";
import {
  PatientDailyRoutineSource,
  PatientDailyRoutineType,
} from "./enums/patient-daily-routine.enum";
import { PatientStatus } from "./enums/patient-status.enum";

@Injectable()
export class PatientDailyRoutinesService {
  constructor(
    @InjectRepository(PatientDailyRoutine)
    private readonly routines: Repository<PatientDailyRoutine>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
  ) {}

  async list(user: User): Promise<{ items: PatientDailyRoutineDto[] }> {
    const patient = await this.patient(user.id);
    const rows = await this.routines.find({
      where: { patientId: patient.id },
      order: { scheduledLocalTime: "ASC", createdAt: "ASC" },
    });
    return { items: rows.map((row) => this.map(row)) };
  }

  async create(
    user: User,
    dto: CreatePatientDailyRoutineDto,
  ): Promise<PatientDailyRoutineDto> {
    const patient = await this.patient(user.id);
    this.assertMedicationAcknowledgement(
      dto.type,
      dto.medicationSafetyAcknowledged,
    );
    const row = await this.routines.save(
      this.routines.create({
        patientId: patient.id,
        type: dto.type,
        label: dto.label.trim(),
        instructions: dto.instructions?.trim() || null,
        scheduledLocalTime: dto.scheduledLocalTime,
        timezone: dto.timezone,
        daysOfWeek: [...dto.daysOfWeek].sort(),
        enabled: true,
        source: PatientDailyRoutineSource.PATIENT,
        sourceReference: null,
        safetyAcknowledgedAt:
          dto.type === PatientDailyRoutineType.MEDICATION ? new Date() : null,
      }),
    );
    return this.map(row);
  }

  async update(
    user: User,
    reference: string,
    dto: UpdatePatientDailyRoutineDto,
  ): Promise<PatientDailyRoutineDto> {
    const patient = await this.patient(user.id);
    const row = await this.routines.findOne({
      where: { reference, patientId: patient.id },
    });
    if (!row) throw new NotFoundException("Daily routine was not found");
    const resultingType = dto.type ?? row.type;
    if (
      resultingType === PatientDailyRoutineType.MEDICATION &&
      row.type !== PatientDailyRoutineType.MEDICATION
    ) {
      this.assertMedicationAcknowledgement(
        resultingType,
        dto.medicationSafetyAcknowledged,
      );
      row.safetyAcknowledgedAt = new Date();
    }
    if (dto.type !== undefined) row.type = dto.type;
    if (dto.label !== undefined) row.label = dto.label.trim();
    if (dto.instructions !== undefined)
      row.instructions = dto.instructions?.trim() || null;
    if (dto.scheduledLocalTime !== undefined)
      row.scheduledLocalTime = dto.scheduledLocalTime;
    if (dto.timezone !== undefined) row.timezone = dto.timezone;
    if (dto.daysOfWeek !== undefined)
      row.daysOfWeek = [...dto.daysOfWeek].sort();
    if (dto.enabled !== undefined) row.enabled = dto.enabled;
    return this.map(await this.routines.save(row));
  }

  async remove(user: User, reference: string): Promise<void> {
    const patient = await this.patient(user.id);
    const result = await this.routines.delete({
      reference,
      patientId: patient.id,
      source: PatientDailyRoutineSource.PATIENT,
    });
    if (!result.affected)
      throw new NotFoundException("Daily routine was not found");
  }

  async today(
    patientId: string,
    now = new Date(),
  ): Promise<PatientDailyRoutineDto[]> {
    const rows = await this.routines.find({
      where: { patientId, enabled: true },
      order: { scheduledLocalTime: "ASC", createdAt: "ASC" },
    });
    return rows
      .filter((row) =>
        row.daysOfWeek.includes(this.localWeekday(now, row.timezone)),
      )
      .slice(0, 3)
      .map((row) => this.map(row));
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

  private localWeekday(date: Date, timezone: string): number {
    const short = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    }).format(date);
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(short);
  }

  private assertMedicationAcknowledgement(
    type: PatientDailyRoutineType,
    acknowledged?: boolean,
  ): void {
    if (type === PatientDailyRoutineType.MEDICATION && acknowledged !== true) {
      throw new BadRequestException(
        "Confirm that this reminder does not replace prescription instructions or medical advice",
      );
    }
  }

  private map(row: PatientDailyRoutine): PatientDailyRoutineDto {
    return {
      reference: row.reference,
      type: row.type,
      label: row.label,
      instructions: row.instructions,
      scheduledLocalTime: row.scheduledLocalTime.slice(0, 5),
      timezone: row.timezone,
      daysOfWeek: row.daysOfWeek,
      enabled: row.enabled,
      source: row.source,
    };
  }
}
