import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { User } from '../../users/entities/user.entity';
import { ProviderStatus } from '../enums/provider-status.enum';
import { ProviderAssignment } from './provider-assignment.entity';
import { ProviderLocation } from './provider-location.entity';
import { ProviderService } from './provider-service.entity';
import { ProviderAvailability } from './provider-availability.entity';
import { ProviderAvailabilityException } from './provider-availability-exception.entity';
import { ProviderBookingReservation } from './provider-booking-reservation.entity';
import { ProviderInvitation } from './provider-invitation.entity';
import { ProviderOnboardingStatus } from '../enums/provider-onboarding-status.enum';
import { ProviderType } from '../enums/provider-type.enum';

@Entity('providers')
@Index('UQ_providers_user_id', ['userId'], { unique: true, where: '"user_id" IS NOT NULL' })
@Index('UQ_providers_email', ['email'], { unique: true, where: '"email" IS NOT NULL' })
export class Provider {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @OneToOne(() => User, (user) => user.provider, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;

  @Column({ name: 'display_name', type: 'varchar' })
  displayName!: string;

  @Column({ type: 'varchar', nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone!: string | null;

  @Column({ name: 'professional_reference', type: 'varchar', nullable: true })
  professionalReference!: string | null;

  @Column({ name: 'provider_type', type: 'enum', enum: ProviderType, enumName: 'provider_type_enum', default: ProviderType.OTHER })
  providerType!: ProviderType;

  @Column({ name: 'country_code', type: 'char', length: 2, nullable: true })
  countryCode!: string | null;

  @Column({ name: 'state_or_region', type: 'varchar', nullable: true })
  stateOrRegion!: string | null;

  @Column({ type: 'varchar', nullable: true })
  city!: string | null;

  @Column({ type: 'enum', enum: ProviderStatus, enumName: 'provider_status_enum', default: ProviderStatus.PENDING })
  status!: ProviderStatus;

  @Column({ name: 'onboarding_status', type: 'enum', enum: ProviderOnboardingStatus, enumName: 'provider_onboarding_status_enum', default: ProviderOnboardingStatus.DRAFT })
  onboardingStatus!: ProviderOnboardingStatus;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt!: Date | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @Column({ name: 'reviewed_by_user_id', type: 'uuid', nullable: true })
  reviewedByUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reviewed_by_user_id' })
  reviewedBy!: User | null;

  @Column({ name: 'review_note', type: 'text', nullable: true })
  reviewNote!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @OneToMany(() => ProviderAssignment, (assignment) => assignment.provider)
  assignments!: ProviderAssignment[];

  @OneToMany(() => ProviderService, (service) => service.provider)
  services!: ProviderService[];

  @OneToMany(() => ProviderLocation, (location) => location.provider)
  locations!: ProviderLocation[];

  @OneToMany(() => ProviderAvailability, (availability) => availability.provider)
  availability!: ProviderAvailability[];
  @OneToMany(() => ProviderAvailabilityException, (exception) => exception.provider)
  availabilityExceptions!: ProviderAvailabilityException[];
  @OneToMany(() => ProviderBookingReservation, (reservation) => reservation.provider)
  bookingReservations!: ProviderBookingReservation[];
  @OneToMany(() => ProviderInvitation, (invitation) => invitation.provider)
  invitations!: ProviderInvitation[];
}
