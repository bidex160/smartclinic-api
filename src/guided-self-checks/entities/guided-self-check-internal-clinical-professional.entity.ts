import { BeforeInsert, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { User } from '../../users/entities/user.entity';
import {
  GuidedSelfCheckInternalClinicalCapability,
  GuidedSelfCheckInternalClinicalProfessionalStatus,
  GuidedSelfCheckInternalClinicalProfessionalType,
} from '../enums/guided-self-check-internal-clinical-professional.enum';
import { GuidedSelfCheckInternalClinicalProfessionalHistory } from './guided-self-check-internal-clinical-professional-history.entity';

@Entity('guided_self_check_internal_clinical_professionals')
@Index('UQ_gsc_internal_professional_reference', ['reference'], { unique: true })
@Index('UQ_gsc_internal_professional_user', ['userId'], { unique: true })
@Index('IDX_gsc_internal_professional_directory', ['status', 'professionalType'])
export class GuidedSelfCheckInternalClinicalProfessional {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 40 }) reference!: string;
  @BeforeInsert() makeReference() { if (!this.reference) this.reference = `SC-ICP-${randomBytes(6).toString('hex').toUpperCase()}`; }
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @Column({ name: 'display_name', type: 'varchar', length: 160 }) displayName!: string;
  @Column({ name: 'professional_type', type: 'enum', enum: GuidedSelfCheckInternalClinicalProfessionalType, enumName: 'gsc_internal_professional_type_enum' }) professionalType!: GuidedSelfCheckInternalClinicalProfessionalType;
  @Column({ type: 'enum', enum: GuidedSelfCheckInternalClinicalProfessionalStatus, enumName: 'gsc_internal_professional_status_enum' }) status!: GuidedSelfCheckInternalClinicalProfessionalStatus;
  @Column({ type: 'enum', enum: GuidedSelfCheckInternalClinicalCapability, enumName: 'gsc_internal_clinical_capability_enum', array: true, default: () => "'{}'" }) capabilities!: GuidedSelfCheckInternalClinicalCapability[];
  @Column({ name: 'authorized_by_user_id', type: 'uuid' }) authorizedByUserId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'authorized_by_user_id' }) authorizedBy!: User;
  @Column({ name: 'authorized_at', type: 'timestamptz' }) authorizedAt!: Date;
  @Column({ name: 'disabled_at', type: 'timestamptz', nullable: true }) disabledAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
  @OneToMany(() => GuidedSelfCheckInternalClinicalProfessionalHistory, history => history.professional) history!: GuidedSelfCheckInternalClinicalProfessionalHistory[];
}
