import { BeforeInsert,Column,CreateDateColumn,Entity,Index,JoinColumn,ManyToOne,PrimaryGeneratedColumn,UpdateDateColumn } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { User } from '../../users/entities/user.entity';
import { GuidedSelfCheckClinicalRule,GuidedSelfCheckPatientMessageKey,GuidedSelfCheckRulesetGovernanceStatus } from '../enums/guided-self-check-classification.enum';
import { GuidedSelfCheckQuestionnaireVersion } from './guided-self-check-questionnaire-version.entity';
@Entity('guided_self_check_clinical_rulesets')
@Index('UQ_gsc_ruleset_reference',['reference'],{unique:true})
@Index('UQ_gsc_ruleset_version',['version'],{unique:true})
@Index('UQ_gsc_ruleset_active_compatible',['questionnaireVersionId','isActive'],{unique:true,where:'"is_active" = true'})
export class GuidedSelfCheckClinicalRuleset{
 @PrimaryGeneratedColumn('uuid')id!:string;
 @Column({type:'varchar',length:40})reference!:string;
 @BeforeInsert()makeReference(){if(!this.reference)this.reference=`SC-GCRS-${randomBytes(6).toString('hex').toUpperCase()}`;}
 @Column({type:'integer'})version!:number;
 @Column({type:'varchar',length:140})name!:string;
 @Column({type:'text',nullable:true})description!:string|null;
 @Column({name:'questionnaire_version_id',type:'uuid'})questionnaireVersionId!:string;
 @ManyToOne(()=>GuidedSelfCheckQuestionnaireVersion,{onDelete:'RESTRICT'})@JoinColumn({name:'questionnaire_version_id'})questionnaireVersion!:GuidedSelfCheckQuestionnaireVersion;
 @Column({name:'is_active',type:'boolean',default:false})isActive!:boolean;
 @Column({name:'governance_status',type:'enum',enum:GuidedSelfCheckRulesetGovernanceStatus,enumName:'guided_self_check_ruleset_governance_status_enum',default:GuidedSelfCheckRulesetGovernanceStatus.DRAFT})governanceStatus!:GuidedSelfCheckRulesetGovernanceStatus;
 @Column({type:'jsonb'})rules!:GuidedSelfCheckClinicalRule[];
 @Column({name:'patient_message_keys',type:'jsonb'})patientMessageKeys!:Record<string,GuidedSelfCheckPatientMessageKey>;
 @Column({name:'content_hash',type:'varchar',length:64})contentHash!:string;
 @Column({name:'approved_content_hash',type:'varchar',length:64,nullable:true})approvedContentHash!:string|null;
 @Column({name:'approved_by_user_id',type:'uuid',nullable:true})approvedByUserId!:string|null;
 @ManyToOne(()=>User,{onDelete:'RESTRICT',nullable:true})@JoinColumn({name:'approved_by_user_id'})approvedBy!:User|null;
 @Column({name:'approved_at',type:'timestamptz',nullable:true})approvedAt!:Date|null;
 @Column({name:'activated_at',type:'timestamptz',nullable:true})activatedAt!:Date|null;
 @Column({name:'retired_at',type:'timestamptz',nullable:true})retiredAt!:Date|null;
 @CreateDateColumn({name:'created_at',type:'timestamptz'})createdAt!:Date;
 @UpdateDateColumn({name:'updated_at',type:'timestamptz'})updatedAt!:Date;
}
