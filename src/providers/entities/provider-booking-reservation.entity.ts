import { Booking } from '../../bookings/entities/booking.entity';
import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ProviderBookingReservationStatus } from '../enums/provider-booking-reservation-status.enum';
import { ProviderAssignment } from './provider-assignment.entity';
import { ProviderLocation } from './provider-location.entity';
import { Provider } from './provider.entity';

@Entity('provider_booking_reservations')
@Index('IDX_provider_booking_reservations_provider_schedule', ['providerId', 'scheduledDate', 'status', 'startTime', 'endTime'])
@Index('IDX_provider_booking_reservations_booking', ['bookingId'])
@Index('UQ_provider_booking_reservations_assignment', ['providerAssignmentId'], { unique: true })
@Check('CHK_provider_booking_reservations_time_range', '"start_time" < "end_time"')
export class ProviderBookingReservation {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'provider_id', type: 'uuid' }) providerId!: string;
  @ManyToOne(() => Provider, (provider) => provider.bookingReservations, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'provider_id' }) provider!: Provider;
  @Column({ name: 'booking_id', type: 'uuid' }) bookingId!: string;
  @ManyToOne(() => Booking, (booking) => booking.providerReservations, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'booking_id' }) booking!: Booking;
  @Column({ name: 'provider_assignment_id', type: 'uuid' }) providerAssignmentId!: string;
  @OneToOne(() => ProviderAssignment, (assignment) => assignment.reservation, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'provider_assignment_id' }) providerAssignment!: ProviderAssignment;
  @Column({ name: 'provider_location_id', type: 'uuid', nullable: true }) providerLocationId!: string | null;
  @ManyToOne(() => ProviderLocation, (location) => location.bookingReservations, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'provider_location_id' }) providerLocation!: ProviderLocation | null;
  @Column({ name: 'scheduled_date', type: 'date' }) scheduledDate!: string;
  @Column({ name: 'start_time', type: 'time' }) startTime!: string;
  @Column({ name: 'end_time', type: 'time' }) endTime!: string;
  @Column({ type: 'varchar' }) timezone!: string;
  @Column({ type: 'enum', enum: ProviderBookingReservationStatus, enumName: 'provider_booking_reservation_status_enum' }) status!: ProviderBookingReservationStatus;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
  @Column({ name: 'released_at', type: 'timestamptz', nullable: true }) releasedAt!: Date | null;
}
