import { Column,CreateDateColumn,DeleteDateColumn,Entity,Index,JoinColumn,ManyToOne,PrimaryGeneratedColumn,Unique,UpdateDateColumn } from 'typeorm';
import { ProviderLocation } from '../../providers/entities/provider-location.entity';
import { Provider } from '../../providers/entities/provider.entity';
import { ProviderServiceUnitStatus } from '../enums/provider-service-unit-status.enum';
import { ProviderServiceUnitType } from '../enums/provider-service-unit-type.enum';
@Entity('provider_service_units')
@Unique('UQ_provider_service_units_id_provider',['id','providerId'])
@Index('UQ_provider_service_units_reference',['reference'],{unique:true})
@Index('IDX_provider_service_units_provider_status',['providerId','status'])
@Index('UQ_provider_service_units_code_provider',['providerId','code'],{unique:true,where:'"deleted_at" IS NULL'})
export class ProviderServiceUnit {
  @PrimaryGeneratedColumn('uuid') id!:string;
  @Column({type:'varchar',length:32}) reference!:string;
  @Column({name:'provider_id',type:'uuid'}) providerId!:string;
  @ManyToOne(()=>Provider,{onDelete:'RESTRICT'}) @JoinColumn({name:'provider_id'}) provider!:Provider;
  @Column({type:'varchar',length:80}) code!:string;
  @Column({type:'varchar',length:160}) name!:string;
  @Column({type:'enum',enum:ProviderServiceUnitType,enumName:'provider_service_unit_type_enum'}) type!:ProviderServiceUnitType;
  @Column({type:'text',nullable:true}) description!:string|null;
  @Column({type:'enum',enum:ProviderServiceUnitStatus,enumName:'provider_service_unit_status_enum'}) status!:ProviderServiceUnitStatus;
  @Column({name:'provider_location_id',type:'uuid',nullable:true}) providerLocationId!:string|null;
  @ManyToOne(()=>ProviderLocation,{nullable:true,onDelete:'RESTRICT'}) @JoinColumn({name:'provider_location_id'}) providerLocation!:ProviderLocation|null;
  @CreateDateColumn({name:'created_at',type:'timestamptz'}) createdAt!:Date;
  @UpdateDateColumn({name:'updated_at',type:'timestamptz'}) updatedAt!:Date;
  @DeleteDateColumn({name:'deleted_at',type:'timestamptz',nullable:true}) deletedAt!:Date|null;
}
