import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ReferralTargetType } from '../enums/referral-target-type.enum';
import { RewardLevelDefinition } from './reward-level-definition.entity';

@Entity('reward_level_requirements')
@Check('CHK_reward_level_requirements_positive', '"required_count" > 0')
@Index('UQ_reward_level_requirements_level_target', ['levelId', 'targetType'], { unique: true })
export class RewardLevelRequirement {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'level_id', type: 'uuid' }) levelId!: string;
  @ManyToOne(() => RewardLevelDefinition, (value) => value.requirements, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'level_id' }) level!: RewardLevelDefinition;
  @Column({ name: 'target_type', type: 'enum', enum: ReferralTargetType, enumName: 'referral_target_type_enum' }) targetType!: ReferralTargetType;
  @Column({ name: 'required_count', type: 'integer' }) requiredCount!: number;
}
