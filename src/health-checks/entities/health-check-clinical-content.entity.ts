import { randomBytes } from 'node:crypto';
import {
  BeforeInsert,
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { ProviderServiceAddon } from '../../providers/entities/provider-service-addon.entity';
import { HealthCheckClinicalResultType } from '../enums/health-check-clinical-result-type.enum';
import { HealthCheckPackageAddon } from './health-check-package-addon.entity';
import { HealthCheckPackageContent } from './health-check-package-content.entity';

@Entity('health_check_clinical_contents')
@Index('UQ_health_check_clinical_contents_reference', ['reference'], { unique: true })
@Index('UQ_health_check_clinical_contents_code', ['code'], { unique: true })
@Check(
  'CHK_health_check_clinical_contents_result_contract',
  `("result_type" = 'NONE' AND "unit" IS NULL) OR ("result_type" <> 'NONE' AND "unit" IS NOT NULL)`,
)
export class HealthCheckClinicalContent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 23 })
  reference!: string;

  @BeforeInsert()
  generateReference(): void {
    if (!this.reference) this.reference = `SC-HCC-${randomBytes(8).toString('hex').toUpperCase()}`;
  }

  @Column({ type: 'varchar', length: 80 })
  code!: string;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 40 })
  category!: string;

  @Column({ name: 'display_order', type: 'smallint', default: 0 })
  displayOrder!: number;

  @Column({
    name: 'result_type',
    type: 'enum',
    enum: HealthCheckClinicalResultType,
    enumName: 'health_check_clinical_result_type_enum',
    default: HealthCheckClinicalResultType.NONE,
  })
  resultType!: HealthCheckClinicalResultType;

  @Column({ type: 'varchar', length: 16, nullable: true })
  unit!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => HealthCheckPackageContent, (value) => value.clinicalContent)
  packageContents!: HealthCheckPackageContent[];

  @OneToMany(() => HealthCheckPackageAddon, (value) => value.clinicalContent)
  packageAddonEligibility!: HealthCheckPackageAddon[];

  @OneToMany(() => ProviderServiceAddon, (value) => value.clinicalContent)
  providerOfferings!: ProviderServiceAddon[];
}
