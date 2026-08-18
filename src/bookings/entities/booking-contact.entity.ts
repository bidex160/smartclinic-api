import { Column, CreateDateColumn, Entity, Index, JoinColumn, OneToMany, OneToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';

import { Booking } from './booking.entity';
import { BookingFunding } from './booking-funding.entity';

@Entity('booking_contacts')
@Index('UQ_booking_contacts_booking_id', ['bookingId'], { unique: true })
@Unique('UQ_booking_contacts_id_booking', ['id', 'bookingId'])
export class BookingContact {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'booking_id', type: 'uuid' })
  bookingId!: string;

  @OneToOne(() => Booking, (booking) => booking.contact, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'booking_id' })
  booking!: Booking;

  @Column({ name: 'given_name', type: 'varchar' })
  givenName!: string;

  @Column({ name: 'family_name', type: 'varchar' })
  familyName!: string;

  @Column({ type: 'varchar', nullable: true })
  email!: string | null;

  @Column({ type: 'varchar' })
  phone!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => BookingFunding, (funding) => funding.payerContact)
  fundingResponsibilities!: BookingFunding[];
}
