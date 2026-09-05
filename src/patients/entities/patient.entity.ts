import { Booking } from '../../bookings/entities/booking.entity';
import { User } from '../../users/entities/user.entity';
import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, OneToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

import { PatientStatus } from '../enums/patient-status.enum';

@Entity('patients')
@Index('UQ_patients_user_id', ['userId'], {
  unique: true,
  where: '"user_id" IS NOT NULL',
})
@Unique('UQ_patients_id_user', ['id', 'userId'])
export class Patient {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'patient_reference', type: 'varchar', length: 13, unique: true })
  patientReference!: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @OneToOne(() => User, (user) => user.patient, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;

  @Column({ name: 'given_name', type: 'varchar' })
  givenName!: string;

  @Column({ name: 'family_name', type: 'varchar' })
  familyName!: string;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth!: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', nullable: true })
  email!: string | null;

  @Column({ type: 'enum', enum: PatientStatus, enumName: 'patient_status_enum', default: PatientStatus.ACTIVE })
  status!: PatientStatus;

  @Column({
  name: 'country_code',
  type: 'char',
  length: 2,
  nullable: true,
})
countryCode!: string | null;

@Column({
  name: 'state_or_region',
  type: 'varchar',
  length: 120,
  nullable: true,
})
stateOrRegion!: string | null;

@Column({
  name: 'city',
  type: 'varchar',
  length: 120,
  nullable: true,
})
city!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @OneToMany(() => Booking, (booking) => booking.participant)
  bookings!: Booking[];
}
