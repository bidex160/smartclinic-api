import { Check, Column, CreateDateColumn, Entity, Exclusion, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { FulfilmentMode } from './fulfilment-mode.entity';
import { HealthCheckPackage } from './health-check-package.entity';

@Entity('package_prices')
@Index('IDX_package_prices_active_effective_from', ['healthCheckPackageId', 'fulfilmentModeId', 'currency', 'effectiveFrom'], {
  where: '"is_active" = true',
})
@Check('CHK_package_prices_amount_positive', '"amount" > 0')
@Check('CHK_package_prices_currency_format', '"currency" ~ \'^[A-Z]{3}$\'')
@Check(
  'CHK_package_prices_effective_range',
  '"effective_to" IS NULL OR "effective_to" > "effective_from"',
)
@Exclusion(
  'EX_package_prices_active_effective_range',
  'USING gist ("health_check_package_id" WITH =, "fulfilment_mode_id" WITH =, "currency" WITH =, daterange("effective_from", "effective_to", \'[)\') WITH &&) WHERE ("is_active")',
)
export class PackagePrice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'health_check_package_id', type: 'uuid' })
  healthCheckPackageId!: string;

  @ManyToOne(() => HealthCheckPackage, (healthCheckPackage) => healthCheckPackage.packagePrices, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'health_check_package_id' })
  healthCheckPackage!: HealthCheckPackage;

  @Column({ name: 'fulfilment_mode_id', type: 'uuid' })
  fulfilmentModeId!: string;

  @ManyToOne(() => FulfilmentMode, (fulfilmentMode) => fulfilmentMode.packagePrices, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'fulfilment_mode_id' })
  fulfilmentMode!: FulfilmentMode;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount!: string;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom!: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
