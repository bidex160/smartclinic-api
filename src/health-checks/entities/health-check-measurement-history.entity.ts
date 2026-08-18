import { User } from '../../users/entities/user.entity';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { HealthCheckMeasurementAction } from '../enums/health-check-measurement-action.enum';
import { HealthCheckMeasurement } from './health-check-measurement.entity';

export interface MeasurementAuditValue { primary: string; secondary: string | null; unit: string }

@Entity('health_check_measurement_history')
@Index('IDX_health_check_measurement_history_measurement_created', ['measurementId', 'createdAt'])
export class HealthCheckMeasurementHistory {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'measurement_id', type: 'uuid' }) measurementId!: string;
  @ManyToOne(() => HealthCheckMeasurement, (measurement) => measurement.history, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'measurement_id' }) measurement!: HealthCheckMeasurement;
  @Column({ type: 'enum', enum: HealthCheckMeasurementAction, enumName: 'health_check_measurement_action_enum' }) action!: HealthCheckMeasurementAction;
  @Column({ name: 'previous_value', type: 'jsonb', nullable: true }) previousValue!: MeasurementAuditValue | null;
  @Column({ name: 'new_value', type: 'jsonb' }) newValue!: MeasurementAuditValue;
  @Column({ name: 'actor_user_id', type: 'uuid' }) actorUserId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'actor_user_id' }) actor!: User;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
