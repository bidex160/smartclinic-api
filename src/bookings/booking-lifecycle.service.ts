import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { ProviderAssignmentHistory } from '../providers/entities/provider-assignment-history.entity';
import { ProviderAssignment } from '../providers/entities/provider-assignment.entity';
import { ProviderBookingReservation } from '../providers/entities/provider-booking-reservation.entity';
import { ProviderAssignmentStatus } from '../providers/enums/provider-assignment-status.enum';
import { ProviderBookingReservationStatus } from '../providers/enums/provider-booking-reservation-status.enum';
import { validateBookingSchedulingPreference } from './booking-scheduling';
import { AdminBookingLifecycleResponseDto } from './dto/admin-booking-lifecycle-response.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { RescheduleBookingDto } from './dto/reschedule-booking.dto';
import { BookingStatusHistory } from './entities/booking-status-history.entity';
import { Booking } from './entities/booking.entity';
import { BookingStatus } from './enums/booking-status.enum';

const ACTIONABLE_ASSIGNMENTS = [ProviderAssignmentStatus.OFFERED, ProviderAssignmentStatus.ACCEPTED, ProviderAssignmentStatus.CONFIRMED];
const ACTIVE_RESERVATIONS = [ProviderBookingReservationStatus.HELD, ProviderBookingReservationStatus.CONFIRMED];

@Injectable()
export class BookingLifecycleService {
  constructor(@InjectRepository(Booking) private readonly bookings: Repository<Booking>) {}

  async cancelBooking(reference: string, actorUserId: string, dto: CancelBookingDto): Promise<AdminBookingLifecycleResponseDto> {
    return this.bookings.manager.transaction(async (manager) => {
      const booking = await this.requireLockedBooking(manager, reference);
      if (booking.status === BookingStatus.CANCELLED) throw new ConflictException('Booking is already cancelled');
      if (booking.status === BookingStatus.COMPLETED) throw new ConflictException('Completed bookings cannot be cancelled');
      if (booking.status === BookingStatus.EXPIRED) throw new ConflictException('Expired bookings cannot be cancelled; expiry is already terminal');
      const impact = await this.closeAssignmentsAndReservations(manager, booking.id, actorUserId, dto.reasonCode ?? 'BOOKING_CANCELLED', dto.reason ?? null, ProviderBookingReservationStatus.CANCELLED);
      const fromStatus = booking.status; booking.status = BookingStatus.CANCELLED; booking.cancellationReason = dto.reason ?? null;
      await manager.getRepository(Booking).save(booking);
      await this.appendBookingHistory(manager, booking.id, fromStatus, BookingStatus.CANCELLED, actorUserId, dto.reasonCode ?? 'BOOKING_CANCELLED', dto.reason ?? null);
      return AdminBookingLifecycleResponseDto.fromEntity(booking, impact.assignments, impact.reservations);
    });
  }

  async rescheduleBooking(reference: string, actorUserId: string, dto: RescheduleBookingDto): Promise<AdminBookingLifecycleResponseDto> {
    validateBookingSchedulingPreference({ preferredDate: dto.preferredDate, preferredTimeWindowStart: dto.preferredTimeFrom, preferredTimeWindowEnd: null, preferredTimezone: dto.preferredTimezone });
    return this.bookings.manager.transaction(async (manager) => {
      const booking = await this.requireLockedBooking(manager, reference);
      if ([BookingStatus.CANCELLED, BookingStatus.COMPLETED, BookingStatus.EXPIRED, BookingStatus.IN_PROGRESS].includes(booking.status)) throw new ConflictException(`Booking in ${booking.status} cannot be rescheduled`);
      const impact = await this.closeAssignmentsAndReservations(manager, booking.id, actorUserId, 'BOOKING_RESCHEDULED', null, ProviderBookingReservationStatus.RELEASED);
      const fromStatus = booking.status;
      const toStatus = [BookingStatus.DRAFT, BookingStatus.AWAITING_FUNDING].includes(fromStatus) ? fromStatus : BookingStatus.PENDING_PROVIDER_MATCH;
      booking.preferredDate = dto.preferredDate; booking.preferredTimeWindowStart = dto.preferredTimeFrom; booking.preferredTimeWindowEnd = null; booking.preferredTimezone = dto.preferredTimezone;
      booking.scheduledDate = null; booking.scheduledTimeFrom = null; booking.scheduledTimeTo = null; booking.scheduledTimezone = null; booking.providerLocationId = null; booking.scheduledAt = null; booking.scheduledByUserId = null; booking.scheduledStartsAt = null; booking.scheduledEndsAt = null; booking.status = toStatus;
      await manager.getRepository(Booking).save(booking);
      await this.appendBookingHistory(manager, booking.id, fromStatus, toStatus, actorUserId, 'BOOKING_RESCHEDULED', 'Scheduling context updated; fresh provider matching required where applicable');
      return AdminBookingLifecycleResponseDto.fromEntity(booking, impact.assignments, impact.reservations);
    });
  }

  private async closeAssignmentsAndReservations(manager: EntityManager, bookingId: string, actorUserId: string, reasonCode: string, reasonNote: string | null, reservationStatus: ProviderBookingReservationStatus) {
    const assignments = await manager.getRepository(ProviderAssignment).find({ where: { bookingId, status: In(ACTIONABLE_ASSIGNMENTS) }, lock: { mode: 'pessimistic_write' } });
    let reservationCount = 0;
    if (assignments.length) {
      const reservations = await manager.getRepository(ProviderBookingReservation).find({ where: { providerAssignmentId: In(assignments.map((assignment) => assignment.id)), status: In(ACTIVE_RESERVATIONS) }, lock: { mode: 'pessimistic_write' } });
      for (const reservation of reservations) { reservation.status = reservationStatus; reservation.releasedAt = new Date(); await manager.getRepository(ProviderBookingReservation).save(reservation); reservationCount += 1; }
      for (const assignment of assignments) { const fromStatus = assignment.status; assignment.status = ProviderAssignmentStatus.CANCELLED; assignment.reasonCode = reasonCode; assignment.reasonNote = reasonNote; await manager.getRepository(ProviderAssignment).save(assignment); const history = manager.getRepository(ProviderAssignmentHistory); await history.save(history.create({ providerAssignmentId: assignment.id, fromStatus, toStatus: ProviderAssignmentStatus.CANCELLED, actorUserId, reasonCode, reasonNote })); }
    }
    return { assignments: assignments.length, reservations: reservationCount };
  }
  private async requireLockedBooking(manager: EntityManager, reference: string) { const booking = await manager.getRepository(Booking).findOne({ where: { bookingReference: reference }, lock: { mode: 'pessimistic_write' } }); if (!booking) throw new NotFoundException('Booking not found'); return booking; }
  private async appendBookingHistory(manager: EntityManager, bookingId: string, fromStatus: BookingStatus, toStatus: BookingStatus, actorUserId: string, reasonCode: string, reasonNote: string | null) { const history = manager.getRepository(BookingStatusHistory); await history.save(history.create({ bookingId, fromStatus, toStatus, actorUserId, reasonCode, reasonNote })); }
}
