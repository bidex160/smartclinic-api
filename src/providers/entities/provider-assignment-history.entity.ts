import { User } from '../../users/entities/user.entity';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { ProviderAssignmentStatus } from '../enums/provider-assignment-status.enum';
import { ProviderAssignment } from './provider-assignment.entity';

@Entity('provider_assignment_history')
@Index('IDX_provider_assignment_history_assignment_created_at', ['providerAssignmentId', 'createdAt'])
export class ProviderAssignmentHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'provider_assignment_id', type: 'uuid' })
  providerAssignmentId!: string;

  @ManyToOne(() => ProviderAssignment, (assignment) => assignment.history, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'provider_assignment_id' })
  providerAssignment!: ProviderAssignment;

  @Column({ name: 'from_status', type: 'enum', enum: ProviderAssignmentStatus, enumName: 'provider_assignment_status_enum', nullable: true })
  fromStatus!: ProviderAssignmentStatus | null;

  @Column({ name: 'to_status', type: 'enum', enum: ProviderAssignmentStatus, enumName: 'provider_assignment_status_enum' })
  toStatus!: ProviderAssignmentStatus;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId!: string | null;

  @ManyToOne(() => User, (user) => user.providerAssignmentChanges, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'actor_user_id' })
  actor!: User | null;

  @Column({ name: 'reason_code', type: 'varchar', nullable: true })
  reasonCode!: string | null;

  @Column({ name: 'reason_note', type: 'text', nullable: true })
  reasonNote!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
