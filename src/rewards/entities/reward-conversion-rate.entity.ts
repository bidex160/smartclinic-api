import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('reward_conversion_rates')
@Check('CHK_reward_conversion_rate_positive', 'points > 0 AND amount > 0')
@Index('UQ_reward_conversion_rates_active_currency', ['currency'], { unique: true, where: '"is_active" = true' })
export class RewardConversionRate {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'integer' }) points!: number;
  @Column({ type: 'numeric', precision: 14, scale: 2 }) amount!: string;
  @Column({ type: 'varchar', length: 3 }) currency!: string;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive!: boolean;
  @Column({ name: 'effective_from', type: 'timestamptz' }) effectiveFrom!: Date;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
