import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { HmoPlan } from './hmo-plan.entity';
import { Hmo } from './hmo.entity';
import { Patient } from '../../patients/entities/patient.entity';
@Entity('hmo_enrollment_leads')
@Index('IDX_hmo_enrollment_leads_status', ['status'])
export class HmoEnrollmentLead {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ name: 'patient_id', type: 'uuid' }) patientId!: string;
  @ManyToOne(() => Patient, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'patient_id' }) patient!: Patient;
  @Column({ name: 'preferred_hmo_id', type: 'uuid', nullable: true }) preferredHmoId!: string | null;
  @ManyToOne(() => Hmo, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'preferred_hmo_id' }) preferredHmo!: Hmo | null;
  @Column({ name: 'plan_id', type: 'uuid', nullable: true }) planId!: string | null;
  @ManyToOne(() => HmoPlan, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'plan_id' }) plan!: HmoPlan | null;
  @Column({ name: 'quoted_amount_minor', type: 'bigint', nullable: true }) quotedAmountMinor!: string | null;
  @Column({ name: 'quoted_currency', type: 'char', length: 3, nullable: true }) quotedCurrency!: string | null;
  @Column({ name: 'consent_captured_at', type: 'timestamptz', nullable: true }) consentCapturedAt!: Date | null;
  @Column({ type: 'varchar', length: 30, default: 'NEW' }) status!: string;
  @Column({ name: 'employer_organisation', type: 'varchar', nullable: true }) employerOrganisation!: string | null;
  @Column({ type: 'text', nullable: true }) notes!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
