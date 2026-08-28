import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { CareRequest } from '../../care-requests/entities/care-request.entity';
import { Patient } from '../../patients/entities/patient.entity';
import { ProviderCareService } from '../../providers/entities/provider-care-service.entity';
import { ProviderLocation } from '../../providers/entities/provider-location.entity';
import { Provider } from '../../providers/entities/provider.entity';
import { CareAppointmentStatus } from '../enums/care-appointment-status.enum';
import { CareAppointmentStatusHistory } from './care-appointment-status-history.entity';

@Entity('care_appointments')
@Unique('UQ_care_appointments_id_provider', ['id', 'providerId'])
@Index('UQ_care_appointments_reference', ['reference'], { unique: true })
@Index('IDX_care_appointments_request_created', ['careRequestId', 'createdAt'])
@Index('IDX_care_appointments_provider_date_status', ['providerId', 'scheduledDate', 'status'])
@Index('IDX_care_appointments_patient_created', ['patientId', 'createdAt'])
@Check('CHK_care_appointments_time_range', '"scheduled_time_to" > "scheduled_time_from"')
export class CareAppointment {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 32 }) reference!: string;
  @Column({ name: 'care_request_id', type: 'uuid' }) careRequestId!: string;
  @ManyToOne(() => CareRequest, (request) => request.appointments, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'care_request_id' }) careRequest!: CareRequest;
  @Column({ name: 'patient_id', type: 'uuid' }) patientId!: string;
  @ManyToOne(() => Patient, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'patient_id' }) patient!: Patient;
  @Column({ name: 'provider_id', type: 'uuid' }) providerId!: string;
  @ManyToOne(() => Provider, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'provider_id' }) provider!: Provider;
  @Column({ name: 'provider_care_service_id', type: 'uuid' }) providerCareServiceId!: string;
  @ManyToOne(() => ProviderCareService, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'provider_care_service_id' }) providerCareService!: ProviderCareService;
  @Column({ name: 'provider_location_id', type: 'uuid', nullable: true }) providerLocationId!: string | null;
  @ManyToOne(() => ProviderLocation, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'provider_location_id' }) providerLocation!: ProviderLocation | null;
  @Column({ name: 'scheduled_date', type: 'date' }) scheduledDate!: string;
  @Column({ name: 'scheduled_time_from', type: 'time' }) scheduledTimeFrom!: string;
  @Column({ name: 'scheduled_time_to', type: 'time' }) scheduledTimeTo!: string;
  @Column({ type: 'varchar', length: 100 }) timezone!: string;
  @Column({ type: 'enum', enum: CareAppointmentStatus, enumName: 'care_appointment_status_enum' }) status!: CareAppointmentStatus;
  @Column({ type: 'text', nullable: true }) notes!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
  @OneToMany(() => CareAppointmentStatusHistory, (history) => history.appointment) statusHistory!: CareAppointmentStatusHistory[];
}
