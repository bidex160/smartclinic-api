import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { CareServiceDefinition } from '../../providers/entities/care-service-definition.entity';
import { ProviderCareService } from '../../providers/entities/provider-care-service.entity';
import { Provider } from '../../providers/entities/provider.entity';
import { Patient } from '../../patients/entities/patient.entity';
import { User } from '../../users/entities/user.entity';
import { CareRequestContactMethod } from '../enums/care-request-contact-method.enum';
import { CareRequestStatus } from '../enums/care-request-status.enum';
import { CareRequestStatusHistory } from './care-request-status-history.entity';
import { CareAppointment } from '../../care-appointments/entities/care-appointment.entity';
import { CareDeliveryMode } from '../../providers/enums/care-delivery-mode.enum';

@Entity('care_requests')
@Index('UQ_care_requests_reference', ['reference'], { unique: true })
@Index('IDX_care_requests_patient_created', ['patientId', 'createdAt'])
@Index('IDX_care_requests_user_created', ['userId', 'createdAt'])
@Index('IDX_care_requests_status_created', ['status', 'createdAt'])
@Index('IDX_care_requests_assigned_provider_status', ['assignedProviderId', 'status'])
@Index('IDX_care_requests_service_status', ['careServiceDefinitionId', 'status'])
@Unique('UQ_care_requests_appointment_link', ['id', 'patientId', 'assignedProviderId', 'assignedProviderCareServiceId'])
@Check('CHK_care_requests_country_code', `"country_code" ~ '^[A-Z]{2}$'`)
@Check('CHK_care_requests_assigned_pair', '("assigned_provider_id" IS NULL AND "assigned_provider_care_service_id" IS NULL) OR ("assigned_provider_id" IS NOT NULL AND "assigned_provider_care_service_id" IS NOT NULL)')
@Check('CHK_care_requests_preferred_pair', '("preferred_provider_id" IS NULL AND "preferred_provider_care_service_id" IS NULL) OR ("preferred_provider_id" IS NOT NULL AND "preferred_provider_care_service_id" IS NOT NULL)')
@Check('CHK_care_requests_service_price_pair', '("service_price_minor" IS NULL AND "service_currency" IS NULL) OR ("service_price_minor" IS NOT NULL AND "service_currency" IS NOT NULL)')
@Check('CHK_care_requests_service_price_nonnegative', '"service_price_minor" IS NULL OR "service_price_minor" >= 0')
@Check('CHK_care_requests_service_currency', '"service_currency" IS NULL OR "service_currency" ~ \'^[A-Z]{3}$\'')
export class CareRequest {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 32 }) reference!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @Column({ name: 'patient_id', type: 'uuid' }) patientId!: string;
  @ManyToOne(() => Patient, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'patient_id' }) patient!: Patient;
  @Column({ name: 'care_service_definition_id', type: 'uuid' }) careServiceDefinitionId!: string;
  @ManyToOne(() => CareServiceDefinition, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'care_service_definition_id' }) careServiceDefinition!: CareServiceDefinition;
  @Column({ name: 'preferred_provider_id', type: 'uuid', nullable: true }) preferredProviderId!: string | null;
  @ManyToOne(() => Provider, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'preferred_provider_id' }) preferredProvider!: Provider | null;
  @Column({ name: 'preferred_provider_care_service_id', type: 'uuid', nullable: true }) preferredProviderCareServiceId!: string | null;
  @ManyToOne(() => ProviderCareService, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'preferred_provider_care_service_id' }) preferredProviderCareService!: ProviderCareService | null;
  @Column({ name: 'assigned_provider_id', type: 'uuid', nullable: true }) assignedProviderId!: string | null;
  @ManyToOne(() => Provider, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'assigned_provider_id' }) assignedProvider!: Provider | null;
  @Column({ name: 'assigned_provider_care_service_id', type: 'uuid', nullable: true }) assignedProviderCareServiceId!: string | null;
  @ManyToOne(() => ProviderCareService, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'assigned_provider_care_service_id' }) assignedProviderCareService!: ProviderCareService | null;
  @Column({ name: 'country_code', type: 'char', length: 2 }) countryCode!: string;
  @Column({ name: 'state_or_region', type: 'varchar', length: 120 }) stateOrRegion!: string;
  @Column({ type: 'varchar', length: 120 }) city!: string;
  @Column({ name: 'delivery_mode', type: 'enum', enum: CareDeliveryMode, enumName: 'general_care_delivery_mode_enum', default: CareDeliveryMode.IN_PERSON }) deliveryMode!: CareDeliveryMode;
  @Column({ name: 'service_price_minor', type: 'bigint', nullable: true }) servicePriceMinor!: string | null;
  @Column({ name: 'service_currency', type: 'char', length: 3, nullable: true }) serviceCurrency!: string | null;
  @Column({ type: 'text', nullable: true }) notes!: string | null;
  @Column({ name: 'preferred_date', type: 'date', nullable: true }) preferredDate!: string | null;
  @Column({ name: 'preferred_time', type: 'time', nullable: true }) preferredTime!: string | null;
  @Column({ name: 'contact_method', type: 'enum', enum: CareRequestContactMethod, enumName: 'care_request_contact_method_enum' }) contactMethod!: CareRequestContactMethod;
  @Column({ type: 'enum', enum: CareRequestStatus, enumName: 'care_request_status_enum' }) status!: CareRequestStatus;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
  @OneToMany(() => CareRequestStatusHistory, (history) => history.careRequest) statusHistory!: CareRequestStatusHistory[];
  @OneToMany(() => CareAppointment, (appointment) => appointment.careRequest) appointments!: CareAppointment[];
}
