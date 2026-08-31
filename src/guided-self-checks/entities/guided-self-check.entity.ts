import { Check,Column,CreateDateColumn,Entity,Index,JoinColumn,ManyToOne,OneToMany,PrimaryGeneratedColumn,UpdateDateColumn } from 'typeorm';
import { Patient } from '../../patients/entities/patient.entity'; import { User } from '../../users/entities/user.entity';
import { GuidedSelfCheckFundingStatus,GuidedSelfCheckWorkflowStatus } from '../enums/guided-self-check.enum';
import { GuidedSelfCheckHistory } from './guided-self-check-history.entity';
import { GuidedSelfCheckQuestionnaireVersion } from './guided-self-check-questionnaire-version.entity'; import { GuidedSelfCheckClassificationStatus } from '../enums/guided-self-check-classification.enum';
@Entity('guided_self_checks')
@Index('IDX_gsc_patient_created',['patientId','createdAt']) @Index('IDX_gsc_patient_funding',['patientId','fundingStatus'])
@Check('CHK_gsc_snapshot_money','"standard_price_minor_snapshot" >= 0 AND "effective_price_minor" >= 0 AND ("promotional_price_minor_snapshot" IS NULL OR "promotional_price_minor_snapshot" >= 0)')
@Check('CHK_gsc_currency','"currency" ~ \'^[A-Z]{3}$\'')
export class GuidedSelfCheck {
 @PrimaryGeneratedColumn('uuid') id!:string; @Column({type:'varchar',length:32,unique:true}) reference!:string;
 @Column({name:'patient_id',type:'uuid'}) patientId!:string; @ManyToOne(()=>Patient,{onDelete:'RESTRICT'}) @JoinColumn({name:'patient_id'}) patient!:Patient;
 @Column({name:'user_id',type:'uuid'}) userId!:string; @ManyToOne(()=>User,{onDelete:'RESTRICT'}) @JoinColumn({name:'user_id'}) user!:User;
 @Column({type:'char',length:3}) currency!:string;
 @Column({name:'standard_price_minor_snapshot',type:'bigint'}) standardPriceMinorSnapshot!:string;
 @Column({name:'promotional_price_minor_snapshot',type:'bigint',nullable:true}) promotionalPriceMinorSnapshot!:string|null;
 @Column({name:'effective_price_minor',type:'bigint'}) effectivePriceMinor!:string;
 @Column({name:'promotion_applied',type:'boolean'}) promotionApplied!:boolean;
 @Column({name:'funding_status',type:'enum',enum:GuidedSelfCheckFundingStatus,enumName:'guided_self_check_funding_status_enum'}) fundingStatus!:GuidedSelfCheckFundingStatus;
 @Column({name:'workflow_status',type:'enum',enum:GuidedSelfCheckWorkflowStatus,enumName:'guided_self_check_workflow_status_enum'}) workflowStatus!:GuidedSelfCheckWorkflowStatus;
 @Column({name:'paid_at',type:'timestamptz',nullable:true}) paidAt!:Date|null;
 @Column({name:'questionnaire_version_id',type:'uuid',nullable:true}) questionnaireVersionId!:string|null;
 @ManyToOne(()=>GuidedSelfCheckQuestionnaireVersion,{nullable:true,onDelete:'RESTRICT'}) @JoinColumn({name:'questionnaire_version_id'}) questionnaireVersion!:GuidedSelfCheckQuestionnaireVersion|null;
 @Column({name:'started_at',type:'timestamptz',nullable:true}) startedAt!:Date|null;
 @Column({name:'completed_at',type:'timestamptz',nullable:true}) completedAt!:Date|null;
 @Column({name:'classification_status',type:'enum',enum:GuidedSelfCheckClassificationStatus,enumName:'guided_self_check_classification_status_enum',default:GuidedSelfCheckClassificationStatus.PENDING}) classificationStatus!:GuidedSelfCheckClassificationStatus;
 @Column({name:'classification_last_attempt_at',type:'timestamptz',nullable:true}) classificationLastAttemptAt!:Date|null;
 @Column({name:'classification_failure_code',type:'varchar',length:60,nullable:true}) classificationFailureCode!:string|null;
 @Column({name:'classification_retry_count',type:'integer',default:0}) classificationRetryCount!:number;
 @CreateDateColumn({name:'created_at',type:'timestamptz'}) createdAt!:Date; @UpdateDateColumn({name:'updated_at',type:'timestamptz'}) updatedAt!:Date;
 @OneToMany(()=>GuidedSelfCheckHistory,h=>h.selfCheck) history!:GuidedSelfCheckHistory[];
}
