import { Column,CreateDateColumn,Entity,Index,JoinColumn,ManyToOne,PrimaryGeneratedColumn,Unique,UpdateDateColumn } from 'typeorm';
import { Provider } from './provider.entity';import { ProviderLocation } from './provider-location.entity';
export enum ProviderPracticeAffiliationType{HEALTH_STATION='HEALTH_STATION',HOSPITAL='HOSPITAL',CLINIC='CLINIC'}
export enum ProviderPracticeAffiliationStatus{PENDING='PENDING',APPROVED='APPROVED',REJECTED='REJECTED'}
@Entity('provider_practice_affiliations')
@Unique('UQ_provider_practice_affiliations_doctor_location',['doctorProviderId','hostLocationId'])
@Index('IDX_provider_practice_affiliations_doctor_active',['doctorProviderId','isActive','isDefault'])
export class ProviderPracticeAffiliation{
 @PrimaryGeneratedColumn('uuid') id!:string;
 @Column({name:'doctor_provider_id',type:'uuid'}) doctorProviderId!:string;
 @ManyToOne(()=>Provider,{onDelete:'CASCADE'}) @JoinColumn({name:'doctor_provider_id'}) doctorProvider!:Provider;
 @Column({name:'host_provider_id',type:'uuid'}) hostProviderId!:string;
 @ManyToOne(()=>Provider,{onDelete:'CASCADE'}) @JoinColumn({name:'host_provider_id'}) hostProvider!:Provider;
 @Column({name:'host_location_id',type:'uuid'}) hostLocationId!:string;
 @ManyToOne(()=>ProviderLocation,{onDelete:'CASCADE'}) @JoinColumn({name:'host_location_id'}) hostLocation!:ProviderLocation;
 @Column({name:'affiliation_type',type:'enum',enum:ProviderPracticeAffiliationType,enumName:'provider_practice_affiliation_type_enum'}) affiliationType!:ProviderPracticeAffiliationType;
 @Column({name:'status',type:'enum',enum:ProviderPracticeAffiliationStatus,enumName:'provider_practice_affiliation_status_enum',default:ProviderPracticeAffiliationStatus.PENDING}) status!:ProviderPracticeAffiliationStatus;
 @Column({name:'reviewed_at',type:'timestamptz',nullable:true}) reviewedAt!:Date|null;
 @Column({name:'reviewed_by_user_id',type:'uuid',nullable:true}) reviewedByUserId!:string|null;
 @Column({name:'is_default',type:'boolean',default:false}) isDefault!:boolean;
 @Column({name:'is_active',type:'boolean',default:true}) isActive!:boolean;
 @Column({name:'allows_virtual_care',type:'boolean',default:false}) allowsVirtualCare!:boolean;
 @Column({name:'virtual_care_price_minor',type:'bigint',nullable:true}) virtualCarePriceMinor!:string|null;
 @Column({name:'virtual_care_currency',type:'char',length:3,nullable:true}) virtualCareCurrency!:string|null;
 @CreateDateColumn({name:'created_at',type:'timestamptz'}) createdAt!:Date;
 @UpdateDateColumn({name:'updated_at',type:'timestamptz'}) updatedAt!:Date;
}
