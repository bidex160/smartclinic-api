import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum CohortContactSubmissionStatus {
  NEW = 'NEW',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
}

@Entity('cohort_contact_submissions')
export class CohortContactSubmission {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 120 })
  name!: string;

  @Column({ length: 254 })
  email!: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  organisation!: string | null;

  @Column({ length: 160 })
  subject!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({
    type: 'enum',
    enum: CohortContactSubmissionStatus,
    default: CohortContactSubmissionStatus.NEW,
  })
  status!: CohortContactSubmissionStatus;

  @Column({
    name: 'email_notification_sent',
    type: 'boolean',
    default: false,
  })
  emailNotificationSent!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}