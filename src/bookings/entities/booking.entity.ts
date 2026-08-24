import { HealthCheckPackage } from '../../health-checks/entities/health-check-package.entity';
import { FulfilmentMode } from '../../health-checks/entities/fulfilment-mode.entity';
import { Organisation } from '../../organisations/entities/organisation.entity';
import { Patient } from '../../patients/entities/patient.entity';
import { ProviderAssignment } from '../../providers/entities/provider-assignment.entity';
import { ProviderBookingReservation } from '../../providers/entities/provider-booking-reservation.entity';
import { ProviderLocation } from '../../providers/entities/provider-location.entity';
import { User } from '../../users/entities/user.entity';
import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { BookingStatus } from '../enums/booking-status.enum';
import { BookingFunding } from './booking-funding.entity';
import { BookingContact } from './booking-contact.entity';
import { BookingStatusHistory } from './booking-status-history.entity';
import { PublicBookingSession } from './public-booking-session.entity';
import { BookingVisitAddress } from './booking-visit-address.entity';

@Entity('bookings')
@Index('UQ_bookings_booking_reference', ['bookingReference'], { unique: true })
@Index('IDX_bookings_participant_created_at', ['participantPatientId', 'createdAt'])
@Index('IDX_bookings_booker_created_at', ['bookerUserId', 'createdAt'])
@Index('IDX_bookings_status_preferred_date', ['status', 'preferredDate'])
@Index('IDX_bookings_status_created_reference', ['status', 'createdAt', 'bookingReference'])
@Check(
  'CHK_bookings_quoted_amount_non_negative',
  '"quoted_amount" IS NULL OR "quoted_amount" >= 0',
)
@Check('CHK_bookings_currency_format', '"currency" IS NULL OR "currency" ~ \'^[A-Z]{3}$\'')
@Check(
  'CHK_bookings_preferred_time_window',
  '"preferred_time_window_start" IS NULL OR "preferred_time_window_end" IS NULL OR "preferred_time_window_end" > "preferred_time_window_start"',
)
export class Booking {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'booking_reference', type: 'varchar' })
  bookingReference!: string;

  @Column({ name: 'booker_user_id', type: 'uuid', nullable: true })
  bookerUserId!: string | null;

  @ManyToOne(() => User, (user) => user.bookingsAsBooker, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'booker_user_id' })
  booker!: User | null;

  @Column({ name: 'participant_patient_id', type: 'uuid' })
  participantPatientId!: string;

  @ManyToOne(() => Patient, (patient) => patient.bookings, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'participant_patient_id' })
  participant!: Patient;

  @Column({ name: 'organisation_context_id', type: 'uuid', nullable: true })
  organisationContextId!: string | null;

  @ManyToOne(() => Organisation, (organisation) => organisation.bookingsInContext, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'organisation_context_id' })
  organisationContext!: Organisation | null;

  @Column({ name: 'health_check_package_id', type: 'uuid' })
  healthCheckPackageId!: string;

  @ManyToOne(() => HealthCheckPackage, (healthCheckPackage) => healthCheckPackage.bookings, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'health_check_package_id' })
  healthCheckPackage!: HealthCheckPackage;

  @Column({ name: 'fulfilment_mode_id', type: 'uuid' })
  fulfilmentModeId!: string;

  @ManyToOne(() => FulfilmentMode, (fulfilmentMode) => fulfilmentMode.bookings, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'fulfilment_mode_id' })
  fulfilmentMode!: FulfilmentMode;

  @Column({ type: 'enum', enum: BookingStatus, enumName: 'booking_status_enum', default: BookingStatus.DRAFT })
  status!: BookingStatus;

  @Column({ name: 'quoted_amount', type: 'numeric', precision: 12, scale: 2, nullable: true })
  quotedAmount!: string | null;

  @Column({ name: 'currency', type: 'char', length: 3, nullable: true })
  currency!: string | null;

  @Column({ name: 'preferred_date', type: 'date', nullable: true })
  preferredDate!: string | null;

  @Column({ name: 'preferred_time_window_start', type: 'time', nullable: true })
  preferredTimeWindowStart!: string | null;

  @Column({ name: 'preferred_time_window_end', type: 'time', nullable: true })
  preferredTimeWindowEnd!: string | null;

  @Column({ name: 'preferred_timezone', type: 'varchar', nullable: true })
  preferredTimezone!: string | null;

  @Column({ name: 'preferred_location_note', type: 'text', nullable: true })
  preferredLocationNote!: string | null;

  @OneToOne(() => BookingVisitAddress, (address) => address.booking) visitAddress!: BookingVisitAddress | null;

  @Column({ name: 'scheduled_starts_at', type: 'timestamptz', nullable: true })
  scheduledStartsAt!: Date | null;

  @Column({ name: 'scheduled_ends_at', type: 'timestamptz', nullable: true })
  scheduledEndsAt!: Date | null;

  @Column({ name: 'scheduled_date', type: 'date', nullable: true })
  scheduledDate!: string | null;

  @Column({ name: 'scheduled_time_from', type: 'time', nullable: true })
  scheduledTimeFrom!: string | null;

  @Column({ name: 'scheduled_time_to', type: 'time', nullable: true })
  scheduledTimeTo!: string | null;

  @Column({ name: 'scheduled_timezone', type: 'varchar', nullable: true })
  scheduledTimezone!: string | null;

  @Column({ name: 'provider_location_id', type: 'uuid', nullable: true })
  providerLocationId!: string | null;

  @ManyToOne(() => ProviderLocation, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'provider_location_id' })
  providerLocation!: ProviderLocation | null;

  @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true })
  scheduledAt!: Date | null;

  @Column({ name: 'scheduled_by_user_id', type: 'uuid', nullable: true })
  scheduledByUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'scheduled_by_user_id' })
  scheduledBy!: User | null;

  @Column({ name: 'cancellation_reason', type: 'text', nullable: true })
  cancellationReason!: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => BookingStatusHistory, (history) => history.booking)
  statusHistory!: BookingStatusHistory[];

  @OneToMany(() => BookingFunding, (funding) => funding.booking)
  funding!: BookingFunding[];

  @OneToMany(() => ProviderAssignment, (assignment) => assignment.booking)
  providerAssignments!: ProviderAssignment[];

  @OneToMany(() => ProviderBookingReservation, (reservation) => reservation.booking)
  providerReservations!: ProviderBookingReservation[];

  @OneToOne(() => BookingContact, (contact) => contact.booking)
  contact!: BookingContact | null;

  @OneToMany(() => PublicBookingSession, (session) => session.booking)
  publicSessions!: PublicBookingSession[];
}
