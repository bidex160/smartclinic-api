import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { CareAppointmentStatus } from '../enums/care-appointment-status.enum';
import { CareAppointment } from './care-appointment.entity';

@Entity('care_appointment_status_history')
@Index('IDX_care_appointment_history_appointment_created', ['careAppointmentId', 'createdAt'])
export class CareAppointmentStatusHistory {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'care_appointment_id', type: 'uuid' }) careAppointmentId!: string;
  @ManyToOne(() => CareAppointment, (appointment) => appointment.statusHistory, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'care_appointment_id' }) appointment!: CareAppointment;
  @Column({ name: 'from_status', type: 'enum', enum: CareAppointmentStatus, enumName: 'care_appointment_status_enum', nullable: true }) fromStatus!: CareAppointmentStatus | null;
  @Column({ name: 'to_status', type: 'enum', enum: CareAppointmentStatus, enumName: 'care_appointment_status_enum' }) toStatus!: CareAppointmentStatus;
  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true }) actorUserId!: string | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'actor_user_id' }) actor!: User | null;
  @Column({ name: 'reason_code', type: 'varchar', length: 100 }) reasonCode!: string;
  @Column({ name: 'reason_note', type: 'text', nullable: true }) reasonNote!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
