import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ClinicalRecord } from './clinical-record.entity';

@Entity('clinical_consultation_details')
export class ClinicalConsultationDetail {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'clinical_record_id', type: 'uuid', unique: true }) clinicalRecordId!: string;
  @OneToOne(() => ClinicalRecord, (record) => record.consultation, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'clinical_record_id' }) clinicalRecord!: ClinicalRecord;
  @Column({ name: 'presenting_complaint', type: 'text', nullable: true }) presentingComplaint!: string | null;
  @Column({ name: 'history_of_presenting_complaint', type: 'text', nullable: true }) historyOfPresentingComplaint!: string | null;
  @Column({ type: 'text', nullable: true }) observations!: string | null;
  @Column({ type: 'text', nullable: true }) assessment!: string | null;
  @Column({ type: 'text', nullable: true }) diagnosis!: string | null;
  @Column({ type: 'text', nullable: true }) plan!: string | null;
  @Column({ name: 'follow_up_instructions', type: 'text', nullable: true }) followUpInstructions!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
