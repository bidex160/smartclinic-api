import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { HospitalBillPaymentStatus } from '../enums/hospital-bill-payment-status.enum';
import { HospitalNotificationStatus } from '../enums/hospital-notification-status.enum';
import { HospitalBillPaymentItem } from './hospital-bill-payment-item.entity';

@Entity('hospital_bill_payments')
@Index('UQ_hospital_bill_payments_reference', ['reference'], { unique: true })
@Index('IDX_hospital_bill_payments_user_status', ['userId', 'status'])
export class HospitalBillPayment {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 50 }) reference!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @Column({ name: 'hospital_code', type: 'varchar', length: 40 }) hospitalCode!: string;
  @Column({ name: 'invoice_reference', type: 'varchar', length: 120 }) invoiceReference!: string;
  @Column({ type: 'numeric', precision: 12, scale: 2 }) amount!: string;
  @Column({ type: 'char', length: 3 }) currency!: string;
  @Column({ type: 'enum', enum: HospitalBillPaymentStatus, enumName: 'hospital_bill_payment_status_enum' }) status!: HospitalBillPaymentStatus;
  @Column({ name: 'gateway_reference', type: 'varchar', nullable: true }) gatewayReference!: string | null;
  @Column({ name: 'gateway_provider', type: 'varchar', nullable: true }) gatewayProvider!: string | null;
  @Column({ name: 'checkout_url', type: 'text', nullable: true }) checkoutUrl!: string | null;
  @Column({ name: 'access_code', type: 'text', nullable: true }) accessCode!: string | null;
  @Column({ name: 'hospital_notification_status', type: 'enum', enum: HospitalNotificationStatus, enumName: 'hospital_notification_status_enum', default: HospitalNotificationStatus.PENDING }) hospitalNotificationStatus!: HospitalNotificationStatus;
  @Column({ name: 'hospital_notification_reference', type: 'varchar', nullable: true }) hospitalNotificationReference!: string | null;
  @Column({ name: 'hospital_notified_at', type: 'timestamptz', nullable: true }) hospitalNotifiedAt!: Date | null;
  @Column({ name: 'hospital_notification_error', type: 'text', nullable: true }) hospitalNotificationError!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
  @OneToMany(() => HospitalBillPaymentItem, item => item.payment, { cascade: true }) items!: HospitalBillPaymentItem[];
}
