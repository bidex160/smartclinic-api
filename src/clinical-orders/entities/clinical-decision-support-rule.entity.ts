import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('clinical_decision_support_rules')
@Index('UQ_clinical_decision_support_rules_code',['code'],{unique:true})
@Index('IDX_clinical_decision_support_rules_active',['isActive','sortOrder'])
export class ClinicalDecisionSupportRule {
  @PrimaryGeneratedColumn('uuid') id!:string;
  @Column({type:'varchar',length:80}) code!:string;
  @Column({name:'diagnosis_name',type:'varchar',length:200}) diagnosisName!:string;
  @Column({type:'text',array:true,default:()=>"'{}'"}) synonyms!:string[];
  @Column({name:'symptom_terms',type:'text',array:true,default:()=>"'{}'"}) symptomTerms!:string[];
  @Column({name:'red_flag_terms',type:'text',array:true,default:()=>"'{}'"}) redFlagTerms!:string[];
  @Column({name:'suggested_lab_codes',type:'text',array:true,default:()=>"'{}'"}) suggestedLabCodes!:string[];
  @Column({name:'suggested_imaging_codes',type:'text',array:true,default:()=>"'{}'"}) suggestedImagingCodes!:string[];
  @Column({name:'suggested_medication_codes',type:'text',array:true,default:()=>"'{}'"}) suggestedMedicationCodes!:string[];
  @Column({name:'suggested_referrals',type:'text',array:true,default:()=>"'{}'"}) suggestedReferrals!:string[];
  @Column({name:'clinical_note',type:'text',nullable:true}) clinicalNote!:string|null;
  @Column({name:'is_active',type:'boolean',default:true}) isActive!:boolean;
  @Column({name:'sort_order',type:'smallint',default:0}) sortOrder!:number;
  @CreateDateColumn({name:'created_at',type:'timestamptz'}) createdAt!:Date;
  @UpdateDateColumn({name:'updated_at',type:'timestamptz'}) updatedAt!:Date;
}
