import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum SupportCallbackTopic {
  BOOK_CHECKUP = 'BOOK_CHECKUP',
  SEE_DOCTOR = 'SEE_DOCTOR',
  TEST_OR_RESULTS = 'TEST_OR_RESULTS',
  MEDICINE = 'MEDICINE',
  PAYMENT = 'PAYMENT',
  ACCOUNT = 'ACCOUNT',
  OTHER = 'OTHER',
}
export enum SupportCallbackTime { ANYTIME = 'ANYTIME', MORNING = 'MORNING', AFTERNOON = 'AFTERNOON', EVENING = 'EVENING' }
export enum SupportCallbackStatus { OPEN = 'OPEN', CALLED = 'CALLED', CLOSED = 'CLOSED' }

/** A person who asked SmartClinic to phone them, often someone who would rather talk than tap. */
@Entity({ name: 'support_callback_requests' })
export class SupportCallbackRequest {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 24, unique: true }) reference!: string;
  @Column({ type: 'varchar', length: 80 }) name!: string;
  @Column({ type: 'varchar', length: 24 }) phone!: string;
  @Column({ name: 'country_code', type: 'varchar', length: 2, nullable: true }) countryCode!: string | null;
  @Column({ type: 'varchar', length: 30 }) topic!: SupportCallbackTopic;
  @Column({ name: 'preferred_time', type: 'varchar', length: 20 }) preferredTime!: SupportCallbackTime;
  @Column({ type: 'varchar', length: 300, nullable: true }) message!: string | null;
  @Column({ type: 'varchar', length: 20 }) status!: SupportCallbackStatus;
  @Column({ name: 'user_id', type: 'uuid', nullable: true }) userId!: string | null;
  @Column({ name: 'handled_by_user_id', type: 'uuid', nullable: true }) handledByUserId!: string | null;
  @Column({ name: 'handled_at', type: 'timestamptz', nullable: true }) handledAt!: Date | null;
  @Column({ name: 'staff_note', type: 'varchar', length: 500, nullable: true }) staffNote!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
