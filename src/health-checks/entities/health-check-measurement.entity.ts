import { User } from '../../users/entities/user.entity';
import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { HealthCheckMeasurementCode } from '../enums/health-check-measurement-code.enum';
import { HealthCheckEncounter } from './health-check-encounter.entity';
import { HealthCheckMeasurementHistory } from './health-check-measurement-history.entity';

@Entity('health_check_measurements')
@Unique('UQ_health_check_measurements_encounter_code', ['encounterId', 'code'])
@Index('IDX_health_check_measurements_encounter', ['encounterId'])
@Check('CHK_health_check_measurements_shape', `("code" = 'BLOOD_PRESSURE' AND "value_secondary_numeric" IS NOT NULL) OR ("code" <> 'BLOOD_PRESSURE' AND "value_secondary_numeric" IS NULL)`)
export class HealthCheckMeasurement {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'encounter_id', type: 'uuid' }) encounterId!: string;
  @ManyToOne(() => HealthCheckEncounter, (encounter) => encounter.measurements, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'encounter_id' }) encounter!: HealthCheckEncounter;
  @Column({ type: 'enum', enum: HealthCheckMeasurementCode, enumName: 'health_check_measurement_code_enum' }) code!: HealthCheckMeasurementCode;
  @Column({ name: 'value_numeric', type: 'numeric', precision: 12, scale: 4 }) valueNumeric!: string;
  @Column({ name: 'value_secondary_numeric', type: 'numeric', precision: 12, scale: 4, nullable: true }) valueSecondaryNumeric!: string | null;
  @Column({ type: 'varchar', length: 16 }) unit!: string;
  @Column({ name: 'recorded_at', type: 'timestamptz' }) recordedAt!: Date;
  @Column({ name: 'recorded_by_user_id', type: 'uuid' }) recordedByUserId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'recorded_by_user_id' }) recordedBy!: User;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
  @OneToMany(() => HealthCheckMeasurementHistory, (history) => history.measurement) history!: HealthCheckMeasurementHistory[];
}
