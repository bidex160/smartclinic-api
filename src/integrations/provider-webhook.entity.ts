import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { Provider } from '../providers/entities/provider.entity';

/** Where SmartClinic sends signed updates for a facility. The signing secret is stored encrypted. */
@Entity('provider_webhooks')
@Index('UQ_provider_webhooks_provider', ['providerId'], { unique: true })
export class ProviderWebhook {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'provider_id', type: 'uuid' }) providerId!: string;
  @ManyToOne(() => Provider, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'provider_id' }) provider!: Provider;
  @Column({ type: 'varchar', length: 500 }) url!: string;
  @Column({ name: 'secret_ciphertext', type: 'text' }) secretCiphertext!: string;
  @Column({ name: 'secret_iv', type: 'varchar', length: 32 }) secretIv!: string;
  @Column({ name: 'secret_auth_tag', type: 'varchar', length: 32 }) secretAuthTag!: string;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive!: boolean;
  @Column({ name: 'created_by_user_id', type: 'uuid' }) createdByUserId!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
