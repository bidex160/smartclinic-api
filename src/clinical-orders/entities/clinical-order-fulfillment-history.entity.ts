import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ClinicalOrderFulfillmentStatus } from '../enums/clinical-order-fulfillment-status.enum';
import { ClinicalOrderFulfillment } from './clinical-order-fulfillment.entity';
@Entity('clinical_order_fulfillment_history') @Index('IDX_order_fulfillment_history_fulfillment_created', ['fulfillmentId', 'createdAt'])
export class ClinicalOrderFulfillmentHistory {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'fulfillment_id', type: 'uuid' }) fulfillmentId!: string;
  @ManyToOne(() => ClinicalOrderFulfillment, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'fulfillment_id' }) fulfillment!: ClinicalOrderFulfillment;
  @Column({ name: 'from_status', type: 'enum', enum: ClinicalOrderFulfillmentStatus, enumName: 'clinical_order_fulfillment_status_enum', nullable: true }) fromStatus!: ClinicalOrderFulfillmentStatus | null;
  @Column({ name: 'to_status', type: 'enum', enum: ClinicalOrderFulfillmentStatus, enumName: 'clinical_order_fulfillment_status_enum' }) toStatus!: ClinicalOrderFulfillmentStatus;
  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true }) actorUserId!: string | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'actor_user_id' }) actorUser!: User | null;
  @Column({ name: 'reason_code', type: 'varchar', length: 80 }) reasonCode!: string;
  @Column({ name: 'reason_note', type: 'varchar', length: 500, nullable: true }) reasonNote!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
