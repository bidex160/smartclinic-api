import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Hmo } from './hmo.entity';

@Entity('hmo_plans')
@Index('UQ_hmo_plans_hmo_code', ['hmoId', 'code'], { unique: true })
export class HmoPlan {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'hmo_id', type: 'uuid' }) hmoId!: string;
  @ManyToOne(() => Hmo, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'hmo_id' }) hmo!: Hmo;
  @Column({ type: 'varchar', length: 120 }) name!: string;
  @Column({ type: 'varchar', length: 50 }) code!: string;
  @Column({ name: 'amount_minor', type: 'bigint', nullable: true }) amountMinor!: string | null;
  @Column({ type: 'char', length: 3, default: 'NGN' }) currency!: string;
  @Column({ name: 'billing_period', type: 'varchar', length: 20, default: 'MONTHLY' }) billingPeriod!: string;
  @Column({ type: 'boolean', default: true }) active!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
