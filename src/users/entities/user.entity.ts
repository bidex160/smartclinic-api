import { Column, DeleteDateColumn, Entity, Index, OneToMany, OneToOne, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

import { Booking } from '../../bookings/entities/booking.entity';
import { BookingFunding } from '../../bookings/entities/booking-funding.entity';
import { BookingStatusHistory } from '../../bookings/entities/booking-status-history.entity';
import { Patient } from '../../patients/entities/patient.entity';
import { Provider } from '../../providers/entities/provider.entity';
import { ProviderAssignmentHistory } from '../../providers/entities/provider-assignment-history.entity';
import { UserStatus } from '../enums/user-status.enum';

@Entity('users')
@Index('UQ_users_email_normalized', ['emailNormalized'], {
  unique: true,
  where: '"email_normalized" IS NOT NULL',
})
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', nullable: true })
  email!: string | null;

  @Column({ name: 'email_normalized', type: 'varchar', nullable: true })
  emailNormalized!: string | null;

  @Column({ name: 'display_name', type: 'varchar', nullable: true })
  displayName!: string | null;

  @Column({ type: 'enum', enum: UserStatus, enumName: 'user_status_enum', default: UserStatus.ACTIVE })
  status!: UserStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @OneToOne(() => Patient, (patient) => patient.user)
  patient!: Patient | null;

  @OneToOne(() => Provider, (provider) => provider.user)
  provider!: Provider | null;

  @OneToMany(() => Booking, (booking) => booking.booker)
  bookingsAsBooker!: Booking[];

  @OneToMany(() => BookingFunding, (funding) => funding.responsibleUser)
  fundingResponsibilities!: BookingFunding[];

  @OneToMany(() => BookingStatusHistory, (history) => history.actor)
  bookingStatusChanges!: BookingStatusHistory[];

  @OneToMany(() => ProviderAssignmentHistory, (history) => history.actor)
  providerAssignmentChanges!: ProviderAssignmentHistory[];
}
