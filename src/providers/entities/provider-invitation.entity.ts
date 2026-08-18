import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ProviderInvitationStatus } from '../enums/provider-invitation-status.enum';
import { Provider } from './provider.entity';

@Entity('provider_invitations')
@Index('UQ_provider_invitations_token_hash', ['tokenHash'], { unique: true })
@Index('UQ_provider_invitations_pending_provider_email', ['providerId', 'emailNormalized'], { unique: true, where: `"status" = 'PENDING'` })
@Index('IDX_provider_invitations_provider_created', ['providerId', 'createdAt'])
export class ProviderInvitation {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'provider_id', type: 'uuid' }) providerId!: string;
  @ManyToOne(() => Provider, (provider) => provider.invitations, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'provider_id' }) provider!: Provider;
  @Column({ type: 'varchar' }) email!: string;
  @Column({ name: 'email_normalized', type: 'varchar' }) emailNormalized!: string;
  @Column({ name: 'token_hash', type: 'char', length: 64 }) tokenHash!: string;
  @Column({ type: 'enum', enum: ProviderInvitationStatus, enumName: 'provider_invitation_status_enum', default: ProviderInvitationStatus.PENDING }) status!: ProviderInvitationStatus;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true }) acceptedAt!: Date | null;
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true }) revokedAt!: Date | null;
  @Column({ name: 'created_by_user_id', type: 'uuid' }) createdByUserId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'created_by_user_id' }) createdBy!: User;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
