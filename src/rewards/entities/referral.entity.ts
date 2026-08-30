import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Patient } from '../../patients/entities/patient.entity';
import { Provider } from '../../providers/entities/provider.entity';
import { User } from '../../users/entities/user.entity';
import { ReferralStatus } from '../enums/referral-status.enum';
import { ReferralTargetType } from '../enums/referral-target-type.enum';
import { ReferralCode } from './referral-code.entity';

@Entity('referrals')
@Index('UQ_referrals_referred_user_id', ['referredUserId'], { unique: true, where: '"referred_user_id" IS NOT NULL' })
@Index('IDX_referrals_referrer_status_target', ['referrerUserId', 'status', 'targetType'])
@Index('IDX_referrals_qualified_at', ['qualifiedAt'])
export class Referral {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'referrer_user_id', type: 'uuid' }) referrerUserId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'referrer_user_id' }) referrerUser!: User;
  @Column({ name: 'referral_code_id', type: 'uuid' }) referralCodeId!: string;
  @ManyToOne(() => ReferralCode, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'referral_code_id' }) referralCode!: ReferralCode;
  @Column({ name: 'target_type', type: 'enum', enum: ReferralTargetType, enumName: 'referral_target_type_enum' }) targetType!: ReferralTargetType;
  @Column({ type: 'enum', enum: ReferralStatus, enumName: 'referral_status_enum', default: ReferralStatus.REGISTERED }) status!: ReferralStatus;
  @Column({ name: 'referred_user_id', type: 'uuid', nullable: true }) referredUserId!: string | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'referred_user_id' }) referredUser!: User | null;
  @Column({ name: 'referred_patient_id', type: 'uuid', nullable: true }) referredPatientId!: string | null;
  @ManyToOne(() => Patient, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'referred_patient_id' }) referredPatient!: Patient | null;
  @Column({ name: 'referred_provider_id', type: 'uuid', nullable: true }) referredProviderId!: string | null;
  @ManyToOne(() => Provider, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'referred_provider_id' }) referredProvider!: Provider | null;
  @Column({ name: 'reward_model_version', type: 'smallint', default: 2 }) rewardModelVersion!: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @Column({ name: 'qualified_at', type: 'timestamptz', nullable: true }) qualifiedAt!: Date | null;
}
