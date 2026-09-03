import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { HealthCheckClinicalContent } from '../../health-checks/entities/health-check-clinical-content.entity';
import { ProviderService } from './provider-service.entity';

@Entity('provider_service_addons')
@Index('UQ_provider_service_addon', ['providerServiceId', 'clinicalContentId'], { unique: true })
@Index('IDX_provider_service_addon_active', ['providerServiceId', 'isActive'])
@Check('CHK_provider_service_addon_price', '"price_minor" >= 0')
@Check('CHK_provider_service_addon_currency', '"currency" ~ \'^[A-Z]{3}$\'')
export class ProviderServiceAddon {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'provider_service_id', type: 'uuid' }) providerServiceId!: string;
  @ManyToOne(() => ProviderService, (value) => value.addons, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'provider_service_id' }) providerService!: ProviderService;
  @Column({ name: 'clinical_content_id', type: 'uuid' }) clinicalContentId!: string;
  @ManyToOne(() => HealthCheckClinicalContent, (value) => value.providerOfferings, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'clinical_content_id' })
  clinicalContent!: HealthCheckClinicalContent;
  @Column({ name: 'price_minor', type: 'bigint' }) priceMinor!: string;
  @Column({ type: 'char', length: 3 }) currency!: string;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive!: boolean;
}
