import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { PatientCareActionSource } from '../../rewards/enums/patient-care-action-source.enum';
import { DependantRewardQualificationStatus } from '../enums/patient-relationship.enum';
import { Patient } from './patient.entity';

@Entity('dependant_reward_provenance')
@Index('UQ_dependant_reward_provenance_patient', ['dependantPatientId'], { unique: true })
@Index('IDX_dependant_reward_provenance_creator_status', ['createdByUserId', 'status'])
@Check('CHK_dependant_reward_provenance_qualification', `("status" = 'PENDING' AND "qualified_at" IS NULL AND "qualifying_care_source" IS NULL AND "qualifying_care_reference" IS NULL) OR ("status" = 'QUALIFIED' AND "qualified_at" IS NOT NULL AND "qualifying_care_source" IS NOT NULL AND "qualifying_care_reference" IS NOT NULL)`)
export class DependantRewardProvenance {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'dependant_patient_id', type: 'uuid' }) dependantPatientId!: string;
  @OneToOne(() => Patient, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'dependant_patient_id' }) dependantPatient!: Patient;
  @Column({ name: 'created_by_user_id', type: 'uuid' }) createdByUserId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'created_by_user_id' }) createdByUser!: User;
  @Column({ type: 'enum', enum: DependantRewardQualificationStatus, enumName: 'dependant_reward_qualification_status_enum', default: DependantRewardQualificationStatus.PENDING }) status!: DependantRewardQualificationStatus;
  @Column({ name: 'qualifying_care_source', type: 'varchar', length: 80, nullable: true }) qualifyingCareSource!: PatientCareActionSource | null;
  @Column({ name: 'qualifying_care_reference', type: 'varchar', length: 80, nullable: true }) qualifyingCareReference!: string | null;
  @Column({ name: 'qualified_at', type: 'timestamptz', nullable: true }) qualifiedAt!: Date | null;
  @Column({ name: 'reward_credited_at', type: 'timestamptz', nullable: true }) rewardCreditedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
