import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Patient } from '../../patients/entities/patient.entity';
import { PartnerFacilityListing } from './partner-facility-listing.entity';

@Entity('partner_facility_requests')
@Index('IDX_partner_facility_requests_status_created', ['status', 'createdAt'])
@Index('IDX_partner_facility_requests_listing_created', ['listingId', 'createdAt'])
export class PartnerFacilityRequest {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'patient_id', type: 'uuid' }) patientId!: string;
  @ManyToOne(() => Patient, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'patient_id' }) patient!: Patient;
  @Column({ name: 'listing_id', type: 'uuid' }) listingId!: string;
  @ManyToOne(() => PartnerFacilityListing, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'listing_id' }) listing!: PartnerFacilityListing;
  @Column({ name: 'request_type', type: 'varchar', length: 24 }) requestType!: string;
  @Column({ name: 'preferred_at', type: 'timestamptz', nullable: true }) preferredAt!: Date | null;
  @Column({ name: 'consent_captured_at', type: 'timestamptz' }) consentCapturedAt!: Date;
  @Column({ type: 'varchar', length: 24, default: 'NEW' }) status!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
