import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { CareRequest } from '../../care-requests/entities/care-request.entity';
import { Patient } from '../../patients/entities/patient.entity';
import { CareServiceDefinition } from '../../providers/entities/care-service-definition.entity';
import { ProviderCareService } from '../../providers/entities/provider-care-service.entity';
import { Provider } from '../../providers/entities/provider.entity';
import { User } from '../../users/entities/user.entity';
import { FastTrackSource } from '../enums/fasttrack-source.enum';
import { FastTrackStatus } from '../enums/fasttrack-status.enum';
import { FastTrackRequestStatusHistory } from './fasttrack-request-status-history.entity';

@Entity('fasttrack_requests')
@Unique('UQ_fasttrack_requests_id_user', ['id', 'userId'])
@Index('UQ_fasttrack_requests_reference', ['reference'], { unique: true })
@Index('IDX_fasttrack_requests_user_created', ['userId', 'createdAt'])
@Index('IDX_fasttrack_requests_provider_status', ['providerId', 'status'])
@Index('IDX_fasttrack_requests_status_created', ['status', 'createdAt'])
@Check('CHK_fasttrack_requests_fee', '"fee_minor" > 0')
@Check('CHK_fasttrack_requests_currency', `"currency" ~ '^[A-Z]{3}$'`)
@Check('CHK_fasttrack_requests_source', `("source" = 'SMARTCLINIC_CARE_REQUEST' AND "care_request_id" IS NOT NULL AND "external_appointment_reference" IS NULL) OR ("source" = 'EXTERNAL_APPOINTMENT' AND "care_request_id" IS NULL AND "external_appointment_reference" IS NOT NULL AND "appointment_date" IS NOT NULL)`)
export class FastTrackRequest {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 32 }) reference!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @Column({ name: 'patient_id', type: 'uuid' }) patientId!: string;
  @ManyToOne(() => Patient, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'patient_id' }) patient!: Patient;
  @Column({ type: 'enum', enum: FastTrackSource, enumName: 'fasttrack_source_enum' }) source!: FastTrackSource;
  @Column({ name: 'care_request_id', type: 'uuid', nullable: true }) careRequestId!: string | null;
  @ManyToOne(() => CareRequest, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'care_request_id' }) careRequest!: CareRequest | null;
  @Column({ name: 'provider_id', type: 'uuid' }) providerId!: string;
  @ManyToOne(() => Provider, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'provider_id' }) provider!: Provider;
  @Column({ name: 'provider_care_service_id', type: 'uuid' }) providerCareServiceId!: string;
  @ManyToOne(() => ProviderCareService, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'provider_care_service_id' }) providerCareService!: ProviderCareService;
  @Column({ name: 'care_service_definition_id', type: 'uuid' }) careServiceDefinitionId!: string;
  @ManyToOne(() => CareServiceDefinition, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'care_service_definition_id' }) careServiceDefinition!: CareServiceDefinition;
  @Column({ name: 'external_appointment_reference', type: 'varchar', length: 160, nullable: true }) externalAppointmentReference!: string | null;
  @Column({ name: 'appointment_date', type: 'date', nullable: true }) appointmentDate!: string | null;
  @Column({ name: 'appointment_time', type: 'time', nullable: true }) appointmentTime!: string | null;
  @Column({ type: 'varchar', length: 160, nullable: true }) department!: string | null;
  @Column({ name: 'doctor_name', type: 'varchar', length: 160, nullable: true }) doctorName!: string | null;
  @Column({ type: 'text', nullable: true }) notes!: string | null;
  @Column({ name: 'fee_minor', type: 'bigint' }) feeMinor!: string;
  @Column({ type: 'char', length: 3 }) currency!: string;
  @Column({ type: 'enum', enum: FastTrackStatus, enumName: 'fasttrack_status_enum' }) status!: FastTrackStatus;
  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true }) verifiedAt!: Date | null;
  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true }) paidAt!: Date | null;
  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true }) confirmedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
  @OneToMany(() => FastTrackRequestStatusHistory, (history) => history.fastTrackRequest) statusHistory!: FastTrackRequestStatusHistory[];
}
