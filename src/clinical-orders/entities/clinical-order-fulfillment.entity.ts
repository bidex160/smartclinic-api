import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Patient } from '../../patients/entities/patient.entity';
import { ProviderServiceUnit } from '../../provider-service-units/entities/provider-service-unit.entity';
import { Provider } from '../../providers/entities/provider.entity';
import { User } from '../../users/entities/user.entity';
import { ClinicalOrderFulfillmentStatus } from '../enums/clinical-order-fulfillment-status.enum';
import { ClinicalOrder } from './clinical-order.entity';

@Entity('clinical_order_fulfillments')
@Index('UQ_clinical_order_fulfillments_reference', ['reference'], { unique: true })
@Index('IDX_clinical_order_fulfillments_provider_status', ['fulfillmentProviderId', 'status'])
@Index('IDX_clinical_order_fulfillments_order_created', ['clinicalOrderId', 'createdAt'])
export class ClinicalOrderFulfillment {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 32 }) reference!: string;
  @Column({ name: 'clinical_order_id', type: 'uuid' }) clinicalOrderId!: string;
  @ManyToOne(() => ClinicalOrder, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'clinical_order_id' }) clinicalOrder!: ClinicalOrder;
  @Column({ name: 'patient_id', type: 'uuid' }) patientId!: string;
  @ManyToOne(() => Patient, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'patient_id' }) patient!: Patient;
  @Column({ name: 'fulfillment_provider_id', type: 'uuid' }) fulfillmentProviderId!: string;
  @ManyToOne(() => Provider, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'fulfillment_provider_id' }) fulfillmentProvider!: Provider;
  @Column({ name: 'fulfillment_service_unit_id', type: 'uuid' }) fulfillmentServiceUnitId!: string;
  @ManyToOne(() => ProviderServiceUnit, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'fulfillment_service_unit_id' }) fulfillmentServiceUnit!: ProviderServiceUnit;
  @Column({ name: 'recommended_service_unit_id', type: 'uuid', nullable: true }) recommendedServiceUnitId!: string | null;
  @ManyToOne(() => ProviderServiceUnit, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'recommended_service_unit_id' }) recommendedServiceUnit!: ProviderServiceUnit | null;
  @Column({ name: 'recommended_by_provider_id', type: 'uuid', nullable: true }) recommendedByProviderId!: string | null;
  @ManyToOne(() => Provider, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'recommended_by_provider_id' }) recommendedByProvider!: Provider | null;
  @Column({ name: 'selected_by_user_id', type: 'uuid', nullable: true }) selectedByUserId!: string | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'selected_by_user_id' }) selectedByUser!: User | null;
  @Column({ type: 'enum', enum: ClinicalOrderFulfillmentStatus, enumName: 'clinical_order_fulfillment_status_enum' }) status!: ClinicalOrderFulfillmentStatus;
  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true }) acceptedAt!: Date | null;
  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true }) cancelledAt!: Date | null;
  @Column({ name: 'cancellation_reason', type: 'varchar', length: 500, nullable: true }) cancellationReason!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
