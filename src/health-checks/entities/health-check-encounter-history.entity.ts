import { User } from '../../users/entities/user.entity';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { HealthCheckEncounterStatus } from '../enums/health-check-encounter-status.enum';
import { HealthCheckEncounter } from './health-check-encounter.entity';

@Entity('health_check_encounter_history')
@Index('IDX_health_check_encounter_history_encounter_created', ['encounterId', 'createdAt'])
export class HealthCheckEncounterHistory {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'encounter_id', type: 'uuid' }) encounterId!: string;
  @ManyToOne(() => HealthCheckEncounter, (encounter) => encounter.history, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'encounter_id' }) encounter!: HealthCheckEncounter;
  @Column({ name: 'from_status', type: 'enum', enum: HealthCheckEncounterStatus, enumName: 'health_check_encounter_status_enum', nullable: true }) fromStatus!: HealthCheckEncounterStatus | null;
  @Column({ name: 'to_status', type: 'enum', enum: HealthCheckEncounterStatus, enumName: 'health_check_encounter_status_enum' }) toStatus!: HealthCheckEncounterStatus;
  @Column({ name: 'actor_user_id', type: 'uuid' }) actorUserId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'actor_user_id' }) actor!: User;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
