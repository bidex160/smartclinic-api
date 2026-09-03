import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { HealthCheckClinicalContent } from './health-check-clinical-content.entity';
import { HealthCheckPackage } from './health-check-package.entity';

@Entity('health_check_package_addons')
@Index('UQ_health_check_package_addon', ['healthCheckPackageId', 'clinicalContentId'], { unique: true })
export class HealthCheckPackageAddon {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'health_check_package_id', type: 'uuid' }) healthCheckPackageId!: string;
  @ManyToOne(() => HealthCheckPackage, (value) => value.addonAvailability, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'health_check_package_id' }) healthCheckPackage!: HealthCheckPackage;
  @Column({ name: 'clinical_content_id', type: 'uuid' }) clinicalContentId!: string;
  @ManyToOne(() => HealthCheckClinicalContent, (value) => value.packageAddonEligibility, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'clinical_content_id' })
  clinicalContent!: HealthCheckClinicalContent;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive!: boolean;
}
