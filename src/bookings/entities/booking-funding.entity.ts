import { Organisation } from '../../organisations/entities/organisation.entity';
import { PaymentAttempt } from '../../payments/entities/payment-attempt.entity';
import { User } from '../../users/entities/user.entity';
import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { BookingFundingSourceType } from '../enums/booking-funding-source-type.enum';
import { BookingFundingStatus } from '../enums/booking-funding-status.enum';
import { CheckoutFundingOption } from '../enums/checkout-funding-option.enum';
import { Booking } from './booking.entity';
import { BookingContact } from './booking-contact.entity';

@Entity('booking_funding')
@Index('IDX_booking_funding_booking_status', ['bookingId', 'status'])
@Index('UQ_booking_funding_self_booking', ['bookingId'], { unique: true, where: '"source_type" = \'SELF\'' })
@Check(
  'CHK_booking_funding_responsible_party',
  '(CASE WHEN "responsible_user_id" IS NULL THEN 0 ELSE 1 END + CASE WHEN "responsible_organisation_id" IS NULL THEN 0 ELSE 1 END + CASE WHEN "payer_contact_id" IS NULL THEN 0 ELSE 1 END) <= 1',
)
@Check(
  'CHK_booking_funding_source_party_type',
  '("source_type" = \'ORGANISATION\' AND "responsible_organisation_id" IS NOT NULL) OR ("source_type" = \'SELF\' AND (("responsible_user_id" IS NOT NULL) <> ("payer_contact_id" IS NOT NULL))) OR ("source_type" IN (\'FAMILY\', \'SPONSOR\') AND "responsible_user_id" IS NOT NULL) OR "source_type" = \'OTHER\'',
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

  @Column({ name: 'payer_contact_id', type: 'uuid', nullable: true }) payerContactId!: string | null;
  @ManyToOne(() => BookingContact, (contact) => contact.fundingResponsibilities, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'payer_contact_id' }) payerContact!: BookingContact | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  amount!: string | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  percentage!: string | null;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ type: 'enum', enum: BookingFundingStatus, enumName: 'booking_funding_status_enum', default: BookingFundingStatus.PENDING })
  status!: BookingFundingStatus;

  @Column({ name: 'checkout_option', type: 'enum', enum: CheckoutFundingOption, enumName: 'checkout_funding_option_enum', nullable: true })
  checkoutOption!: CheckoutFundingOption | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => PaymentAttempt, (attempt) => attempt.bookingFunding)
  paymentAttempts!: PaymentAttempt[];
}
