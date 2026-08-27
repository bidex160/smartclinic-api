import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { CareRequestStatus } from '../enums/care-request-status.enum';
import { CareRequest } from './care-request.entity';

@Entity('care_request_status_history')
@Index('IDX_care_request_status_history_request_created', ['careRequestId', 'createdAt'])
export class CareRequestStatusHistory {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'care_request_id', type: 'uuid' }) careRequestId!: string;
  @ManyToOne(() => CareRequest, (request) => request.statusHistory, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'care_request_id' }) careRequest!: CareRequest;
  @Column({ name: 'from_status', type: 'enum', enum: CareRequestStatus, enumName: 'care_request_status_enum', nullable: true }) fromStatus!: CareRequestStatus | null;
  @Column({ name: 'to_status', type: 'enum', enum: CareRequestStatus, enumName: 'care_request_status_enum' }) toStatus!: CareRequestStatus;
  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true }) actorUserId!: string | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'actor_user_id' }) actor!: User | null;
  @Column({ name: 'reason_code', type: 'varchar', length: 80, nullable: true }) reasonCode!: string | null;
  @Column({ name: 'reason_note', type: 'text', nullable: true }) reasonNote!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
