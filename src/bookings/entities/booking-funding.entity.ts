import { Organisation } from '../../organisations/entities/organisation.entity';
import { PaymentAttempt } from '../../payments/entities/payment-attempt.entity';
import { User } from '../../users/entities/user.entity';
import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { BookingFundingSourceType } from '../enums/booking-funding-source-type.enum';
import { BookingFundingStatus } from '../enums/booking-funding-status.enum';
import { Booking } from './booking.entity';

@Entity('booking_funding')
@Index('IDX_booking_funding_booking_status', ['bookingId', 'status'])
@Check(
  'CHK_booking_funding_responsible_party',
  '"responsible_user_id" IS NULL OR "responsible_organisation_id" IS NULL',
)
@Check(
  'CHK_booking_funding_source_party_type',
  '("source_type" = \'ORGANISATION\' AND "responsible_organisation_id" IS NOT NULL AND "responsible_user_id" IS NULL) OR ("source_type" IN (\'SELF\', \'FAMILY\', \'SPONSOR\') AND "responsible_user_id" IS NOT NULL AND "responsible_organisation_id" IS NULL) OR "source_type" = \'OTHER\'',
)
@Check('CHK_booking_funding_amount_non_negative', '"amount" IS NULL OR "amount" >= 0')
@Check('CHK_booking_funding_currency_format', '"currency" ~ \'^[A-Z]{3}$\'')
@Check(
  'CHK_booking_funding_percentage_range',
  '"percentage" IS NULL OR ("percentage" > 0 AND "percentage" <= 100)',
)
export class BookingFunding {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'booking_id', type: 'uuid' })
  bookingId!: string;

  @ManyToOne(() => Booking, (booking) => booking.funding, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'booking_id' })
  booking!: Booking;

  @Column({ name: 'source_type', type: 'enum', enum: BookingFundingSourceType, enumName: 'booking_funding_source_type_enum' })
  sourceType!: BookingFundingSourceType;

  @Column({ name: 'responsible_user_id', type: 'uuid', nullable: true })
  responsibleUserId!: string | null;

  @ManyToOne(() => User, (user) => user.fundingResponsibilities, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'responsible_user_id' })
  responsibleUser!: User | null;

  @Column({ name: 'responsible_organisation_id', type: 'uuid', nullable: true })
  responsibleOrganisationId!: string | null;

  @ManyToOne(() => Organisation, (organisation) => organisation.fundingResponsibilities, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'responsible_organisation_id' })
  responsibleOrganisation!: Organisation | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  amount!: string | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  percentage!: string | null;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ type: 'enum', enum: BookingFundingStatus, enumName: 'booking_funding_status_enum', default: BookingFundingStatus.PENDING })
  status!: BookingFundingStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => PaymentAttempt, (attempt) => attempt.bookingFunding)
  paymentAttempts!: PaymentAttempt[];
}
