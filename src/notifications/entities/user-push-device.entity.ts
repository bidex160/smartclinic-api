import { CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn, Column } from 'typeorm';

import { User } from '../../users/entities/user.entity';
import { PushDevicePlatform } from '../enums/push-device-platform.enum';

@Entity('user_push_devices')
@Unique('UQ_user_push_devices_token', ['token'])
@Index('IDX_user_push_devices_user_active', ['userId', 'isActive'])
export class UserPushDevice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 20 })
  platform!: PushDevicePlatform;

  @Column({ type: 'text' })
  token!: string;

  @Column({ name: 'installation_id', type: 'varchar', length: 160, nullable: true })
  installationId!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'last_seen_at', type: 'timestamptz', nullable: true })
  lastSeenAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
