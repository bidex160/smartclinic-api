import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** One answer per patient per local day to the daily health quiz. */
@Entity({ name: 'health_quiz_answers' })
@Index('UQ_health_quiz_answers_patient_date', ['patientId', 'localDate'], { unique: true })
export class HealthQuizAnswer {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'patient_id', type: 'uuid' }) patientId!: string;
  @Column({ name: 'local_date', type: 'date' }) localDate!: string;
  @Column({ name: 'question_id', type: 'varchar', length: 60 }) questionId!: string;
  @Column({ name: 'choice_index', type: 'smallint' }) choiceIndex!: number;
  @Column({ type: 'boolean' }) correct!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
