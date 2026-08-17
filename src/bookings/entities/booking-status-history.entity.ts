import { User } from '../../users/entities/user.entity';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { BookingStatus } from '../enums/booking-status.enum';
import { Booking } from './booking.entity';

@Entity('booking_status_history')
@Index('IDX_booking_status_history_booking_created_at', ['bookingId', 'createdAt'])
export class BookingStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'booking_id', type: 'uuid' })
  bookingId!: string;

  @ManyToOne(() => Booking, (booking) => booking.statusHistory, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'booking_id' })
  booking!: Booking;

  @Column({ name: 'from_status', type: 'enum', enum: BookingStatus, enumName: 'booking_status_enum', nullable: true })
  fromStatus!: BookingStatus | null;

  @Column({ name: 'to_status', type: 'enum', enum: BookingStatus, enumName: 'booking_status_enum' })
  toStatus!: BookingStatus;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId!: string | null;

  @ManyToOne(() => User, (user) => user.bookingStatusChanges, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'actor_user_id' })
  actor!: User | null;

  @Column({ name: 'reason_code', type: 'varchar', nullable: true })
  reasonCode!: string | null;

  @Column({ name: 'reason_note', type: 'text', nullable: true })
  reasonNote!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
