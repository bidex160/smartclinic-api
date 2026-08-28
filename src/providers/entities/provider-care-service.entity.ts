import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { Provider } from './provider.entity';
import { CareServiceDefinition } from './care-service-definition.entity';
import { CareDeliveryMode } from '../enums/care-delivery-mode.enum';

@Entity('provider_care_services')
@Unique('UQ_provider_care_services_provider_definition', ['providerId', 'careServiceDefinitionId'])
@Unique('UQ_provider_care_services_id_provider', ['id', 'providerId'])
@Unique('UQ_provider_care_services_id_definition', ['id', 'careServiceDefinitionId'])
@Index('IDX_provider_care_services_public', ['careServiceDefinitionId', 'isActive', 'providerId'])
@Index('IDX_provider_care_services_provider_active', ['providerId', 'isActive'])
@Check('CHK_provider_care_services_price_minor', '"price_minor" IS NULL OR "price_minor" >= 0')
@Check('CHK_provider_care_services_price_currency', '("price_minor" IS NULL AND "currency" IS NULL) OR ("price_minor" IS NOT NULL AND "currency" IS NOT NULL)')
@Check('CHK_provider_care_services_fasttrack_fee', '("supports_fast_track" = false AND "fast_track_fee_minor" IS NULL AND "fast_track_currency" IS NULL) OR ("supports_fast_track" = true AND "fast_track_fee_minor" > 0 AND "fast_track_currency" IS NOT NULL)')
@Check('CHK_provider_care_services_delivery_modes', 'cardinality("delivery_modes") > 0')
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
  @Column({ name: 'delivery_modes', type: 'enum', enum: CareDeliveryMode, enumName: 'general_care_delivery_mode_enum', array: true, default: [CareDeliveryMode.IN_PERSON] }) deliveryModes!: CareDeliveryMode[];
  @Column({ name: 'supports_fast_track', type: 'boolean', default: false }) supportsFastTrack!: boolean;
  @Column({ name: 'fast_track_fee_minor', type: 'bigint', nullable: true }) fastTrackFeeMinor!: string | null;
  @Column({ name: 'fast_track_currency', type: 'char', length: 3, nullable: true }) fastTrackCurrency!: string | null;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
