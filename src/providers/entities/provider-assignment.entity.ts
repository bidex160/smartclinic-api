import { Booking } from '../../bookings/entities/booking.entity';
import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, OneToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

import { ProviderAssignmentStatus } from '../enums/provider-assignment-status.enum';
import { ProviderAssignmentHistory } from './provider-assignment-history.entity';
import { Provider } from './provider.entity';
import { ProviderBookingReservation } from './provider-booking-reservation.entity';

@Entity('provider_assignments')
@Index('IDX_provider_assignments_booking_status', ['bookingId', 'status'])
@Index('IDX_provider_assignments_provider_id', ['providerId'])
@Unique('UQ_provider_assignments_id_provider_booking', ['id', 'providerId', 'bookingId'])
@Index('UQ_provider_assignments_confirmed_booking', ['bookingId'], {
  unique: true,
  where: '"status" = \'CONFIRMED\'',
})
@Check(
  'CHK_provider_assignments_time_order',
  '"responded_at" IS NULL OR "responded_at" >= "offered_at"',
)
export class ProviderAssignment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'booking_id', type: 'uuid' })
  bookingId!: string;

  @ManyToOne(() => Booking, (booking) => booking.providerAssignments, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'booking_id' })
  booking!: Booking;

  @Column({ name: 'provider_id', type: 'uuid' })
  providerId!: string;

  @ManyToOne(() => Provider, (provider) => provider.assignments, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'provider_id' })
  provider!: Provider;

  @Column({ type: 'enum', enum: ProviderAssignmentStatus, enumName: 'provider_assignment_status_enum' })
  status!: ProviderAssignmentStatus;

  @Column({ name: 'offered_at', type: 'timestamptz' })
  offeredAt!: Date;

  @Column({ name: 'responded_at', type: 'timestamptz', nullable: true })
  respondedAt!: Date | null;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt!: Date | null;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt!: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  @Column({ name: 'reason_code', type: 'varchar', nullable: true })
  reasonCode!: string | null;

  @Column({ name: 'reason_note', type: 'text', nullable: true })
  reasonNote!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => ProviderAssignmentHistory, (history) => history.providerAssignment)
  history!: ProviderAssignmentHistory[];

  @OneToOne(() => ProviderBookingReservation, (reservation) => reservation.providerAssignment)
  reservation!: ProviderBookingReservation | null;
}
