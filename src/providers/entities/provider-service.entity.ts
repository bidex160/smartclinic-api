import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { FulfilmentMode } from '../../health-checks/entities/fulfilment-mode.entity';
import { HealthCheckPackage } from '../../health-checks/entities/health-check-package.entity';
import { Provider } from './provider.entity';
import { ProviderServiceLocation } from './provider-service-location.entity';
import { ProviderAvailability } from './provider-availability.entity';
import { ProviderAvailabilityException } from './provider-availability-exception.entity';
import { ProviderServiceAddon } from './provider-service-addon.entity';

@Entity('provider_services')
@Unique('UQ_provider_services_provider_package_mode', ['providerId', 'healthCheckPackageId', 'fulfilmentModeId'])
@Unique('UQ_provider_services_id_provider', ['id', 'providerId'])
@Index('IDX_provider_services_matching', ['healthCheckPackageId', 'fulfilmentModeId', 'isActive', 'providerId'])
@Index('IDX_provider_services_provider_active', ['providerId', 'isActive'])
@Check('CHK_provider_services_price_minor', '"price_minor" >= 0')
@Check('CHK_provider_services_currency', '"currency" ~ \'^[A-Z]{3}$\'')
export class ProviderService {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'provider_id', type: 'uuid' }) providerId!: string;
  @ManyToOne(() => Provider, (provider) => provider.services, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'provider_id' }) provider!: Provider;
  @Column({ name: 'health_check_package_id', type: 'uuid' }) healthCheckPackageId!: string;
  @ManyToOne(() => HealthCheckPackage, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'health_check_package_id' }) healthCheckPackage!: HealthCheckPackage;
  @Column({ name: 'fulfilment_mode_id', type: 'uuid' }) fulfilmentModeId!: string;
  @ManyToOne(() => FulfilmentMode, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'fulfilment_mode_id' }) fulfilmentMode!: FulfilmentMode;
  @Column({ name: 'price_minor', type: 'bigint' }) priceMinor!: string;
  @Column({ name: 'fulfilment_fee_minor', type: 'bigint', default: '0' }) fulfilmentFeeMinor!: string;
  @Column({ type: 'char', length: 3 }) currency!: string;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
  @OneToMany(() => ProviderServiceLocation, (link) => link.providerService) locationLinks!: ProviderServiceLocation[];
  @OneToMany(() => ProviderAvailability, (availability) => availability.providerService) availability!: ProviderAvailability[];
  @OneToMany(() => ProviderAvailabilityException, (exception) => exception.providerService) availabilityExceptions!: ProviderAvailabilityException[];
  @OneToMany(() => ProviderServiceAddon, (value) => value.providerService) addons!: ProviderServiceAddon[];
}
