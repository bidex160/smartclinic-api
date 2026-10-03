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

  // From the national registry (or another public source). Public facts about the facility.
  @Column({ name: 'lga', type: 'varchar', length: 120, nullable: true }) lga!: string | null;
  @Column({ name: 'address', type: 'varchar', length: 300, nullable: true }) address!: string | null;
  @Column({ name: 'latitude', type: 'double precision', nullable: true }) latitude!: number | null;
  @Column({ name: 'longitude', type: 'double precision', nullable: true }) longitude!: number | null;
  @Column({ name: 'level_of_care', type: 'varchar', length: 60, nullable: true }) levelOfCare!: string | null;
  @Column({ name: 'ownership', type: 'varchar', length: 60, nullable: true }) ownership!: string | null;
  @Column({ name: 'registry_unique_id', type: 'varchar', length: 80, nullable: true }) registryUniqueId!: string | null;
  @Column({ name: 'operational_status', type: 'varchar', length: 60, nullable: true }) operationalStatus!: string | null;
  @Column({ name: 'registration_status', type: 'varchar', length: 60, nullable: true }) registrationStatus!: string | null;
  @Column({ name: 'licence_status', type: 'varchar', length: 60, nullable: true }) licenceStatus!: string | null;
  @Column({ name: 'accreditation_status', type: 'varchar', length: 60, nullable: true }) accreditationStatus!: string | null;
  /** Operating and registered/licensed in the registry, as of the last sync. */
  @Column({ name: 'registry_verified', type: 'boolean', default: false }) registryVerified!: boolean;
  /**
   * The phone and email the registry holds. Claim codes only ever go here, never to a number staff
   * typed in, so a code proves the person controls the facility's officially registered contact.
   */
  @Column({ name: 'registry_phone', type: 'varchar', length: 40, nullable: true }) registryPhone!: string | null;
  @Column({ name: 'registry_email', type: 'varchar', length: 254, nullable: true }) registryEmail!: string | null;
  @Column({ name: 'registry_seen_at', type: 'timestamptz', nullable: true }) registrySeenAt!: Date | null;
  /** Google Maps place ID (the only Google field we may keep), for the reviews and directions link. */
  @Column({ name: 'google_place_id', type: 'varchar', length: 300, nullable: true }) googlePlaceId!: string | null;
  @Column({ name: 'google_checked_at', type: 'timestamptz', nullable: true }) googleCheckedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
