import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { Provider } from './provider.entity';
import { ProviderServiceLocation } from './provider-service-location.entity';
import { ProviderAvailability } from './provider-availability.entity';
import { ProviderAvailabilityException } from './provider-availability-exception.entity';
import { ProviderBookingReservation } from './provider-booking-reservation.entity';

@Entity('provider_locations')
@Unique('UQ_provider_locations_id_provider', ['id', 'providerId'])
@Index('IDX_provider_locations_provider_active', ['providerId', 'isActive'])
@Index('IDX_provider_locations_active_place', ['isActive', 'countryCode', 'state', 'city'])
@Check('CHK_provider_locations_country_code', `"country_code" ~ '^[A-Z]{2}$'`)
@Check('CHK_provider_locations_latitude', '"latitude" IS NULL OR ("latitude" >= -90 AND "latitude" <= 90)')
@Check('CHK_provider_locations_longitude', '"longitude" IS NULL OR ("longitude" >= -180 AND "longitude" <= 180)')
export class ProviderLocation {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'provider_id', type: 'uuid' }) providerId!: string;
  @ManyToOne(() => Provider, (provider) => provider.locations, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'provider_id' }) provider!: Provider;
  @Column({ type: 'varchar' }) name!: string;
  @Column({ name: 'address_line_1', type: 'varchar' }) addressLine1!: string;
  @Column({ name: 'address_line_2', type: 'varchar', nullable: true }) addressLine2!: string | null;
  @Column({ type: 'varchar' }) city!: string;
  @Column({ type: 'varchar' }) state!: string;
  @Column({ name: 'country_code', type: 'char', length: 2 }) countryCode!: string;
  @Column({ type: 'decimal', precision: 9, scale: 6, nullable: true }) latitude!: string | null;
  @Column({ type: 'decimal', precision: 9, scale: 6, nullable: true }) longitude!: string | null;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
  @OneToMany(() => ProviderServiceLocation, (link) => link.providerLocation) serviceLinks!: ProviderServiceLocation[];
  @OneToMany(() => ProviderAvailability, (availability) => availability.providerLocation) availability!: ProviderAvailability[];
  @OneToMany(() => ProviderAvailabilityException, (exception) => exception.providerLocation) availabilityExceptions!: ProviderAvailabilityException[];
  @OneToMany(() => ProviderBookingReservation, (reservation) => reservation.providerLocation) bookingReservations!: ProviderBookingReservation[];
}
