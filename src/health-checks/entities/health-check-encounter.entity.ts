import { Booking } from '../../bookings/entities/booking.entity';
import { ProviderAssignment } from '../../providers/entities/provider-assignment.entity';
import { Provider } from '../../providers/entities/provider.entity';
import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { HealthCheckEncounterStatus } from '../enums/health-check-encounter-status.enum';
import { HealthCheckEncounterHistory } from './health-check-encounter-history.entity';
import { HealthCheckMeasurement } from './health-check-measurement.entity';

@Entity('health_check_encounters')
@Index('UQ_health_check_encounters_booking', ['bookingId'], { unique: true })
@Index('IDX_health_check_encounters_provider_status', ['providerId', 'status'])
@Check('CHK_health_check_encounters_timestamps', `("status" <> 'IN_PROGRESS' AND "status" <> 'COMPLETED') OR "started_at" IS NOT NULL`)
@Check('CHK_health_check_encounters_completed_at', `"status" <> 'COMPLETED' OR "completed_at" IS NOT NULL`)
export class HealthCheckEncounter {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'booking_id', type: 'uuid' }) bookingId!: string;
  @ManyToOne(() => Booking, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'booking_id' }) booking!: Booking;
  @Column({ name: 'provider_id', type: 'uuid' }) providerId!: string;
  @ManyToOne(() => Provider, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'provider_id' }) provider!: Provider;
  @Column({ name: 'provider_assignment_id', type: 'uuid' }) providerAssignmentId!: string;
  @ManyToOne(() => ProviderAssignment, { onDelete: 'RESTRICT' }) @JoinColumn([{ name: 'provider_assignment_id', referencedColumnName: 'id' }, { name: 'provider_id', referencedColumnName: 'providerId' }, { name: 'booking_id', referencedColumnName: 'bookingId' }]) providerAssignment!: ProviderAssignment;
  @Column({ type: 'enum', enum: HealthCheckEncounterStatus, enumName: 'health_check_encounter_status_enum', default: HealthCheckEncounterStatus.DRAFT }) status!: HealthCheckEncounterStatus;
  @Column({ name: 'started_at', type: 'timestamptz', nullable: true }) startedAt!: Date | null;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
  @OneToMany(() => HealthCheckMeasurement, (measurement) => measurement.encounter) measurements!: HealthCheckMeasurement[];
  @OneToMany(() => HealthCheckEncounterHistory, (history) => history.encounter) history!: HealthCheckEncounterHistory[];
}
