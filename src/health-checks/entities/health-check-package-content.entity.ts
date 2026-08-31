import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { HealthCheckPackage } from './health-check-package.entity';

@Entity('health_check_package_contents')
@Index('UQ_health_check_package_content_code', ['healthCheckPackageId', 'code'], { unique: true })
@Index('UQ_health_check_package_content_order', ['healthCheckPackageId', 'sortOrder'], { unique: true })
export class HealthCheckPackageContent {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'health_check_package_id', type: 'uuid' }) healthCheckPackageId!: string;
  @ManyToOne(() => HealthCheckPackage, (value) => value.contents, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'health_check_package_id' }) healthCheckPackage!: HealthCheckPackage;
  @Column({ type: 'varchar', length: 80 }) code!: string;
  @Column({ type: 'varchar', length: 160 }) name!: string;
  @Column({ type: 'varchar', length: 40, default: 'MEASUREMENT' }) category!: string;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column({ name: 'sort_order', type: 'smallint' }) sortOrder!: number;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
