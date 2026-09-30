import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Patient } from '../../patients/entities/patient.entity';
import { PartnerFacilityListing } from './partner-facility-listing.entity';

@Entity('partner_facility_interests')
@Index('UQ_partner_facility_interests_patient_listing', ['patientId', 'listingId'], { unique: true })
@Index('IDX_partner_facility_interests_listing_created', ['listingId', 'createdAt'])
export class PartnerFacilityInterest {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'patient_id', type: 'uuid' }) patientId!: string;
  @ManyToOne(() => Patient, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'patient_id' }) patient!: Patient;
  @Column({ name: 'listing_id', type: 'uuid' }) listingId!: string;
  @ManyToOne(() => PartnerFacilityListing, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'listing_id' }) listing!: PartnerFacilityListing;
  @Column({ name: 'consent_captured_at', type: 'timestamptz' }) consentCapturedAt!: Date;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
