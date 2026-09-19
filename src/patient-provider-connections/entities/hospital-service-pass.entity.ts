import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Patient } from '../../patients/entities/patient.entity';
import { Provider } from '../../providers/entities/provider.entity';
import { PatientProviderConnection } from './patient-provider-connection.entity';

export enum HospitalServicePassStatus { VALID='VALID', PARTIALLY_USED='PARTIALLY_USED', USED='USED', VOID='VOID' }

@Entity('hospital_service_passes')
@Index('UQ_hospital_service_passes_reference',['reference'],{unique:true})
@Index('IDX_hospital_service_passes_provider_status',['providerId','status'])
@Check('CHK_hospital_service_passes_amount','"amount_minor">=0')
export class HospitalServicePass {
 @PrimaryGeneratedColumn('uuid') id!:string;
 @Column({type:'varchar',length:32}) reference!:string;
 @Column({name:'connection_id',type:'uuid'}) connectionId!:string;
 @ManyToOne(()=>PatientProviderConnection,{onDelete:'RESTRICT'}) @JoinColumn({name:'connection_id'}) connection!:PatientProviderConnection;
 @Column({name:'patient_id',type:'uuid'}) patientId!:string;
 @ManyToOne(()=>Patient,{onDelete:'RESTRICT'}) @JoinColumn({name:'patient_id'}) patient!:Patient;
 @Column({name:'provider_id',type:'uuid'}) providerId!:string;
 @ManyToOne(()=>Provider,{onDelete:'RESTRICT'}) @JoinColumn({name:'provider_id'}) provider!:Provider;
 @Column({name:'amount_minor',type:'bigint'}) amountMinor!:string;
 @Column({type:'char',length:3}) currency!:string;
 @Column({type:'enum',enum:HospitalServicePassStatus,enumName:'hospital_service_pass_status_enum'}) status!:HospitalServicePassStatus;
 @Column({name:'covered_services',type:'jsonb'}) coveredServices!:Array<{orderReference:string;fulfillmentReference:string|null;amountMinor:number|null}>;
 @Column({name:'verification_token_hash',type:'varchar',length:64}) verificationTokenHash!:string;
 @Column({name:'paid_at',type:'timestamptz'}) paidAt!:Date;
 @Column({name:'expires_at',type:'timestamptz',nullable:true}) expiresAt!:Date|null;
 @Column({name:'last_verified_at',type:'timestamptz',nullable:true}) lastVerifiedAt!:Date|null;
 @CreateDateColumn({name:'created_at',type:'timestamptz'}) createdAt!:Date;
 @UpdateDateColumn({name:'updated_at',type:'timestamptz'}) updatedAt!:Date;
}