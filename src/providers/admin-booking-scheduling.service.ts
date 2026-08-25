import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { BookingStatusHistory } from '../bookings/entities/booking-status-history.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { BookingStatus } from '../bookings/enums/booking-status.enum';
import { FulfilmentMode } from '../health-checks/entities/fulfilment-mode.entity';
import { HealthCheckPackage } from '../health-checks/entities/health-check-package.entity';
import { AdminBookingScheduleResponseDto } from './dto/admin-booking-schedule-response.dto';
import { ScheduleBookingDto } from './dto/schedule-booking.dto';
import { ProviderAssignment } from './entities/provider-assignment.entity';
import { ProviderBookingReservation } from './entities/provider-booking-reservation.entity';
import { ProviderLocation } from './entities/provider-location.entity';
import { Provider } from './entities/provider.entity';
import { ProviderAssignmentStatus } from './enums/provider-assignment-status.enum';
import { ProviderBookingReservationStatus } from './enums/provider-booking-reservation-status.enum';
import { ProviderStatus } from './enums/provider-status.enum';
import { ProviderCapabilitiesService } from './provider-capabilities.service';
import { BookingVisitAddress } from '../bookings/entities/booking-visit-address.entity';

@Injectable()
export class AdminBookingSchedulingService {
  constructor(@InjectRepository(Booking) private readonly bookings: Repository<Booking>, private readonly capabilities: ProviderCapabilitiesService) {}

