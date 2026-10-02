import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Small settings staff can change without a deploy (e.g. pausing wellness points). */
@Entity('app_settings')
export class AppSetting {
  @PrimaryColumn({ type: 'varchar', length: 80 }) key!: string;
  @Column({ type: 'jsonb' }) value!: unknown;
  @Column({ name: 'updated_by_user_id', type: 'uuid', nullable: true }) updatedByUserId!: string | null;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
