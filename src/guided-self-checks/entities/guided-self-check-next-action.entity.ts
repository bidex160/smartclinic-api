import { Column,CreateDateColumn,Entity,Index,JoinColumn,ManyToOne,PrimaryGeneratedColumn } from 'typeorm';
import { GuidedSelfCheckClassificationResult } from './guided-self-check-classification.entity';import { GuidedSelfCheckProfessionalReview } from './guided-self-check-professional-review.entity';import { GuidedSelfCheck } from './guided-self-check.entity';import { GuidedSelfCheckNextActionSource,GuidedSelfCheckNextActionType } from '../enums/guided-self-check-next-action.enum';
@Entity('guided_self_check_next_actions')@Index('UQ_gsc_next_action_current',['guidedSelfCheckId'],{unique:true,where:'"is_current" = true'})@Index('IDX_gsc_next_action_history',['guidedSelfCheckId','selectedAt'])
export class GuidedSelfCheckNextAction{
 @PrimaryGeneratedColumn('uuid')id!:string;
 @Column({name:'guided_self_check_id',type:'uuid'})guidedSelfCheckId!:string;@ManyToOne(()=>GuidedSelfCheck,{onDelete:'RESTRICT'})@JoinColumn({name:'guided_self_check_id'})selfCheck!:GuidedSelfCheck;
 @Column({name:'classification_id',type:'uuid'})classificationId!:string;@ManyToOne(()=>GuidedSelfCheckClassificationResult,{onDelete:'RESTRICT'})@JoinColumn({name:'classification_id'})classification!:GuidedSelfCheckClassificationResult;
 @Column({name:'professional_review_id',type:'uuid',nullable:true})professionalReviewId!:string|null;@ManyToOne(()=>GuidedSelfCheckProfessionalReview,{nullable:true,onDelete:'RESTRICT'})@JoinColumn({name:'professional_review_id'})professionalReview!:GuidedSelfCheckProfessionalReview|null;
 @Column({type:'enum',enum:GuidedSelfCheckNextActionType,enumName:'guided_self_check_next_action_type_enum'})type!:GuidedSelfCheckNextActionType;
 @Column({type:'enum',enum:GuidedSelfCheckNextActionSource,enumName:'guided_self_check_next_action_source_enum'})source!:GuidedSelfCheckNextActionSource;
 @Column({name:'target_metadata',type:'jsonb',default:()=>"'{}'::jsonb"})targetMetadata!:Record<string,string>;
 @Column({name:'is_current',type:'boolean',default:true})isCurrent!:boolean;
 @Column({name:'selected_by_user_id',type:'uuid',nullable:true})selectedByUserId!:string|null;
 @Column({name:'selected_at',type:'timestamptz'})selectedAt!:Date;
 @CreateDateColumn({name:'created_at',type:'timestamptz'})createdAt!:Date;
}
