import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('password_reset_tokens')
@Index('UQ_password_reset_tokens_token_hash', ['tokenHash'], { unique: true })
@Index('IDX_password_reset_tokens_user_active', ['userId', 'usedAt', 'expiresAt'])
export class PasswordResetToken {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @Column({ name: 'token_hash', type: 'char', length: 64 }) tokenHash!: string;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @Column({ name: 'used_at', type: 'timestamptz', nullable: true }) usedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
