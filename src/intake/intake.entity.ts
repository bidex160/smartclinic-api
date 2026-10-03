import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import type { Urgency } from './intake.content';
import type { Answers, IntakeConsideration } from './intake.engine';

/**
 * A patient's answers to the before-the-visit questions, and what the rules made of them.
 * The patient only ever sees the urgency; the doctor sees the summary and considerations.
 */
@Entity('symptom_intakes')
@Index('IDX_symptom_intakes_user_created', ['userId', 'createdAt'])
@Index('UQ_symptom_intakes_care_request', ['careRequestId'], { unique: true, where: '"care_request_id" IS NOT NULL' })
export class SymptomIntake {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ name: 'patient_id', type: 'uuid', nullable: true }) patientId!: string | null;
  @Column({ name: 'care_request_id', type: 'uuid', nullable: true }) careRequestId!: string | null;
  @Column({ type: 'jsonb' }) answers!: Answers;
  @Column({ type: 'varchar', length: 10 }) urgency!: Urgency;
  @Column({ name: 'red_flags', type: 'jsonb', default: () => "'[]'" }) redFlags!: { id: string; label: string; urgency: string }[];
  @Column({ type: 'jsonb', default: () => "'[]'" }) considerations!: IntakeConsideration[];
  @Column({ type: 'text' }) summary!: string;
  /** Which version of the question set produced this, so old answers still make sense. */
  @Column({ name: 'content_version', type: 'smallint', default: 1 }) contentVersion!: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
