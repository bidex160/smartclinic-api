import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { DayOfWeek } from '../enums/day-of-week.enum';
import { ProviderLocation } from './provider-location.entity';
import { ProviderService } from './provider-service.entity';
import { Provider } from './provider.entity';

@Entity('provider_availability')
@Index('IDX_provider_availability_lookup', ['providerId', 'dayOfWeek', 'isActive', 'startTime', 'endTime'])
@Index('IDX_provider_availability_service', ['providerServiceId'], { where: '"provider_service_id" IS NOT NULL' })
@Index('IDX_provider_availability_location', ['providerLocationId'], { where: '"provider_location_id" IS NOT NULL' })
@Check('CHK_provider_availability_time_range', '"start_time" < "end_time"')
@Check('CHK_provider_availability_booking_stop_time', '"booking_stop_time" IS NULL OR ("start_time" < "booking_stop_time" AND "booking_stop_time" <= "end_time")')
export class ProviderAvailability {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'provider_id', type: 'uuid' }) providerId!: string;
  @ManyToOne(() => Provider, (provider) => provider.availability, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'provider_id' }) provider!: Provider;
  @Column({ name: 'provider_service_id', type: 'uuid', nullable: true }) providerServiceId!: string | null;
  @ManyToOne(() => ProviderService, (service) => service.availability, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'provider_service_id' }) providerService!: ProviderService | null;
  @Column({ name: 'provider_location_id', type: 'uuid', nullable: true }) providerLocationId!: string | null;
  @ManyToOne(() => ProviderLocation, (location) => location.availability, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'provider_location_id' }) providerLocation!: ProviderLocation | null;
  @Column({ name: 'day_of_week', type: 'enum', enum: DayOfWeek, enumName: 'day_of_week_enum' }) dayOfWeek!: DayOfWeek;
  @Column({ name: 'start_time', type: 'time' }) startTime!: string;
  @Column({ name: 'end_time', type: 'time' }) endTime!: string;
  @Column({ name: 'booking_stop_time', type: 'time', nullable: true }) bookingStopTime!: string | null;
  @Column({ type: 'varchar' }) timezone!: string;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
