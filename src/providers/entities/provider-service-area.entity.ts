import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ProviderService } from './provider-service.entity';
import { Provider } from './provider.entity';

@Entity('provider_service_areas')
@Index('IDX_provider_service_areas_matching', ['providerServiceId', 'isActive', 'countryCode', 'stateOrRegion', 'city', 'postalCode'])
@Index('IDX_provider_service_areas_provider', ['providerId'])
export class ProviderServiceArea {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'provider_id', type: 'uuid' }) providerId!: string;
  @ManyToOne(() => Provider, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'provider_id' }) provider!: Provider;
  @Column({ name: 'provider_service_id', type: 'uuid' }) providerServiceId!: string;
  @ManyToOne(() => ProviderService, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'provider_service_id' }) providerService!: ProviderService;
  @Column({ name: 'country_code', type: 'char', length: 2 }) countryCode!: string;
  @Column({ name: 'state_or_region', type: 'varchar', length: 120 }) stateOrRegion!: string;
  @Column({ type: 'varchar', length: 120, nullable: true }) city!: string | null;
  @Column({ name: 'postal_code', type: 'varchar', length: 30, nullable: true }) postalCode!: string | null;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
