import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { RewardLevelRequirement } from './reward-level-requirement.entity';

@Entity('reward_level_definitions')
export class RewardLevelDefinition {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 40, unique: true }) code!: string;
  @Column({ type: 'varchar', length: 100 }) name!: string;
  @Column({ name: 'ordinal', type: 'integer', unique: true }) ordinal!: number;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive!: boolean;
  @OneToMany(() => RewardLevelRequirement, (value) => value.level) requirements!: RewardLevelRequirement[];
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
