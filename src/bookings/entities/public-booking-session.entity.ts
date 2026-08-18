import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Booking } from './booking.entity';
@Entity('public_booking_sessions')
@Index('UQ_public_booking_sessions_token_hash', ['tokenHash'], { unique: true })
@Index('IDX_public_booking_sessions_booking_active', ['bookingId', 'expiresAt', 'revokedAt'])
export class PublicBookingSession {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'booking_id', type: 'uuid' }) bookingId!: string;
  @ManyToOne(() => Booking, (booking) => booking.publicSessions, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'booking_id' }) booking!: Booking;
  @Column({ name: 'token_hash', type: 'char', length: 64 }) tokenHash!: string;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true }) revokedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true }) lastUsedAt!: Date | null;
}
