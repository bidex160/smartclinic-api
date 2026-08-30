import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ClinicalTemplateField } from '../../clinical-records/clinical-documentation-template';
import { ProviderCareService } from './provider-care-service.entity';
import { ClinicalRecordType } from '../../clinical-records/enums/clinical-record-type.enum';

@Entity('provider_care_service_clinical_templates')
@Index('UQ_provider_care_service_clinical_templates_version', ['providerCareServiceId', 'version'], { unique: true })
@Index('UQ_provider_care_service_clinical_templates_current', ['providerCareServiceId'], { unique: true, where: '"is_current" = true' })
@Check('CHK_provider_care_service_clinical_templates_version', '"version" > 0')
@Check('CHK_provider_care_service_clinical_templates_fields', `jsonb_typeof("fields") = 'array'`)
export class ProviderCareServiceClinicalTemplate {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'provider_care_service_id', type: 'uuid' }) providerCareServiceId!: string;
  @ManyToOne(() => ProviderCareService, (service) => service.clinicalTemplates, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'provider_care_service_id' }) providerCareService!: ProviderCareService;
  @Column({ type: 'integer' }) version!: number;
  @Column({ name: 'record_type', type: 'enum', enum: ClinicalRecordType, enumName: 'clinical_record_type_enum' }) recordType!: ClinicalRecordType;
  @Column({ type: 'jsonb' }) fields!: ClinicalTemplateField[];
  @Column({ name: 'is_current', type: 'boolean', default: true }) isCurrent!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
