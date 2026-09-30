import { randomUUID } from "node:crypto";
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import {
  PatientDailyRoutineSource,
  PatientDailyRoutineType,
} from "../enums/patient-daily-routine.enum";
import { Patient } from "./patient.entity";

@Entity("patient_daily_routines")
@Index("UQ_patient_daily_routines_reference", ["reference"], { unique: true })
@Index("IDX_patient_daily_routines_patient_enabled", ["patientId", "enabled"])
export class PatientDailyRoutine {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ type: "varchar", length: 24 }) reference!: string;
  @BeforeInsert() assignReference(): void {
    if (!this.reference)
      this.reference = `SC-RTE-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
  }

  @Column({ name: "patient_id", type: "uuid" }) patientId!: string;
  @ManyToOne(() => Patient, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "patient_id" })
  patient!: Patient;

  @Column({
    type: "enum",
    enum: PatientDailyRoutineType,
    enumName: "patient_daily_routine_type_enum",
  })
  type!: PatientDailyRoutineType;
  @Column({ type: "varchar", length: 120 }) label!: string;
  @Column({ type: "varchar", length: 300, nullable: true }) instructions!:
    string | null;
  @Column({ name: "scheduled_local_time", type: "time" })
  scheduledLocalTime!: string;
  @Column({ type: "varchar", length: 80 }) timezone!: string;
  @Column({ name: "days_of_week", type: "smallint", array: true })
  daysOfWeek!: number[];
  @Column({ type: "boolean", default: true }) enabled!: boolean;
  @Column({
    type: "enum",
    enum: PatientDailyRoutineSource,
    enumName: "patient_daily_routine_source_enum",
    default: PatientDailyRoutineSource.PATIENT,
  })
  source!: PatientDailyRoutineSource;
  @Column({
    name: "source_reference",
    type: "varchar",
    length: 40,
    nullable: true,
  })
  sourceReference!: string | null;
  @Column({
    name: "safety_acknowledged_at",
    type: "timestamptz",
    nullable: true,
  })
  safetyAcknowledgedAt!: Date | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
