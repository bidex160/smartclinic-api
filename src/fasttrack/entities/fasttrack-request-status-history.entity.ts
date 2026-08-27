import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { FastTrackStatus } from '../enums/fasttrack-status.enum';
import { FastTrackRequest } from './fasttrack-request.entity';

@Entity('fasttrack_request_status_history')
@Index('IDX_fasttrack_history_request_created', ['fastTrackRequestId', 'createdAt'])
export class FastTrackRequestStatusHistory {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'fasttrack_request_id', type: 'uuid' }) fastTrackRequestId!: string;
  @ManyToOne(() => FastTrackRequest, (request) => request.statusHistory, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'fasttrack_request_id' }) fastTrackRequest!: FastTrackRequest;
  @Column({ name: 'from_status', type: 'enum', enum: FastTrackStatus, enumName: 'fasttrack_status_enum', nullable: true }) fromStatus!: FastTrackStatus | null;
  @Column({ name: 'to_status', type: 'enum', enum: FastTrackStatus, enumName: 'fasttrack_status_enum' }) toStatus!: FastTrackStatus;
  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true }) actorUserId!: string | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'actor_user_id' }) actorUser!: User | null;
  @Column({ name: 'reason_code', type: 'varchar', length: 100 }) reasonCode!: string;
  @Column({ name: 'reason_note', type: 'text', nullable: true }) reasonNote!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
