import { Booking } from '../../bookings/entities/booking.entity';
import { Check, Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { PackagePrice } from './package-price.entity';

@Entity('health_check_packages')
@Check(
  'CHK_health_check_packages_estimated_duration_minutes',
  '"estimated_duration_minutes" IS NULL OR "estimated_duration_minutes" > 0',
)
export class HealthCheckPackage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', unique: true })
  code!: string;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  benefits!: string[];

  @Column({ name: 'estimated_duration_minutes', type: 'integer', nullable: true })
  estimatedDurationMinutes!: number | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => Booking, (booking) => booking.healthCheckPackage)
  bookings!: Booking[];

  @OneToMany(() => PackagePrice, (packagePrice) => packagePrice.healthCheckPackage)
  packagePrices!: PackagePrice[];
}
