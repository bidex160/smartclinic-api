import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ProviderAvailabilityExceptionType } from '../enums/provider-availability-exception-type.enum';
import { ProviderLocation } from './provider-location.entity';
import { ProviderService } from './provider-service.entity';
import { Provider } from './provider.entity';

@Entity('provider_availability_exceptions')
@Index('IDX_provider_availability_exceptions_lookup', ['providerId', 'date', 'timezone', 'isActive'])
@Index('IDX_provider_availability_exceptions_service', ['providerServiceId'], { where: '"provider_service_id" IS NOT NULL' })
@Index('IDX_provider_availability_exceptions_location', ['providerLocationId'], { where: '"provider_location_id" IS NOT NULL' })
@Check('CHK_provider_availability_exceptions_times_paired', '("start_time" IS NULL) = ("end_time" IS NULL)')
@Check('CHK_provider_availability_exceptions_time_range', '"start_time" IS NULL OR "start_time" < "end_time"')
export class ProviderAvailabilityException {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'provider_id', type: 'uuid' }) providerId!: string;
  @ManyToOne(() => Provider, (provider) => provider.availabilityExceptions, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'provider_id' }) provider!: Provider;
  @Column({ name: 'provider_service_id', type: 'uuid', nullable: true }) providerServiceId!: string | null;
  @ManyToOne(() => ProviderService, (service) => service.availabilityExceptions, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'provider_service_id' }) providerService!: ProviderService | null;
  @Column({ name: 'provider_location_id', type: 'uuid', nullable: true }) providerLocationId!: string | null;
  @ManyToOne(() => ProviderLocation, (location) => location.availabilityExceptions, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'provider_location_id' }) providerLocation!: ProviderLocation | null;
  @Column({ type: 'date' }) date!: string;
  @Column({ name: 'start_time', type: 'time', nullable: true }) startTime!: string | null;
  @Column({ name: 'end_time', type: 'time', nullable: true }) endTime!: string | null;
  @Column({ type: 'varchar' }) timezone!: string;
  @Column({ type: 'enum', enum: ProviderAvailabilityExceptionType, enumName: 'provider_availability_exception_type_enum' }) type!: ProviderAvailabilityExceptionType;
  @Column({ type: 'varchar', nullable: true }) reason!: string | null;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
