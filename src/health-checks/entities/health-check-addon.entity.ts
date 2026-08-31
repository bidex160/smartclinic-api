import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { HealthCheckPackageAddon } from './health-check-package-addon.entity';

@Entity('health_check_addons')
@Index('UQ_health_check_addon_code', ['code'], { unique: true })
export class HealthCheckAddon {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 80 }) code!: string;
  @Column({ type: 'varchar', length: 160 }) name!: string;
  @Column({ type: 'varchar', length: 40 }) category!: string;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column({ name: 'sort_order', type: 'smallint' }) sortOrder!: number;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
  @OneToMany(() => HealthCheckPackageAddon, (value) => value.addon) packageAvailability!: HealthCheckPackageAddon[];
}
