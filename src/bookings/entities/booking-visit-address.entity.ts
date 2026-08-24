import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Booking } from './booking.entity';

@Entity('booking_visit_addresses')
export class BookingVisitAddress {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'booking_id', type: 'uuid', unique: true }) bookingId!: string;
  @OneToOne(() => Booking, (booking) => booking.visitAddress, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'booking_id' }) booking!: Booking;
  @Column({ name: 'address_line1', type: 'varchar', length: 255 }) addressLine1!: string;
  @Column({ name: 'address_line2', type: 'varchar', length: 255, nullable: true }) addressLine2!: string | null;
  @Column({ type: 'varchar', length: 120 }) city!: string;
  @Column({ name: 'state_or_region', type: 'varchar', length: 120 }) stateOrRegion!: string;
  @Column({ name: 'postal_code', type: 'varchar', length: 30, nullable: true }) postalCode!: string | null;
  @Column({ name: 'country_code', type: 'char', length: 2 }) countryCode!: string;
  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true }) latitude!: string | null;
  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true }) longitude!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
