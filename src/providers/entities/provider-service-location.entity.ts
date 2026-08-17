import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn, Unique } from 'typeorm';
import { ProviderLocation } from './provider-location.entity';
import { ProviderService } from './provider-service.entity';

@Entity('provider_service_locations')
@Unique('UQ_provider_service_locations_service_location', ['providerServiceId', 'providerLocationId'])
export class ProviderServiceLocation {
  @PrimaryColumn({ name: 'provider_service_id', type: 'uuid' }) providerServiceId!: string;
  @PrimaryColumn({ name: 'provider_location_id', type: 'uuid' }) providerLocationId!: string;
  @Column({ name: 'provider_id', type: 'uuid' }) providerId!: string;
  @ManyToOne(() => ProviderService, (service) => service.locationLinks, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'provider_service_id', referencedColumnName: 'id' }, { name: 'provider_id', referencedColumnName: 'providerId' }]) providerService!: ProviderService;
  @ManyToOne(() => ProviderLocation, (location) => location.serviceLinks, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'provider_location_id', referencedColumnName: 'id' }, { name: 'provider_id', referencedColumnName: 'providerId' }]) providerLocation!: ProviderLocation;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
