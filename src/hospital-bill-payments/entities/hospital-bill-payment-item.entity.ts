import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { HospitalBillPayment } from './hospital-bill-payment.entity';

@Entity('hospital_bill_payment_items')
@Index('UQ_hospital_bill_payment_items_payment_item', ['hospitalBillPaymentId', 'itemReference'], { unique: true })
export class HospitalBillPaymentItem {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'hospital_bill_payment_id', type: 'uuid' }) hospitalBillPaymentId!: string;
  @ManyToOne(() => HospitalBillPayment, payment => payment.items, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'hospital_bill_payment_id' }) payment!: HospitalBillPayment;
  @Column({ name: 'item_reference', type: 'varchar', length: 120 }) itemReference!: string;
  @Column({ type: 'varchar', length: 200 }) description!: string;
  @Column({ type: 'numeric', precision: 12, scale: 2 }) amount!: string;
}
