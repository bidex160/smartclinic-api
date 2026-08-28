import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { CareDeliveryMode } from '../enums/care-delivery-mode.enum';
import { ProviderCareService } from './provider-care-service.entity';

@Entity('provider_care_service_delivery_options')
@Unique('UQ_provider_care_service_delivery_options_mode', ['providerCareServiceId', 'deliveryMode'])
@Index('IDX_provider_care_service_delivery_options_mode_service', ['deliveryMode', 'providerCareServiceId'])
@Check('CHK_provider_care_service_delivery_options_price', '"price_minor" >= 0')
@Check('CHK_provider_care_service_delivery_options_currency', '"currency" ~ \'^[A-Z]{3}$\'')
export class ProviderCareServiceDeliveryOption {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'provider_care_service_id', type: 'uuid' }) providerCareServiceId!: string;
  @ManyToOne(() => ProviderCareService, (service) => service.deliveryOptions, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'provider_care_service_id' }) providerCareService!: ProviderCareService;
  @Column({ name: 'delivery_mode', type: 'enum', enum: CareDeliveryMode, enumName: 'general_care_delivery_mode_enum' }) deliveryMode!: CareDeliveryMode;
  @Column({ name: 'price_minor', type: 'bigint' }) priceMinor!: string;
  @Column({ type: 'char', length: 3 }) currency!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
