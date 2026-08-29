import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { PatientProviderConnectionStatus } from '../enums/patient-provider-connection-status.enum';
import { PatientProviderConnection } from './patient-provider-connection.entity';
@Entity('patient_provider_connection_history')
@Index('IDX_patient_provider_connection_history_connection', ['connectionId', 'createdAt'])
export class PatientProviderConnectionHistory {
 @PrimaryGeneratedColumn('uuid') id!: string;
 @Column({ name: 'connection_id', type: 'uuid' }) connectionId!: string;
 @ManyToOne(() => PatientProviderConnection, connection => connection.history, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'connection_id' }) connection!: PatientProviderConnection;
 @Column({ name: 'from_status', type: 'enum', enum: PatientProviderConnectionStatus, enumName: 'patient_provider_connection_status_enum', nullable: true }) fromStatus!: PatientProviderConnectionStatus | null;
 @Column({ name: 'to_status', type: 'enum', enum: PatientProviderConnectionStatus, enumName: 'patient_provider_connection_status_enum' }) toStatus!: PatientProviderConnectionStatus;
 @Column({ name: 'actor_user_id', type: 'uuid', nullable: true }) actorUserId!: string | null;
 @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'actor_user_id' }) actorUser!: User | null;
 @Column({ name: 'reason_code', type: 'varchar', length: 80 }) reasonCode!: string;
 @Column({ name: 'reason_note', type: 'text', nullable: true }) reasonNote!: string | null;
 @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
