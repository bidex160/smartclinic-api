import { Column,CreateDateColumn,Entity,Index,JoinColumn,ManyToOne,PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { GuidedSelfCheckReviewEvent,GuidedSelfCheckReviewStatus } from '../enums/guided-self-check-review.enum';
import { GuidedSelfCheckProfessionalReview } from './guided-self-check-professional-review.entity';
@Entity('guided_self_check_professional_review_history') @Index('IDX_gsc_review_history',['reviewId','createdAt'])
export class GuidedSelfCheckProfessionalReviewHistory{
 @PrimaryGeneratedColumn('uuid')id!:string;
 @Column({name:'review_id',type:'uuid'})reviewId!:string;
 @ManyToOne(()=>GuidedSelfCheckProfessionalReview,r=>r.history,{onDelete:'RESTRICT'})@JoinColumn({name:'review_id'})review!:GuidedSelfCheckProfessionalReview;
 @Column({type:'enum',enum:GuidedSelfCheckReviewEvent,enumName:'guided_self_check_review_event_enum'})event!:GuidedSelfCheckReviewEvent;
 @Column({name:'actor_user_id',type:'uuid',nullable:true})actorUserId!:string|null;
 @ManyToOne(()=>User,{nullable:true,onDelete:'RESTRICT'})@JoinColumn({name:'actor_user_id'})actor!:User|null;
 @Column({name:'from_status',type:'enum',enum:GuidedSelfCheckReviewStatus,enumName:'guided_self_check_review_status_enum',nullable:true})fromStatus!:GuidedSelfCheckReviewStatus|null;
 @Column({name:'to_status',type:'enum',enum:GuidedSelfCheckReviewStatus,enumName:'guided_self_check_review_status_enum',nullable:true})toStatus!:GuidedSelfCheckReviewStatus|null;
 @Column({type:'jsonb',default:()=>"'{}'::jsonb"})metadata!:Record<string,unknown>;
 @CreateDateColumn({name:'created_at',type:'timestamptz'})createdAt!:Date;
}
