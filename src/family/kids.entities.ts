import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { Patient } from '../patients/entities/patient.entity';
import { User } from '../users/entities/user.entity';

/** A daily task a parent set for a child (e.g. brush teeth). */
@Entity('child_daily_tasks')
@Index('UQ_child_daily_task_child_key', ['childPatientId', 'taskKey'], { unique: true })
export class ChildDailyTask {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'child_patient_id', type: 'uuid' }) childPatientId!: string;
  @ManyToOne(() => Patient, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'child_patient_id' }) child!: Patient;
  @Column({ name: 'created_by_user_id', type: 'uuid' }) createdByUserId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'created_by_user_id' }) createdBy!: User;
  @Column({ name: 'task_key', type: 'varchar', length: 40 }) taskKey!: string;
  @Column({ type: 'boolean', default: true }) enabled!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

/** One tick of a task on one day: one star. */
@Entity('child_task_completions')
@Index('UQ_child_task_completion_day', ['taskId', 'localDate'], { unique: true })
@Index('IDX_child_task_completion_child_date', ['childPatientId', 'localDate'])
export class ChildTaskCompletion {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'task_id', type: 'uuid' }) taskId!: string;
  @ManyToOne(() => ChildDailyTask, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'task_id' }) task!: ChildDailyTask;
  @Column({ name: 'child_patient_id', type: 'uuid' }) childPatientId!: string;
  @Column({ name: 'local_date', type: 'date' }) localDate!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

/** The kids question, once a day per child. */
@Entity('child_quiz_answers')
@Index('UQ_child_quiz_answer_day', ['childPatientId', 'localDate'], { unique: true })
export class ChildQuizAnswer {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'child_patient_id', type: 'uuid' }) childPatientId!: string;
  @Column({ name: 'local_date', type: 'date' }) localDate!: string;
  @Column({ name: 'question_id', type: 'varchar', length: 20 }) questionId!: string;
  @Column({ name: 'choice_index', type: 'smallint' }) choiceIndex!: number;
  @Column({ type: 'boolean' }) correct!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

/** How and when someone wants their once-a-day nudge. */
@Entity('nudge_settings')
export class NudgeSettings {
  @Column({ name: 'user_id', type: 'uuid', primary: true }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @Column({ type: 'boolean', default: true }) enabled!: boolean;
  /** Local time, "HH:MM". */
  @Column({ name: 'local_time', type: 'varchar', length: 5, default: '08:00' }) localTime!: string;
  @Column({ type: 'varchar', length: 64, default: 'Africa/Lagos' }) timezone!: string;
  @Column({ type: 'varchar', length: 8, default: 'en' }) language!: string;
  @Column({ type: 'boolean', default: false }) whatsapp!: boolean;
  /** Last day we looked at this person (sent or not), so each day is handled once. */
  @Column({ name: 'last_sent_date', type: 'date', nullable: true }) lastSentDate!: string | null;
  /** Last day a nudge was actually sent. */
  @Column({ name: 'last_nudged_date', type: 'date', nullable: true }) lastNudgedDate!: string | null;
  /** Nudges in a row that weren't followed by any activity; used to back off. */
  @Column({ name: 'ignored_in_a_row', type: 'integer', default: 0 }) ignoredInARow!: number;
  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' }) updatedAt!: Date;
}
