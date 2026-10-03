import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToOne, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { User } from '../../users/entities/user.entity';
import { Provider } from '../entities/provider.entity';

/** The fixed list of medical specialties (seeded by migration 1796227200000). */
@Entity('clinical_specialties')
export class ClinicalSpecialty {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 80, unique: true }) code!: string;
  @Column({ type: 'varchar', length: 160 }) name!: string;
  @Column({ name: 'group_name', type: 'varchar', length: 120, nullable: true }) groupName!: string | null;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive!: boolean;
  @Column({ name: 'sort_order', type: 'smallint', default: 0 }) sortOrder!: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/** Which specialties a doctor practises (or a hospital offers). One can be the main one. */
@Entity('provider_specialties')
@Index('IDX_provider_specialties_specialty', ['specialtyId', 'providerId'])
export class ProviderSpecialty {
  @PrimaryColumn({ name: 'provider_id', type: 'uuid' }) providerId!: string;
  @PrimaryColumn({ name: 'specialty_id', type: 'uuid' }) specialtyId!: string;
  @ManyToOne(() => Provider, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'provider_id' }) provider!: Provider;
  @ManyToOne(() => ClinicalSpecialty, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'specialty_id' }) specialty!: ClinicalSpecialty;
  @Column({ name: 'is_primary', type: 'boolean', default: false }) isPrimary!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

export enum CredentialStatus {
  NOT_SUBMITTED = 'NOT_SUBMITTED',
  SUBMITTED = 'SUBMITTED',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
}

/**
 * A provider's licence: the doctor's council registration, or the facility's operating licence.
 * Staff check it with the regulator before the provider can be approved and booked.
 */
@Entity('provider_credentials')
export class ProviderCredential {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'provider_id', type: 'uuid', unique: true }) providerId!: string;
  @OneToOne(() => Provider, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'provider_id' }) provider!: Provider;
  @Column({ type: 'varchar', length: 20 }) regulator!: string;
  @Column({ name: 'licence_number', type: 'varchar', length: 60 }) licenceNumber!: string;
  @Column({ type: 'varchar', length: 20, default: CredentialStatus.SUBMITTED }) status!: CredentialStatus;
  @Column({ name: 'document_public_id', type: 'varchar', length: 300, nullable: true }) documentPublicId!: string | null;
  @Column({ name: 'document_resource_type', type: 'varchar', length: 20, nullable: true }) documentResourceType!: string | null;
  @Column({ name: 'document_version', type: 'varchar', length: 40, nullable: true }) documentVersion!: string | null;
  @Column({ name: 'document_format', type: 'varchar', length: 20, nullable: true }) documentFormat!: string | null;
  @Column({ name: 'document_mime_type', type: 'varchar', length: 100, nullable: true }) documentMimeType!: string | null;
  @Column({ name: 'document_uploaded_at', type: 'timestamptz', nullable: true }) documentUploadedAt!: Date | null;
  @Column({ name: 'submitted_at', type: 'timestamptz' }) submittedAt!: Date;
  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true }) verifiedAt!: Date | null;
  @Column({ name: 'reviewed_by_user_id', type: 'uuid', nullable: true }) reviewedByUserId!: string | null;
  @ManyToOne(() => User, { onDelete: 'SET NULL' }) @JoinColumn({ name: 'reviewed_by_user_id' }) reviewedBy!: User | null;
  /** How staff checked it, e.g. "MDCN online register" or "Called the council". */
  @Column({ name: 'checked_via', type: 'varchar', length: 120, nullable: true }) checkedVia!: string | null;
  @Column({ name: 'review_note', type: 'varchar', length: 500, nullable: true }) reviewNote!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
