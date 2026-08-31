import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { HealthCheckAddon } from './health-check-addon.entity';
import { HealthCheckPackage } from './health-check-package.entity';

@Entity('health_check_package_addons')
@Index('UQ_health_check_package_addon', ['healthCheckPackageId', 'addonId'], { unique: true })
export class HealthCheckPackageAddon {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'health_check_package_id', type: 'uuid' }) healthCheckPackageId!: string;
  @ManyToOne(() => HealthCheckPackage, (value) => value.addonAvailability, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'health_check_package_id' }) healthCheckPackage!: HealthCheckPackage;
  @Column({ name: 'addon_id', type: 'uuid' }) addonId!: string;
  @ManyToOne(() => HealthCheckAddon, (value) => value.packageAvailability, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'addon_id' }) addon!: HealthCheckAddon;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive!: boolean;
}
