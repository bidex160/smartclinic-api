import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum SmartClinicCatalogueCategory {
  LAB_TEST = 'LAB_TEST',
  MEDICATION = 'MEDICATION',
  IMAGING_STUDY = 'IMAGING_STUDY',
}

@Entity('smartclinic_service_catalogue')
@Index('UQ_smartclinic_service_catalogue_code', ['code'], { unique: true })
@Index('IDX_smartclinic_service_catalogue_category_active', ['category', 'isActive'])
@Check('CHK_smartclinic_service_catalogue_cost', '"average_cost_minor" >= 0')
@Check('CHK_smartclinic_service_catalogue_markup', '"markup_bps" BETWEEN 0 AND 50000')
export class SmartClinicServiceCatalogueItem {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 80 }) code!: string;
  @Column({ type: 'varchar', length: 20 }) category!: SmartClinicCatalogueCategory;
  @Column({ type: 'varchar', length: 200 }) name!: string;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column({ name: 'group_name', type: 'varchar', length: 80, nullable: true }) groupName!: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) subcategory!: string | null;
  @Column({ name: 'unit_label', type: 'varchar', length: 120, nullable: true }) unitLabel!: string | null;
  @Column({ name: 'average_cost_minor', type: 'bigint' }) averageCostMinor!: string;
  @Column({ name: 'markup_bps', type: 'smallint', default: 2000 }) markupBps!: number;
  @Column({ type: 'char', length: 3, default: 'NGN' }) currency!: string;
  @Column({ name: 'requires_prescription', type: 'boolean', default: false }) requiresPrescription!: boolean;
  @Column({ name: 'patient_visible', type: 'boolean', default: true }) patientVisible!: boolean;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive!: boolean;
  @Column({ name: 'sort_order', type: 'smallint', default: 0 }) sortOrder!: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
