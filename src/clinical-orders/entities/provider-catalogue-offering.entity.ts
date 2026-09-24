import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Provider } from '../../providers/entities/provider.entity';
import { ProviderServiceUnit } from '../../provider-service-units/entities/provider-service-unit.entity';
import { SmartClinicServiceCatalogueItem } from './smartclinic-service-catalogue-item.entity';

@Entity('provider_catalogue_offerings')
@Index('UQ_provider_catalogue_offerings_unit_item',['providerServiceUnitId','catalogueItemId'],{unique:true})
@Index('IDX_provider_catalogue_offerings_item_active',['catalogueItemId','isActive'])
@Check('CHK_provider_catalogue_offerings_price','"price_override_minor" IS NULL OR "price_override_minor" >= 0')
export class ProviderCatalogueOffering{
 @PrimaryGeneratedColumn('uuid')id!:string;
 @Column({name:'provider_id',type:'uuid'})providerId!:string;
 @ManyToOne(()=>Provider,{onDelete:'CASCADE'})@JoinColumn({name:'provider_id'})provider!:Provider;
 @Column({name:'provider_service_unit_id',type:'uuid'})providerServiceUnitId!:string;
 @ManyToOne(()=>ProviderServiceUnit,{onDelete:'CASCADE'})@JoinColumn({name:'provider_service_unit_id'})providerServiceUnit!:ProviderServiceUnit;
 @Column({name:'catalogue_item_id',type:'uuid'})catalogueItemId!:string;
 @ManyToOne(()=>SmartClinicServiceCatalogueItem,{onDelete:'CASCADE'})@JoinColumn({name:'catalogue_item_id'})catalogueItem!:SmartClinicServiceCatalogueItem;
 @Column({name:'is_active',type:'boolean',default:true})isActive!:boolean;
 @Column({name:'price_override_minor',type:'bigint',nullable:true})priceOverrideMinor!:string|null;
 @CreateDateColumn({name:'created_at',type:'timestamptz'})createdAt!:Date;
 @UpdateDateColumn({name:'updated_at',type:'timestamptz'})updatedAt!:Date;
}
