import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { User } from '../../users/entities/user.entity';
import { ProviderMemberRole, ProviderMemberStatus } from '../enums/provider-member.enum';
import { Provider } from './provider.entity';

/**
 * A staff login at a facility (doctor, lab scientist, pharmacist…). The
 * facility's own account (provider.userId) is the owner and is not a member row.
 */
@Entity('provider_members')
@Index('UQ_provider_members_open_email', ['providerId', 'emailNormalized'], { unique: true, where: `"status" <> 'REMOVED'` })
@Index('UQ_provider_members_active_user', ['userId'], { unique: true, where: `"status" = 'ACTIVE'` })
@Index('UQ_provider_members_invite_token', ['inviteTokenHash'], { unique: true, where: `"invite_token_hash" IS NOT NULL` })
@Index('IDX_provider_members_provider_status', ['providerId', 'status'])
export class ProviderMember {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'provider_id', type: 'uuid' }) providerId!: string;
  @ManyToOne(() => Provider, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'provider_id' })
  provider!: Provider;

  @Column({ name: 'user_id', type: 'uuid', nullable: true }) userId!: string | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;

  @Column({ name: 'email_normalized', type: 'varchar', length: 320 }) emailNormalized!: string;
  @Column({ name: 'display_name', type: 'varchar', length: 120, nullable: true }) displayName!: string | null;
  @Column({ type: 'varchar', length: 30 }) role!: ProviderMemberRole;
  @Column({ type: 'varchar', length: 20 }) status!: ProviderMemberStatus;

  @Column({ name: 'invite_token_hash', type: 'varchar', length: 64, nullable: true }) inviteTokenHash!: string | null;
  @Column({ name: 'invite_expires_at', type: 'timestamptz', nullable: true }) inviteExpiresAt!: Date | null;
  @Column({ name: 'invited_by_user_id', type: 'uuid' }) invitedByUserId!: string;
  @Column({ name: 'joined_at', type: 'timestamptz', nullable: true }) joinedAt!: Date | null;
  @Column({ name: 'removed_at', type: 'timestamptz', nullable: true }) removedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
