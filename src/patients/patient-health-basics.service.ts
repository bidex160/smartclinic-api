import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { User } from "../users/entities/user.entity";
import { PatientHealthBasicsDto, UpdatePatientHealthBasicsDto } from "./dto/patient-health-basics.dto";
import { PatientHealthBasics } from "./entities/patient-health-basics.entity";
import { Patient } from "./entities/patient.entity";
import { PatientStatus } from "./enums/patient-status.enum";

const FIELDS = [
  "bloodGroup",
  "genotype",
  "allergies",
  "conditions",
  "emergencyContactName",
  "emergencyContactPhone",
  "emergencyContactRelationship",
] as const;

@Injectable()
export class PatientHealthBasicsService {
  constructor(
    @InjectRepository(PatientHealthBasics)
    private readonly basics: Repository<PatientHealthBasics>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
  ) {}

  async get(user: User): Promise<PatientHealthBasicsDto> {
    const patient = await this.patient(user.id);
    return this.map(await this.basics.findOne({ where: { patientId: patient.id } }));
  }

  /** Partial update: omitted fields are kept, null or blank clears a field. */
  async update(user: User, dto: UpdatePatientHealthBasicsDto): Promise<PatientHealthBasicsDto> {
    const patient = await this.patient(user.id);
    const row =
      (await this.basics.findOne({ where: { patientId: patient.id } })) ??
      this.basics.create({
        patientId: patient.id,
        bloodGroup: null,
        genotype: null,
        allergies: null,
        conditions: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        emergencyContactRelationship: null,
      });
    for (const field of FIELDS) {
      if (dto[field] !== undefined) (row as unknown as Record<string, unknown>)[field] = dto[field] ?? null;
    }
    return this.map(await this.basics.save(row));
  }

  private map(row: PatientHealthBasics | null): PatientHealthBasicsDto {
    return {
      bloodGroup: row?.bloodGroup ?? null,
      genotype: row?.genotype ?? null,
      allergies: row?.allergies ?? null,
      conditions: row?.conditions ?? null,
      emergencyContactName: row?.emergencyContactName ?? null,
      emergencyContactPhone: row?.emergencyContactPhone ?? null,
      emergencyContactRelationship: row?.emergencyContactRelationship ?? null,
      source: "SELF_REPORTED",
      updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    };
  }

  private async patient(userId: string): Promise<Patient> {
    const row = await this.patients.findOne({ where: { userId, status: PatientStatus.ACTIVE } });
    if (!row || row.deletedAt)
      throw new NotFoundException("Patient profile was not found for the authenticated user");
    return row;
  }
}
