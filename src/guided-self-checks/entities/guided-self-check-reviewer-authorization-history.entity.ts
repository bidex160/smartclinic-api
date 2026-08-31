import { Column,CreateDateColumn,Entity,Index,JoinColumn,ManyToOne,PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { GuidedSelfCheckReviewerAuthorizationEvent,GuidedSelfCheckReviewerAuthorizationStatus } from '../enums/guided-self-check-reviewer-authorization.enum';
import { GuidedSelfCheckReviewerAuthorization } from './guided-self-check-reviewer-authorization.entity';
@Entity('guided_self_check_reviewer_authorization_history')@Index('IDX_gsc_reviewer_authorization_history',['authorizationId','createdAt'])
export class GuidedSelfCheckReviewerAuthorizationHistory{
 @PrimaryGeneratedColumn('uuid')id!:string;
 @Column({name:'authorization_id',type:'uuid'})authorizationId!:string;
 @ManyToOne(()=>GuidedSelfCheckReviewerAuthorization,a=>a.history,{onDelete:'RESTRICT'})@JoinColumn({name:'authorization_id'})authorization!:GuidedSelfCheckReviewerAuthorization;
 @Column({type:'enum',enum:GuidedSelfCheckReviewerAuthorizationEvent,enumName:'guided_self_check_reviewer_authorization_event_enum'})event!:GuidedSelfCheckReviewerAuthorizationEvent;
 @Column({name:'actor_user_id',type:'uuid'})actorUserId!:string;
 @ManyToOne(()=>User,{onDelete:'RESTRICT'})@JoinColumn({name:'actor_user_id'})actor!:User;
 @Column({name:'from_status',type:'enum',enum:GuidedSelfCheckReviewerAuthorizationStatus,enumName:'guided_self_check_reviewer_authorization_status_enum',nullable:true})fromStatus!:GuidedSelfCheckReviewerAuthorizationStatus|null;
 @Column({name:'to_status',type:'enum',enum:GuidedSelfCheckReviewerAuthorizationStatus,enumName:'guided_self_check_reviewer_authorization_status_enum'})toStatus!:GuidedSelfCheckReviewerAuthorizationStatus;
 @Column({type:'varchar',length:500,nullable:true})reason!:string|null;
 @CreateDateColumn({name:'created_at',type:'timestamptz'})createdAt!:Date;
}
