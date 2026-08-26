import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { RewardLevelDefinition } from './reward-level-definition.entity';

@Entity('reward_level_achievements')
@Index('UQ_reward_level_achievements_user_level', ['userId', 'levelId'], { unique: true })
export class RewardLevelAchievement {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @Column({ name: 'level_id', type: 'uuid' }) levelId!: string;
  @ManyToOne(() => RewardLevelDefinition, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'level_id' }) level!: RewardLevelDefinition;
  @CreateDateColumn({ name: 'achieved_at', type: 'timestamptz' }) achievedAt!: Date;
}
