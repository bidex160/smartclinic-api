import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { GuidedSelfCheckInternalClinicalProfessionalEvent } from '../enums/guided-self-check-internal-clinical-professional.enum';
import { GuidedSelfCheckInternalClinicalProfessional } from './guided-self-check-internal-clinical-professional.entity';

@Entity('guided_self_check_internal_clinical_professional_history')
@Index('IDX_gsc_internal_professional_history', ['professionalId', 'createdAt'])
export class GuidedSelfCheckInternalClinicalProfessionalHistory {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'professional_id', type: 'uuid' }) professionalId!: string;
  @ManyToOne(() => GuidedSelfCheckInternalClinicalProfessional, professional => professional.history, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'professional_id' }) professional!: GuidedSelfCheckInternalClinicalProfessional;
  @Column({ type: 'enum', enum: GuidedSelfCheckInternalClinicalProfessionalEvent, enumName: 'gsc_internal_professional_event_enum' }) event!: GuidedSelfCheckInternalClinicalProfessionalEvent;
  @Column({ name: 'actor_user_id', type: 'uuid' }) actorUserId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'actor_user_id' }) actor!: User;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) metadata!: Record<string, unknown>;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