  async schedule(reference: string, actorUserId: string, dto: ScheduleBookingDto): Promise<AdminBookingScheduleResponseDto> {
    if (this.seconds(dto.timeFrom) >= this.seconds(dto.timeTo)) throw new BadRequestException('timeFrom must be before timeTo and overnight appointments are not supported');
    try {
      return await this.bookings.manager.transaction(async (manager) => {
        const bookingRepository = manager.getRepository(Booking);
        const booking = await bookingRepository.findOne({ where: { bookingReference: reference }, lock: { mode: 'pessimistic_write' } });
        if (!booking) throw new NotFoundException('Booking not found');
        const assignment = await manager.getRepository(ProviderAssignment).findOne({ where: { bookingId: booking.id, status: ProviderAssignmentStatus.CONFIRMED }, lock: { mode: 'pessimistic_write' } });
        if (!assignment) throw new ConflictException('Booking requires a confirmed provider assignment before scheduling');
        const provider = await manager.getRepository(Provider).findOne({ where: { id: assignment.providerId }, withDeleted: true });
        if (!provider || provider.deletedAt || provider.status !== ProviderStatus.ACTIVE) throw new ConflictException('Confirmed provider is not operationally active');
        const [healthCheckPackage, fulfilmentMode] = await Promise.all([
          manager.getRepository(HealthCheckPackage).findOne({ where: { id: booking.healthCheckPackageId } }),
          manager.getRepository(FulfilmentMode).findOne({ where: { id: booking.fulfilmentModeId } }),
        ]);
        if (!healthCheckPackage?.isActive || !fulfilmentMode?.isActive) throw new ConflictException('Booking package or fulfilment mode is inactive');
        const requestedLocationId = dto.providerLocationId ?? null;
        if (fulfilmentMode.code === 'PROVIDER_LOCATION' && !requestedLocationId) throw new BadRequestException('providerLocationId is required for PROVIDER_LOCATION scheduling');
        if (fulfilmentMode.code === 'HOME_VISIT' && requestedLocationId) throw new BadRequestException('providerLocationId must be omitted for HOME_VISIT scheduling');
        const visitAddress = ['HOME_VISIT', 'PROVIDER_LOCATION'].includes(fulfilmentMode.code) ? booking.visitAddress ?? await manager.getRepository(BookingVisitAddress).findOne({ where: { bookingId: booking.id } }) : null;
        if (['HOME_VISIT', 'PROVIDER_LOCATION'].includes(fulfilmentMode.code) && !visitAddress) throw new ConflictException('Booking requires a structured visit address for this fulfilment mode');
        if (booking.status === BookingStatus.SCHEDULED) {
          if (!this.sameSchedule(booking, dto, requestedLocationId)) throw new ConflictException('Booking is already scheduled with different appointment details');
          const existingLocation = requestedLocationId ? await manager.getRepository(ProviderLocation).findOne({ where: { id: requestedLocationId } }) : null;
          return this.response(booking, provider, existingLocation, assignment.status);
        }
        if (booking.status !== BookingStatus.PROVIDER_ASSIGNED) throw new ConflictException(`Booking in ${booking.status} cannot be scheduled`);
        const reservationRepository = manager.getRepository(ProviderBookingReservation);
        const reservation = await reservationRepository.findOne({ where: { providerAssignmentId: assignment.id }, lock: { mode: 'pessimistic_write' } });
        if (!reservation || reservation.bookingId !== booking.id || reservation.providerId !== provider.id || reservation.status !== ProviderBookingReservationStatus.CONFIRMED) throw new ConflictException('Confirmed assignment does not have a valid confirmed capacity reservation');
        const eligible = await this.capabilities.findEligibleProviders(booking.healthCheckPackageId, booking.fulfilmentModeId, { requestedDate: dto.date, requestedStartTime: dto.timeFrom, requestedEndTime: dto.timeTo, requestedTimezone: dto.timezone, visitAddress }, assignment.id);
        const capability = eligible.find((service) => service.providerId === provider.id);
        if (!capability) throw new ConflictException('Confirmed provider is unavailable or ineligible for the requested appointment');
        let location: ProviderLocation | null = null;
        if (requestedLocationId) {
          location = await manager.getRepository(ProviderLocation).findOne({ where: { id: requestedLocationId }, withDeleted: true });
          if (!location || !location.isActive || location.providerId !== provider.id || !capability.providerLocationIds.includes(location.id)) throw new ConflictException('Provider location is not active and linked to the confirmed capability');
        }
        reservation.scheduledDate = dto.date; reservation.startTime = dto.timeFrom; reservation.endTime = dto.timeTo; reservation.timezone = dto.timezone; reservation.providerLocationId = requestedLocationId; reservation.releasedAt = null;
        await reservationRepository.save(reservation);
        booking.scheduledDate = dto.date; booking.scheduledTimeFrom = dto.timeFrom; booking.scheduledTimeTo = dto.timeTo; booking.scheduledTimezone = dto.timezone; booking.providerLocationId = requestedLocationId; booking.scheduledAt = new Date(); booking.scheduledByUserId = actorUserId; booking.status = BookingStatus.SCHEDULED;
        await bookingRepository.save(booking);
        const history = manager.getRepository(BookingStatusHistory); await history.save(history.create({ bookingId: booking.id, fromStatus: BookingStatus.PROVIDER_ASSIGNED, toStatus: BookingStatus.SCHEDULED, actorUserId, reasonCode: 'BOOKING_SCHEDULED', reasonNote: null }));
        return this.response(booking, provider, location, assignment.status);
      });
    } catch (error) {
      if (error instanceof QueryFailedError && (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23P01') throw new ConflictException('Provider capacity conflicts with another scheduled booking');
      throw error;
    }
  }

  private sameSchedule(booking: Booking, dto: ScheduleBookingDto, locationId: string | null): boolean { return booking.scheduledDate === dto.date && this.time(booking.scheduledTimeFrom) === this.time(dto.timeFrom) && this.time(booking.scheduledTimeTo) === this.time(dto.timeTo) && booking.scheduledTimezone === dto.timezone && booking.providerLocationId === locationId; }
  private time(value: string | null): string | null { return value?.slice(0, 5) ?? null; }
  private seconds(value: string): number { const [hour, minute] = value.split(':').map(Number); return hour * 3600 + minute * 60; }
  private response(booking: Booking, provider: Provider, location: ProviderLocation | null, assignmentStatus: ProviderAssignmentStatus): AdminBookingScheduleResponseDto { return { bookingReference: booking.bookingReference, bookingStatus: booking.status, scheduledDate: booking.scheduledDate!, scheduledTimeFrom: booking.scheduledTimeFrom!, scheduledTimeTo: booking.scheduledTimeTo!, scheduledTimezone: booking.scheduledTimezone!, provider: { displayName: provider.displayName }, providerLocation: location ? { id: location.id, name: location.name, addressLine1: location.addressLine1, addressLine2: location.addressLine2, city: location.city, state: location.state, countryCode: location.countryCode } : null, assignmentStatus }; }
}
