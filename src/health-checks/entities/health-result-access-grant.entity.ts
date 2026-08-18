import { Patient } from '../../patients/entities/patient.entity';
import { User } from '../../users/entities/user.entity';
import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { HealthResultAccessGrantStatus } from '../enums/health-result-access-grant-status.enum';
import { HealthCheckEncounter } from './health-check-encounter.entity';

@Entity('health_result_access_grants')
@Index('UQ_health_result_access_grants_token_hash', ['accessTokenHash'], { unique: true, where: '"access_token_hash" IS NOT NULL' })
@Index('UQ_health_result_access_grants_active_encounter', ['encounterId'], { unique: true, where: '"status" = \'ACTIVE\'' })
@Index('IDX_health_result_access_grants_patient_status', ['patientId', 'status'])
@Check('CHK_health_result_access_grants_authority', '("user_id" IS NOT NULL) <> ("access_token_hash" IS NOT NULL)')
export class HealthResultAccessGrant {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'patient_id', type: 'uuid' }) patientId!: string;
  @ManyToOne(() => Patient, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'patient_id' }) patient!: Patient;
  @Column({ name: 'encounter_id', type: 'uuid' }) encounterId!: string;
  @ManyToOne(() => HealthCheckEncounter, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'encounter_id' }) encounter!: HealthCheckEncounter;
  @Column({ name: 'user_id', type: 'uuid', nullable: true }) userId!: string | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'user_id' }) user!: User | null;
  @Column({ name: 'access_token_hash', type: 'char', length: 64, nullable: true }) accessTokenHash!: string | null;
  @Column({ type: 'enum', enum: HealthResultAccessGrantStatus, enumName: 'health_result_access_grant_status_enum', default: HealthResultAccessGrantStatus.ACTIVE }) status!: HealthResultAccessGrantStatus;
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true }) expiresAt!: Date | null;
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true }) revokedAt!: Date | null;
  @Column({ name: 'created_by_user_id', type: 'uuid' }) createdByUserId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'created_by_user_id' }) createdBy!: User;
  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true }) lastUsedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
