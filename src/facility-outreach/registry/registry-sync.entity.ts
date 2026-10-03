import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type RegistrySyncStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED';

/** One run of the nightly import from a public facility registry. */
@Entity('facility_registry_syncs')
@Index('IDX_facility_registry_syncs_source_started', ['source', 'startedAt'])
export class FacilityRegistrySync {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 40 }) source!: string;
  @Column({ type: 'varchar', length: 12 }) status!: RegistrySyncStatus;
  @Column({ name: 'started_at', type: 'timestamptz' }) startedAt!: Date;
  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true }) finishedAt!: Date | null;
  /** created, updated, unchanged, closed, skipped, pages, and the registry's own total per kind. */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) counts!: Record<string, number>;
  /** A short code such as KEY_REJECTED or RATE_LIMITED; never response bodies. */
  @Column({ type: 'varchar', length: 120, nullable: true }) error!: string | null;
  @Column({ name: 'triggered_by', type: 'varchar', length: 20, default: 'SCHEDULE' }) triggeredBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
