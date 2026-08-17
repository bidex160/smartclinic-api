import { Booking } from '../../bookings/entities/booking.entity';
import { BookingFunding } from '../../bookings/entities/booking-funding.entity';
import { Column, CreateDateColumn, DeleteDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { OrganisationStatus } from '../enums/organisation-status.enum';

@Entity('organisations')
export class Organisation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ name: 'public_code', type: 'varchar', unique: true })
  publicCode!: string;

  @Column({ type: 'enum', enum: OrganisationStatus, enumName: 'organisation_status_enum', default: OrganisationStatus.ACTIVE })
  status!: OrganisationStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @OneToMany(() => Booking, (booking) => booking.organisationContext)
  bookingsInContext!: Booking[];

  @OneToMany(() => BookingFunding, (funding) => funding.responsibleOrganisation)
  fundingResponsibilities!: BookingFunding[];
}
