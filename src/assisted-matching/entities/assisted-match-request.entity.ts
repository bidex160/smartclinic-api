import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';import { Patient } from '../../patients/entities/patient.entity';import { Provider } from '../../providers/entities/provider.entity';
export enum AssistedMatchStatus { SEARCHING='SEARCHING', AGENT_REVIEW='AGENT_REVIEW', MATCHED='MATCHED', CANCELLED='CANCELLED', EXPIRED='EXPIRED' }
export enum AssistedMatchContact { NOTIFY='NOTIFY', CALL='CALL', WHATSAPP='WHATSAPP' }
@Entity('assisted_match_requests') @Index('IDX_assisted_match_queue',['status','agentReviewAt','createdAt']) @Index('IDX_assisted_match_user',['userId','createdAt'])
export class AssistedMatchRequest {
 @PrimaryGeneratedColumn('uuid') id!:string; @Column({type:'varchar',length:32,unique:true}) reference!:string;
 @Column({name:'user_id',type:'uuid'}) userId!:string; @ManyToOne(()=>User,{onDelete:'CASCADE'})@JoinColumn({name:'user_id'}) user!:User;
 @Column({name:'patient_id',type:'uuid',nullable:true}) patientId!:string|null; @ManyToOne(()=>Patient,{nullable:true,onDelete:'SET NULL'})@JoinColumn({name:'patient_id'}) patient!:Patient|null;
 @Column({name:'service_kind',type:'varchar',length:40}) serviceKind!:string; @Column({name:'package_code',type:'varchar',length:80,nullable:true}) packageCode!:string|null;
 @Column({name:'fulfilment_mode_code',type:'varchar',length:80,nullable:true}) fulfilmentModeCode!:string|null; @Column({name:'preferred_date',type:'date',nullable:true}) preferredDate!:string|null;
 @Column({name:'preferred_time',type:'time',nullable:true}) preferredTime!:string|null; @Column({name:'preferred_timezone',type:'varchar',length:80,nullable:true}) preferredTimezone!:string|null;
 @Column({name:'country_code',type:'char',length:2,nullable:true}) countryCode!:string|null; @Column({name:'state_or_region',type:'varchar',length:120,nullable:true}) stateOrRegion!:string|null;
 @Column({type:'varchar',length:120,nullable:true}) city!:string|null; @Column({name:'postal_code',type:'varchar',length:30,nullable:true}) postalCode!:string|null;
 @Column({type:'decimal',precision:9,scale:6,nullable:true}) latitude!:string|null; @Column({type:'decimal',precision:9,scale:6,nullable:true}) longitude!:string|null;
 @Column({name:'contact_preference',type:'enum',enum:AssistedMatchContact,enumName:'assisted_match_contact_enum',default:AssistedMatchContact.NOTIFY}) contactPreference!:AssistedMatchContact;
 @Column({type:'enum',enum:AssistedMatchStatus,enumName:'assisted_match_status_enum',default:AssistedMatchStatus.SEARCHING}) status!:AssistedMatchStatus;
 @Column({name:'search_expands_at',type:'timestamptz'}) searchExpandsAt!:Date; @Column({name:'agent_review_at',type:'timestamptz'}) agentReviewAt!:Date;
 @Column({name:'matched_provider_id',type:'uuid',nullable:true}) matchedProviderId!:string|null; @ManyToOne(()=>Provider,{nullable:true,onDelete:'SET NULL'})@JoinColumn({name:'matched_provider_id'}) matchedProvider!:Provider|null;
 @Column({name:'matched_provider_service_id',type:'uuid',nullable:true}) matchedProviderServiceId!:string|null; @Column({name:'quoted_travel_fee_minor',type:'bigint',nullable:true}) quotedTravelFeeMinor!:string|null; @Column({name:'matched_at',type:'timestamptz',nullable:true}) matchedAt!:Date|null;
 @Column({type:'text',nullable:true}) notes!:string|null; @CreateDateColumn({name:'created_at',type:'timestamptz'}) createdAt!:Date; @UpdateDateColumn({name:'updated_at',type:'timestamptz'}) updatedAt!:Date;
}