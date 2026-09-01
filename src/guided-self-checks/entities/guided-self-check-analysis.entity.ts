import { BeforeInsert, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { GuidedSelfCheckAnalysisFailureCode, GuidedSelfCheckAnalysisPriority, GuidedSelfCheckAnalysisStatus } from '../enums/guided-self-check-analysis.enum';
import { GuidedSelfCheckNextActionType } from '../enums/guided-self-check-next-action.enum';
import { GuidedSelfCheckClassificationResult } from './guided-self-check-classification.entity';
import { GuidedSelfCheck } from './guided-self-check.entity';

export interface GuidedSelfCheckAnalysisOutput {
  conciseSummary: string;
  notableResponses: string[];
  inconsistencies: string[];
  informationGaps: string[];
  suggestedOperationalPriority: GuidedSelfCheckAnalysisPriority;
  humanReviewSuggested: boolean;
  safeReasonCodes: string[];
  recommendedAction: GuidedSelfCheckNextActionType.BOOK_ESSENTIAL_CHECK | GuidedSelfCheckNextActionType.FIND_CARE | GuidedSelfCheckNextActionType.REQUEST_PROFESSIONAL_CONTACT | null;
  escalationSuggested: boolean;
}

@Entity('guided_self_check_analyses')
@Index('UQ_gsc_analysis_reference', ['reference'], { unique: true })
@Index('UQ_gsc_analysis_classification', ['classificationId'], { unique: true })
@Index('IDX_gsc_analysis_queue', ['status', 'createdAt'])
export class GuidedSelfCheckAnalysis {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 40 }) reference!: string;
  @BeforeInsert() makeReference() { if (!this.reference) this.reference = `SC-GSA-${randomBytes(6).toString('hex').toUpperCase()}`; }
  @Column({ name: 'guided_self_check_id', type: 'uuid' }) guidedSelfCheckId!: string;
  @ManyToOne(() => GuidedSelfCheck, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'guided_self_check_id' }) selfCheck!: GuidedSelfCheck;
  @Column({ name: 'classification_id', type: 'uuid' }) classificationId!: string;
  @ManyToOne(() => GuidedSelfCheckClassificationResult, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'classification_id' }) classification!: GuidedSelfCheckClassificationResult;
  @Column({ type: 'enum', enum: GuidedSelfCheckAnalysisStatus, enumName: 'guided_self_check_analysis_status_enum' }) status!: GuidedSelfCheckAnalysisStatus;
  @Column({ type: 'jsonb', nullable: true }) output!: GuidedSelfCheckAnalysisOutput | null;
  @Column({ name: 'provider_key', type: 'varchar', length: 80, nullable: true }) providerKey!: string | null;
  @Column({ name: 'model_key', type: 'varchar', length: 120, nullable: true }) modelKey!: string | null;
  @Column({ name: 'prompt_version', type: 'varchar', length: 80, nullable: true }) promptVersion!: string | null;
  @Column({ name: 'failure_code', type: 'enum', enum: GuidedSelfCheckAnalysisFailureCode, enumName: 'guided_self_check_analysis_failure_code_enum', nullable: true }) failureCode!: GuidedSelfCheckAnalysisFailureCode | null;
  @Column({ name: 'human_review_recommended', type: 'boolean', default: false }) humanReviewRecommended!: boolean;
  @Column({ name: 'started_at', type: 'timestamptz', nullable: true }) startedAt!: Date | null;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
