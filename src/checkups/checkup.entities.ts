import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import type { Band, GlucoseContext, NextStep } from './readings';

export type ReadingSource = 'HOME' | 'PHARMACY' | 'HOME_VISIT';

/**
 * One set of numbers taken at one time: blood pressure (averaged from up to three readings),
 * pulse, sugar, weight and height. Taken at home, or by a partner pharmacy with a free-check
 * voucher. Belongs to a patient, or (a gift to a parent without an account) only to the voucher.
 */
@Entity('vital_readings')
@Index('IDX_vital_readings_patient_measured', ['patientId', 'measuredAt'])
export class VitalReading {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'patient_id', type: 'uuid', nullable: true }) patientId!: string | null;
  @Column({ name: 'voucher_id', type: 'uuid', nullable: true }) voucherId!: string | null;
  @Column({ type: 'varchar', length: 12 }) source!: ReadingSource;
  @Column({ name: 'provider_id', type: 'uuid', nullable: true }) providerId!: string | null;
  @Column({ name: 'entered_by_user_id', type: 'uuid', nullable: true }) enteredByUserId!: string | null;
  @Column({ type: 'smallint', nullable: true }) systolic!: number | null;
  @Column({ type: 'smallint', nullable: true }) diastolic!: number | null;
  /** The individual readings that were averaged, e.g. [[132,84],[128,82]]. */
  @Column({ name: 'bp_readings', type: 'jsonb', nullable: true }) bpReadings!: [number, number][] | null;
  @Column({ type: 'smallint', nullable: true }) pulse!: number | null;
  @Column({ name: 'glucose_mmol', type: 'numeric', precision: 4, scale: 1, nullable: true }) glucoseMmol!: string | null;
  @Column({ name: 'glucose_context', type: 'varchar', length: 12, nullable: true }) glucoseContext!: GlucoseContext | null;
  @Column({ name: 'weight_kg', type: 'numeric', precision: 5, scale: 1, nullable: true }) weightKg!: string | null;
  @Column({ name: 'height_cm', type: 'numeric', precision: 4, scale: 1, nullable: true }) heightCm!: string | null;
  @Column({ type: 'varchar', length: 12 }) band!: Band;
  @Column({ name: 'measured_at', type: 'timestamptz' }) measuredAt!: Date;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

/** Where each patient is in their check-up plan, and when the next step is due. */
@Entity('checkup_plans')
@Index('IDX_checkup_plans_due', ['nextDueAt'])
export class CheckupPlan {
  @PrimaryColumn({ name: 'patient_id', type: 'uuid' }) patientId!: string;
  @Column({ type: 'varchar', length: 12, default: 'UNKNOWN' }) band!: Band;
  @Column({ name: 'next_step', type: 'varchar', length: 14, default: 'KNOW_NUMBERS' }) nextStep!: NextStep;
  @Column({ name: 'next_due_at', type: 'timestamptz', nullable: true }) nextDueAt!: Date | null;
  @Column({ name: 'numbers_done_at', type: 'timestamptz', nullable: true }) numbersDoneAt!: Date | null;
  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true }) confirmedAt!: Date | null;
  @Column({ name: 'last_reading_id', type: 'uuid', nullable: true }) lastReadingId!: string | null;
  /** The due date we last reminded about, so each due date is reminded once (plus one follow-up). */
  @Column({ name: 'reminded_for', type: 'timestamptz', nullable: true }) remindedFor!: Date | null;
  @Column({ name: 'reminder_count', type: 'smallint', default: 0 }) reminderCount!: number;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

export type VoucherStatus = 'ISSUED' | 'REDEEMED' | 'EXPIRED' | 'CANCELLED';

/**
 * A free "Know your numbers" check, shown as a code at a partner pharmacy. For yourself, or a
 * gift to a parent (by phone, or to a family member you manage in the app).
 */
@Entity('checkup_vouchers')
@Index('UQ_checkup_vouchers_code', ['code'], { unique: true })
@Index('IDX_checkup_vouchers_gifter', ['giftedByUserId', 'createdAt'])
@Index('IDX_checkup_vouchers_phone', ['recipientPhone'])
export class CheckupVoucher {
  @PrimaryGeneratedColumn('uuid') id!: string;
  /** Short and easy to read out, e.g. "KN7F4Q9P". */
  @Column({ type: 'varchar', length: 12 }) code!: string;
  @Column({ type: 'varchar', length: 10 }) status!: VoucherStatus;
  @Column({ name: 'recipient_patient_id', type: 'uuid', nullable: true }) recipientPatientId!: string | null;
  @Column({ name: 'recipient_name', type: 'varchar', length: 120 }) recipientName!: string;
  @Column({ name: 'recipient_phone', type: 'varchar', length: 20, nullable: true }) recipientPhone!: string | null;
  /** MOTHER, FATHER, GRANDPARENT, OTHER (gifts only). */
  @Column({ type: 'varchar', length: 16, nullable: true }) relationship!: string | null;
  @Column({ name: 'gifted_by_user_id', type: 'uuid', nullable: true }) giftedByUserId!: string | null;
  @Column({ name: 'country_code', type: 'char', length: 2 }) countryCode!: string;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @Column({ name: 'redeemed_at', type: 'timestamptz', nullable: true }) redeemedAt!: Date | null;
  @Column({ name: 'redeemed_by_provider_id', type: 'uuid', nullable: true }) redeemedByProviderId!: string | null;
  /** What the pharmacy is paid for this check (minor units), fixed when redeemed. */
  @Column({ name: 'provider_fee_minor', type: 'integer', default: 0 }) providerFeeMinor!: number;
  /** The person checked agreed (at the pharmacy) to share the result with whoever gave the gift. */
  @Column({ name: 'share_with_gifter', type: 'boolean', default: false }) shareWithGifter!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/** A pharmacy or clinic that does free checks for SmartClinic vouchers. */
@Entity('free_check_partners')
export class FreeCheckPartner {
  @PrimaryColumn({ name: 'provider_id', type: 'uuid' }) providerId!: string;
  @Column({ type: 'boolean', default: true }) active!: boolean;
  /** Most free checks they'll do in a week (0 = no limit). */
  @Column({ name: 'weekly_capacity', type: 'integer', default: 0 }) weeklyCapacity!: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
