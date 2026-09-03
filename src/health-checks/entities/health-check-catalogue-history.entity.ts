import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('health_check_catalogue_history')
@Index('IDX_health_check_catalogue_history_package', ['healthCheckPackageId', 'createdAt'])
@Index('IDX_health_check_catalogue_history_content', ['clinicalContentId', 'createdAt'])
export class HealthCheckCatalogueHistory {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'actor_user_id', type: 'uuid' }) actorUserId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'actor_user_id' }) actor!: User;
  @Column({ name: 'health_check_package_id', type: 'uuid', nullable: true }) healthCheckPackageId!: string | null;
  @Column({ name: 'clinical_content_id', type: 'uuid', nullable: true }) clinicalContentId!: string | null;
  @Column({ type: 'varchar', length: 80 }) operation!: string;
  @Column({ name: 'previous_state', type: 'jsonb', nullable: true }) previousState!: Record<string, unknown> | null;
  @Column({ name: 'resulting_state', type: 'jsonb' }) resultingState!: Record<string, unknown>;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
