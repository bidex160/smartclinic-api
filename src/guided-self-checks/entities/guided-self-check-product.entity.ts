import { Check,Column,CreateDateColumn,Entity,PrimaryGeneratedColumn,UpdateDateColumn } from 'typeorm';
@Entity('guided_self_check_products')
@Check('CHK_gsc_product_money','"standard_price_minor" >= 0 AND ("promotional_price_minor" IS NULL OR ("promotional_price_minor" >= 0 AND "promotional_price_minor" <= "standard_price_minor"))')
@Check('CHK_gsc_product_currency','"currency" ~ \'^[A-Z]{3}$\'')
@Check('CHK_gsc_product_promotion_dates','"promotion_starts_at" IS NULL OR "promotion_ends_at" IS NULL OR "promotion_starts_at" < "promotion_ends_at"')
export class GuidedSelfCheckProduct {
 @PrimaryGeneratedColumn('uuid') id!:string;
 @Column({type:'varchar',length:40,unique:true,default:'GUIDED_SELF_CHECK'}) code!:string;
 @Column({type:'varchar',length:160}) name!:string;
 @Column({type:'char',length:3}) currency!:string;
 @Column({name:'standard_price_minor',type:'bigint'}) standardPriceMinor!:string;
 @Column({name:'promotional_price_minor',type:'bigint',nullable:true}) promotionalPriceMinor!:string|null;
 @Column({name:'promotion_starts_at',type:'timestamptz',nullable:true}) promotionStartsAt!:Date|null;
 @Column({name:'promotion_ends_at',type:'timestamptz',nullable:true}) promotionEndsAt!:Date|null;
 @Column({name:'is_active',type:'boolean',default:true}) isActive!:boolean;
 @CreateDateColumn({name:'created_at',type:'timestamptz'}) createdAt!:Date;
 @UpdateDateColumn({name:'updated_at',type:'timestamptz'}) updatedAt!:Date;
}

