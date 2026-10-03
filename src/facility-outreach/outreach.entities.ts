import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToOne, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { PartnerFacilityListing } from '../patient-provider-connections/entities/partner-facility-listing.entity';
import { User } from '../users/entities/user.entity';

export enum OutreachStatus {
  /** On the list, nobody contacted yet. */
  LISTED = 'LISTED',
  /** Invite sent (email or WhatsApp), waiting for them to claim. */
  INVITED = 'INVITED',
  /** Talked to someone (call or visit) but not claimed yet. */
  CONTACTED = 'CONTACTED',
  CLAIMED = 'CLAIMED',
  /** Said no for now. */
  DECLINED = 'DECLINED',
  /** Number or email doesn't reach them. */
  WRONG_CONTACT = 'WRONG_CONTACT',
}

/** How to reach a listed facility, and where we are in bringing it on board. One row per listing. */
@Entity('facility_outreach')
export class FacilityOutreach {
  @PrimaryColumn({ name: 'listing_id', type: 'uuid' }) listingId!: string;
  @OneToOne(() => PartnerFacilityListing, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'listing_id' }) listing!: PartnerFacilityListing;
  @Column({ type: 'varchar', length: 32, nullable: true }) phone!: string | null;
  @Column({ type: 'varchar', length: 32, nullable: true }) whatsapp!: string | null;
  @Column({ type: 'varchar', length: 254, nullable: true }) email!: string | null;
  @Column({ type: 'varchar', length: 300, nullable: true }) website!: string | null;
  @Column({ type: 'varchar', length: 300, nullable: true }) address!: string | null;
  @Column({ name: 'contact_name', type: 'varchar', length: 160, nullable: true }) contactName!: string | null;
  @Column({ type: 'varchar', length: 20, default: OutreachStatus.LISTED }) status!: OutreachStatus;
  /** sha256 of the claim token; the token itself is only ever in the link. */
  @Column({ name: 'claim_token_hash', type: 'varchar', length: 64, nullable: true, unique: true }) claimTokenHash!: string | null;
  @Column({ name: 'claim_token_created_at', type: 'timestamptz', nullable: true }) claimTokenCreatedAt!: Date | null;
  @Column({ name: 'claimed_at', type: 'timestamptz', nullable: true }) claimedAt!: Date | null;
  @Column({ name: 'invites_sent', type: 'integer', default: 0 }) invitesSent!: number;
  @Column({ name: 'last_contact_at', type: 'timestamptz', nullable: true }) lastContactAt!: Date | null;
  /** 0 = none sent yet, 1 = first reminder sent, 2 = second (last) reminder sent. */
  @Column({ name: 'reminder_stage', type: 'smallint', default: 0 }) reminderStage!: number;
  @Column({ name: 'next_reminder_at', type: 'timestamptz', nullable: true }) nextReminderAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

export enum OutreachEventKind {
  IMPORTED = 'IMPORTED',
  INVITE_EMAIL = 'INVITE_EMAIL',
  INVITE_WHATSAPP = 'INVITE_WHATSAPP',
  /** Staff sent the WhatsApp or SMS from their own phone. */
  INVITE_MANUAL = 'INVITE_MANUAL',
  REMINDER_EMAIL = 'REMINDER_EMAIL',
  REMINDER_WHATSAPP = 'REMINDER_WHATSAPP',
  CALL = 'CALL',
  VISIT = 'VISIT',
  NOTE = 'NOTE',
  CLAIMED = 'CLAIMED',
}

/** Everything that happened with one facility: invites, reminders, calls, the claim. */
@Entity('facility_outreach_events')
@Index('IDX_facility_outreach_events_listing_created', ['listingId', 'createdAt'])
export class FacilityOutreachEvent {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'listing_id', type: 'uuid' }) listingId!: string;
  @ManyToOne(() => PartnerFacilityListing, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'listing_id' }) listing!: PartnerFacilityListing;
  @Column({ type: 'varchar', length: 24 }) kind!: OutreachEventKind;
  @Column({ type: 'varchar', length: 500, nullable: true }) note!: string | null;
  @Column({ name: 'by_user_id', type: 'uuid', nullable: true }) byUserId!: string | null;
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'by_user_id' }) byUser!: User | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
