import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { Provider } from '../providers/entities/provider.entity';

/** A key a facility's own system (EMR, LIS, pharmacy software) uses to call SmartClinic. Only a hash is stored. */
@Entity('provider_api_keys')
@Index('UQ_provider_api_keys_prefix', ['keyPrefix'], { unique: true })
@Index('IDX_provider_api_keys_provider', ['providerId', 'revokedAt'])
export class ProviderApiKey {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'provider_id', type: 'uuid' }) providerId!: string;
  @ManyToOne(() => Provider, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'provider_id' }) provider!: Provider;
  @Column({ type: 'varchar', length: 80 }) name!: string;
  /** Public part shown in lists and used to look the key up, e.g. "sck_1a2b3c4d". */
  @Column({ name: 'key_prefix', type: 'varchar', length: 16 }) keyPrefix!: string;
  @Column({ name: 'key_hash', type: 'varchar', length: 64 }) keyHash!: string;
  @Column({ name: 'created_by_user_id', type: 'uuid' }) createdByUserId!: string;
  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true }) lastUsedAt!: Date | null;
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true }) revokedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
