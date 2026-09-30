import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Provider } from '../../providers/entities/provider.entity';

export enum PartnerFacilityType {
  HOSPITAL = 'HOSPITAL',
  PHARMACY = 'PHARMACY',
  LABORATORY = 'LABORATORY',
  RADIOLOGY = 'RADIOLOGY',
}

export enum PartnerFacilityReadiness {
  AVAILABLE_TO_JOIN = 'AVAILABLE_TO_JOIN',
  JOINED = 'JOINED',
  FULLY_JOINED = 'FULLY_JOINED',
}

@Entity('partner_facility_listings')
@Index('UQ_partner_facility_listings_source_ref', ['source', 'sourceReference'], { unique: true })
@Index('IDX_partner_facility_listings_type_location', ['facilityType', 'countryCode', 'stateOrRegion', 'city'])
export class PartnerFacilityListing {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'source', type: 'varchar', length: 40 }) source!: string;
  @Column({ name: 'source_reference', type: 'varchar', length: 100 }) sourceReference!: string;
  @Column({ name: 'display_name', type: 'varchar', length: 240 }) displayName!: string;
  @Column({ name: 'facility_type', type: 'enum', enum: PartnerFacilityType, enumName: 'partner_facility_type_enum' }) facilityType!: PartnerFacilityType;
  @Column({ name: 'country_code', type: 'char', length: 2 }) countryCode!: string;
  @Column({ name: 'state_or_region', type: 'varchar', length: 120, nullable: true }) stateOrRegion!: string | null;
  @Column({ name: 'city', type: 'varchar', length: 120, nullable: true }) city!: string | null;
  @Column({ name: 'readiness', type: 'enum', enum: PartnerFacilityReadiness, enumName: 'partner_facility_readiness_enum', default: PartnerFacilityReadiness.AVAILABLE_TO_JOIN }) readiness!: PartnerFacilityReadiness;
  @Column({ name: 'provider_id', type: 'uuid', nullable: true }) providerId!: string | null;
  @ManyToOne(() => Provider, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'provider_id' }) provider!: Provider | null;
  @Column({ name: 'source_verified_at', type: 'timestamptz', nullable: true }) sourceVerifiedAt!: Date | null;
  @Column({ name: 'active', type: 'boolean', default: true }) active!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
