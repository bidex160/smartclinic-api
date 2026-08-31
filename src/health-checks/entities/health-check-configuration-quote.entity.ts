import { BeforeInsert, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { User } from '../../users/entities/user.entity';
import { Patient } from '../../patients/entities/patient.entity';
import { ProviderService } from '../../providers/entities/provider-service.entity';
import { ProviderLocation } from '../../providers/entities/provider-location.entity';
import { Booking } from '../../bookings/entities/booking.entity';

@Entity('health_check_configuration_quotes')
@Index('UQ_health_check_configuration_quote_reference', ['reference'], { unique: true })
@Index('IDX_health_check_configuration_quote_owner_expiry', ['patientId', 'expiresAt'])
export class HealthCheckConfigurationQuote {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 32 }) reference!: string;
  @BeforeInsert() generateReference() { if (!this.reference) this.reference = `SC-HCQ-${randomBytes(8).toString('hex').toUpperCase()}`; }
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @Column({ name: 'patient_id', type: 'uuid' }) patientId!: string;
  @ManyToOne(() => Patient, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'patient_id' }) patient!: Patient;
  @Column({ name: 'provider_service_id', type: 'uuid' }) providerServiceId!: string;
  @ManyToOne(() => ProviderService, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'provider_service_id' }) providerService!: ProviderService;
  @Column({ name: 'provider_location_id', type: 'uuid', nullable: true }) providerLocationId!: string | null;
  @ManyToOne(() => ProviderLocation, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'provider_location_id' }) providerLocation!: ProviderLocation | null;
  @Column({ type: 'char', length: 3 }) currency!: string;
  @Column({ name: 'base_package_price_minor', type: 'bigint' }) basePackagePriceMinor!: string;
  @Column({ name: 'clinical_addons_total_minor', type: 'bigint' }) clinicalAddonsTotalMinor!: string;
  @Column({ name: 'fulfilment_fee_minor', type: 'bigint' }) fulfilmentFeeMinor!: string;
  @Column({ name: 'total_minor', type: 'bigint' }) totalMinor!: string;
  @Column({ name: 'configuration_snapshot', type: 'jsonb' }) configurationSnapshot!: Record<string, unknown>;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true }) consumedAt!: Date | null;
  @Column({ name: 'booking_id', type: 'uuid', nullable: true, unique: true }) bookingId!: string | null;
  @OneToOne(() => Booking, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'booking_id' }) booking!: Booking | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
