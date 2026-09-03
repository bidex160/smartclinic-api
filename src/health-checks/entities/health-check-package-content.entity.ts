import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { HealthCheckPackage } from './health-check-package.entity';
import { HealthCheckClinicalContent } from './health-check-clinical-content.entity';

@Entity('health_check_package_contents')
@Index('UQ_health_check_package_content', ['healthCheckPackageId', 'clinicalContentId'], { unique: true })
@Index('UQ_health_check_package_content_order', ['healthCheckPackageId', 'sortOrder'], { unique: true })
export class HealthCheckPackageContent {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'health_check_package_id', type: 'uuid' }) healthCheckPackageId!: string;
  @ManyToOne(() => HealthCheckPackage, (value) => value.contents, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'health_check_package_id' }) healthCheckPackage!: HealthCheckPackage;
  @Column({ name: 'clinical_content_id', type: 'uuid' }) clinicalContentId!: string;
  @ManyToOne(() => HealthCheckClinicalContent, (value) => value.packageContents, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'clinical_content_id' })
  clinicalContent!: HealthCheckClinicalContent;
  @Column({ name: 'sort_order', type: 'smallint' }) sortOrder!: number;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
