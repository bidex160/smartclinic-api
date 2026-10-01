import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { PatientDailyRoutine } from "./patient-daily-routine.entity";

/**
 * A patient-reported "done" tick for one routine on one local calendar day.
 * Self-reported wellbeing data only: never treated as clinical adherence.
 */
@Entity("patient_daily_routine_completions")
@Index("UQ_patient_daily_routine_completions_routine_date", ["routineId", "localDate"], { unique: true })
@Index("IDX_patient_daily_routine_completions_patient_date", ["patientId", "localDate"])
export class PatientDailyRoutineCompletion {
  @PrimaryGeneratedColumn("uuid") id!: string;

  @Column({ name: "routine_id", type: "uuid" }) routineId!: string;
  @ManyToOne(() => PatientDailyRoutine, { onDelete: "CASCADE" })
  @JoinColumn({ name: "routine_id" })
  routine!: PatientDailyRoutine;

  @Column({ name: "patient_id", type: "uuid" }) patientId!: string;

  /** Calendar date (YYYY-MM-DD) in the routine's timezone. */
  @Column({ name: "local_date", type: "date" }) localDate!: string;

  @CreateDateColumn({ name: "completed_at", type: "timestamptz" })
  completedAt!: Date;
}
