import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Provider } from '../../providers/entities/provider.entity';
import { User } from '../../users/entities/user.entity';
import { ProviderRecruitmentEmailStatus, ProviderRecruitmentInvitationSource, ProviderRecruitmentInvitationStatus } from '../enums/provider-recruitment-invitation.enum';

@Entity('provider_recruitment_invitations')
@Index('UQ_provider_recruitment_invitations_reference', ['reference'], { unique: true })
@Index('UQ_provider_recruitment_invitations_submission_key', ['submissionKey'], { unique: true })
@Index('IDX_provider_recruitment_invitations_status_created', ['status', 'createdAt'])
@Index('IDX_provider_recruitment_invitations_source_created', ['source', 'createdAt'])
@Index('IDX_provider_recruitment_invitations_email', ['emailNormalized'])
export class ProviderRecruitmentInvitation {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 17 }) reference!: string;
  @Column({ name: 'invited_by_user_id', type: 'uuid' }) invitedByUserId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'invited_by_user_id' }) invitedByUser!: User;
  @Column({ name: 'organisation_name', type: 'varchar', length: 160 }) organisationName!: string;
  @Column({ type: 'varchar', length: 254, nullable: true }) email!: string | null;
  @Column({ name: 'email_normalized', type: 'varchar', length: 254, nullable: true }) emailNormalized!: string | null;
  @Column({ type: 'varchar', length: 32, nullable: true }) phone!: string | null;
  @Column({ type: 'enum', enum: ProviderRecruitmentInvitationSource, enumName: 'provider_recruitment_invitation_source_enum' }) source!: ProviderRecruitmentInvitationSource;
  @Column({ type: 'enum', enum: ProviderRecruitmentInvitationStatus, enumName: 'provider_recruitment_invitation_status_enum', default: ProviderRecruitmentInvitationStatus.PENDING }) status!: ProviderRecruitmentInvitationStatus;
  @Column({ name: 'package_code', type: 'varchar', nullable: true }) packageCode!: string | null;
  @Column({ name: 'service_code', type: 'varchar', nullable: true }) serviceCode!: string | null;
  @Column({ name: 'fulfilment_mode_code', type: 'varchar', nullable: true }) fulfilmentModeCode!: string | null;
  @Column({ name: 'preferred_date', type: 'date', nullable: true }) preferredDate!: string | null;
  @Column({ name: 'preferred_time', type: 'time', nullable: true }) preferredTime!: string | null;
  @Column({ name: 'country_code', type: 'char', length: 2, nullable: true }) countryCode!: string | null;
  @Column({ name: 'state_or_region', type: 'varchar', length: 120, nullable: true }) stateOrRegion!: string | null;
  @Column({ type: 'varchar', length: 120, nullable: true }) city!: string | null;
  @Column({ name: 'email_notification_status', type: 'enum', enum: ProviderRecruitmentEmailStatus, enumName: 'provider_recruitment_email_status_enum' }) emailNotificationStatus!: ProviderRecruitmentEmailStatus;
  @Column({ name: 'email_notification_failure_reason', type: 'varchar', length: 120, nullable: true }) emailNotificationFailureReason!: string | null;
  @Column({ name: 'submission_key', type: 'char', length: 64 }) submissionKey!: string;
  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true }) acceptedAt!: Date | null;
  @Column({ name: 'provider_id', type: 'uuid', nullable: true }) providerId!: string | null;
  @ManyToOne(() => Provider, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'provider_id' }) provider!: Provider | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
