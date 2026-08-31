import { BeforeInsert, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { User } from '../../users/entities/user.entity';
import { GuidedSelfCheck } from './guided-self-check.entity';
import { GuidedSelfCheckNextAction } from './guided-self-check-next-action.entity';
import { GuidedSelfCheckProfessionalReview } from './guided-self-check-professional-review.entity';
import { GuidedSelfCheckReviewPriority } from '../enums/guided-self-check-review.enum';
import { GuidedSelfCheckContactWorkItemOutcome, GuidedSelfCheckContactWorkItemStatus } from '../enums/guided-self-check-contact-work-item.enum';

@Entity('guided_self_check_contact_work_items')
@Index('UQ_gsc_contact_work_reference',['reference'],{unique:true})
@Index('UQ_gsc_contact_work_next_action',['nextActionId'],{unique:true})
@Index('UQ_gsc_contact_work_active_check',['guidedSelfCheckId'],{unique:true,where:'"status" NOT IN (\'COMPLETED\',\'CANCELLED\')'})
@Index('IDX_gsc_contact_work_queue',['status','priority','createdAt','id'])
export class GuidedSelfCheckContactWorkItem {
 @PrimaryGeneratedColumn('uuid') id!:string;
 @Column({type:'varchar',length:40}) reference!:string;
 @BeforeInsert() makeReference(){if(!this.reference)this.reference=`SC-GCW-${randomBytes(6).toString('hex').toUpperCase()}`;}
 @Column({name:'guided_self_check_id',type:'uuid'}) guidedSelfCheckId!:string;
 @ManyToOne(()=>GuidedSelfCheck,{onDelete:'RESTRICT'})@JoinColumn({name:'guided_self_check_id'}) selfCheck!:GuidedSelfCheck;
 @Column({name:'next_action_id',type:'uuid'}) nextActionId!:string;
 @ManyToOne(()=>GuidedSelfCheckNextAction,{onDelete:'RESTRICT'})@JoinColumn({name:'next_action_id'}) nextAction!:GuidedSelfCheckNextAction;
 @Column({name:'professional_review_id',type:'uuid',nullable:true}) professionalReviewId!:string|null;
 @ManyToOne(()=>GuidedSelfCheckProfessionalReview,{nullable:true,onDelete:'RESTRICT'})@JoinColumn({name:'professional_review_id'}) professionalReview!:GuidedSelfCheckProfessionalReview|null;
 @Column({type:'enum',enum:GuidedSelfCheckContactWorkItemStatus,enumName:'gsc_contact_work_item_status_enum'}) status!:GuidedSelfCheckContactWorkItemStatus;
 @Column({type:'enum',enum:GuidedSelfCheckReviewPriority,enumName:'guided_self_check_review_priority_enum'}) priority!:GuidedSelfCheckReviewPriority;
 @Column({name:'acknowledged_by_user_id',type:'uuid',nullable:true}) acknowledgedByUserId!:string|null;
 @ManyToOne(()=>User,{nullable:true,onDelete:'RESTRICT'})@JoinColumn({name:'acknowledged_by_user_id'}) acknowledgedByUser!:User|null;
 @Column({name:'acknowledged_at',type:'timestamptz',nullable:true}) acknowledgedAt!:Date|null;
 @Column({name:'started_by_user_id',type:'uuid',nullable:true}) startedByUserId!:string|null;
 @ManyToOne(()=>User,{nullable:true,onDelete:'RESTRICT'})@JoinColumn({name:'started_by_user_id'}) startedByUser!:User|null;
 @Column({name:'started_at',type:'timestamptz',nullable:true}) startedAt!:Date|null;
 @Column({name:'completed_by_user_id',type:'uuid',nullable:true}) completedByUserId!:string|null;
 @ManyToOne(()=>User,{nullable:true,onDelete:'RESTRICT'})@JoinColumn({name:'completed_by_user_id'}) completedByUser!:User|null;
 @Column({name:'completed_at',type:'timestamptz',nullable:true}) completedAt!:Date|null;
 @Column({type:'enum',enum:GuidedSelfCheckContactWorkItemOutcome,enumName:'gsc_contact_work_item_outcome_enum',nullable:true}) outcome!:GuidedSelfCheckContactWorkItemOutcome|null;
 @Column({name:'operational_note',type:'varchar',length:1000,nullable:true}) operationalNote!:string|null;
 @CreateDateColumn({name:'created_at',type:'timestamptz'}) createdAt!:Date;
 @UpdateDateColumn({name:'updated_at',type:'timestamptz'}) updatedAt!:Date;
}
