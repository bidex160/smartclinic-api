import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { Patient } from "./patient.entity";

/**
 * A patient's self-reported daily wellbeing check-in (mood, energy, sleep on a
 * 1–5 scale). Wellbeing data only: never a clinical assessment.
 */
@Entity("patient_daily_check_ins")
@Index("UQ_patient_daily_check_ins_patient_date", ["patientId", "localDate"], { unique: true })
export class PatientDailyCheckIn {
  @PrimaryGeneratedColumn("uuid") id!: string;

  @Column({ name: "patient_id", type: "uuid" }) patientId!: string;
  @ManyToOne(() => Patient, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "patient_id" })
  patient!: Patient;

  /** Calendar date (YYYY-MM-DD) in the patient's timezone. */
  @Column({ name: "local_date", type: "date" }) localDate!: string;
  @Column({ type: "smallint" }) mood!: number;
  @Column({ type: "smallint", nullable: true }) energy!: number | null;
  @Column({ type: "smallint", nullable: true }) sleep!: number | null;
  @Column({ type: "varchar", length: 80 }) timezone!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" }) updatedAt!: Date;
}
