import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { Provider } from './provider.entity';
import { CareServiceDefinition } from './care-service-definition.entity';

@Entity('provider_care_services')
@Unique('UQ_provider_care_services_provider_definition', ['providerId', 'careServiceDefinitionId'])
@Index('IDX_provider_care_services_public', ['careServiceDefinitionId', 'isActive', 'providerId'])
@Index('IDX_provider_care_services_provider_active', ['providerId', 'isActive'])
@Check('CHK_provider_care_services_price_minor', '"price_minor" IS NULL OR "price_minor" >= 0')
@Check('CHK_provider_care_services_price_currency', '("price_minor" IS NULL AND "currency" IS NULL) OR ("price_minor" IS NOT NULL AND "currency" IS NOT NULL)')
export class ProviderCareService {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'provider_id', type: 'uuid' }) providerId!: string;
  @ManyToOne(() => Provider, (provider) => provider.careServices, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'provider_id' }) provider!: Provider;
  @Column({ name: 'care_service_definition_id', type: 'uuid' }) careServiceDefinitionId!: string;
  @ManyToOne(() => CareServiceDefinition, (definition) => definition.providerServices, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'care_service_definition_id' }) definition!: CareServiceDefinition;
  @Column({ name: 'description_override', type: 'text', nullable: true }) descriptionOverride!: string | null;
  @Column({ name: 'price_minor', type: 'bigint', nullable: true }) priceMinor!: string | null;
  @Column({ type: 'char', length: 3, nullable: true }) currency!: string | null;
  @Column({ name: 'supports_appointment_requests', type: 'boolean', default: true }) supportsAppointmentRequests!: boolean;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
