import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ClinicalOrder } from './clinical-order.entity';

@Entity('clinical_diagnostic_order_items')
@Index('UQ_clinical_diagnostic_order_items_order', ['clinicalOrderId', 'sortOrder'], { unique: true })
@Check('CHK_clinical_diagnostic_order_items_sort', '"sort_order">=0')
export class ClinicalDiagnosticOrderItem {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'clinical_order_id', type: 'uuid' }) clinicalOrderId!: string;
  @ManyToOne(() => ClinicalOrder, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'clinical_order_id' }) clinicalOrder!: ClinicalOrder;

  @Column({ type: 'varchar', length: 200 }) name!: string;
  @Column({ type: 'varchar', length: 80, nullable: true }) code!: string | null;
  @Column({ type: 'text', nullable: true }) instructions!: string | null;
  @Column({ name: 'sort_order', type: 'smallint' }) sortOrder!: number;
}
