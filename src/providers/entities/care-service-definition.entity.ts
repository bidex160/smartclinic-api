import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ProviderCareService } from './provider-care-service.entity';

@Entity('care_service_definitions')
@Index('UQ_care_service_definitions_code', ['code'], { unique: true })
@Index('IDX_care_service_definitions_active_name', ['isActive', 'name'])
export class CareServiceDefinition {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 80 }) code!: string;
  @Column({ type: 'varchar', length: 160 }) name!: string;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
  @OneToMany(() => ProviderCareService, (service) => service.definition) providerServices!: ProviderCareService[];
}
