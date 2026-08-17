import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, Repository } from 'typeorm';
import { appConfig } from '../config/app.config';
import { BookingStatusHistory } from '../bookings/entities/booking-status-history.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { BookingStatus } from '../bookings/enums/booking-status.enum';
import { bookingToAvailabilityWindow } from './booking-availability-context';
import { MatchingResultResponseDto, ProviderAssignmentResponseDto } from './dto/provider-assignment-response.dto';
import { ProviderAssignmentHistory } from './entities/provider-assignment-history.entity';
import { ProviderAssignment } from './entities/provider-assignment.entity';
import { ProviderAssignmentStatus } from './enums/provider-assignment-status.enum';
import { ProviderCapabilitiesService } from './provider-capabilities.service';

const ACTIVE_ASSIGNMENT_STATUSES = [ProviderAssignmentStatus.OFFERED, ProviderAssignmentStatus.ACCEPTED, ProviderAssignmentStatus.CONFIRMED];

@Injectable()
export class ProviderMatchingService {
  constructor(
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    @InjectRepository(ProviderAssignment) private readonly assignments: Repository<ProviderAssignment>,
    private readonly capabilities: ProviderCapabilitiesService,
    @Inject(appConfig.KEY) private readonly config: ConfigType<typeof appConfig>,
  ) {}

  async startMatching(bookingReference: string, actorUserId: string, now = new Date()): Promise<MatchingResultResponseDto> {
    const booking = await this.requireBookingByReference(bookingReference);
    this.assertCanStartMatching(booking);
    return this.offerNext(booking, actorUserId, now);
  }

  async acceptOffer(assignmentId: string, providerId: string, now = new Date()): Promise<ProviderAssignmentResponseDto> {
    const result = await this.assignments.manager.transaction(async (manager) => {
      const assignmentRepository = manager.getRepository(ProviderAssignment);
      const assignment = await assignmentRepository.findOne({ where: { id: assignmentId }, relations: { booking: true }, lock: { mode: 'pessimistic_write' } });
      if (!assignment) throw new NotFoundException('Provider assignment not found');
      this.assertProviderOwnsOffer(assignment, providerId);
      this.assertOfferCanReceiveResponse(assignment, now);
      this.assertBookingAwaitingMatch(assignment.booking);
      assignment.status = ProviderAssignmentStatus.ACCEPTED;
      assignment.respondedAt = now;
      assignment.acceptedAt = now;
      await assignmentRepository.save(assignment);
      await this.appendAssignmentHistory(manager.getRepository(ProviderAssignmentHistory), assignment.id, ProviderAssignmentStatus.OFFERED, ProviderAssignmentStatus.ACCEPTED, null, 'PROVIDER_ACCEPTED', null);
      return assignment;
    });
    return ProviderAssignmentResponseDto.fromEntity(result);
  }

  async declineOffer(assignmentId: string, providerId: string, reason?: string, now = new Date()): Promise<{ declined: ProviderAssignmentResponseDto; next: MatchingResultResponseDto }> {
    const declined = await this.assignments.manager.transaction(async (manager) => {
      const repository = manager.getRepository(ProviderAssignment);
      const assignment = await repository.findOne({ where: { id: assignmentId }, relations: { booking: true }, lock: { mode: 'pessimistic_write' } });
      if (!assignment) throw new NotFoundException('Provider assignment not found');
      this.assertProviderOwnsOffer(assignment, providerId);
      this.assertOfferCanReceiveResponse(assignment, now);
      this.assertBookingAwaitingMatch(assignment.booking);
      assignment.status = ProviderAssignmentStatus.DECLINED;
      assignment.respondedAt = now;
      assignment.reasonCode = 'PROVIDER_DECLINED';
      assignment.reasonNote = reason ?? null;
      await repository.save(assignment);
      await this.appendAssignmentHistory(manager.getRepository(ProviderAssignmentHistory), assignment.id, ProviderAssignmentStatus.OFFERED, ProviderAssignmentStatus.DECLINED, null, 'PROVIDER_DECLINED', reason ?? null);
      return assignment;
    });
    const booking = await this.requireBookingById(declined.bookingId);
    return { declined: ProviderAssignmentResponseDto.fromEntity(declined), next: await this.offerNext(booking, null, now) };
  }

  async confirmAssignment(assignmentId: string, actorUserId: string, now = new Date()): Promise<ProviderAssignmentResponseDto> {
    const confirmed = await this.assignments.manager.transaction(async (manager) => {
      const assignmentRepository = manager.getRepository(ProviderAssignment);
      const bookingRepository = manager.getRepository(Booking);
      const assignment = await assignmentRepository.findOne({ where: { id: assignmentId }, relations: { booking: true }, lock: { mode: 'pessimistic_write' } });
      if (!assignment) throw new NotFoundException('Provider assignment not found');
      if (assignment.status !== ProviderAssignmentStatus.ACCEPTED) throw new ConflictException('Only an accepted assignment can be confirmed');
      this.assertBookingAwaitingMatch(assignment.booking);
      if (await assignmentRepository.exists({ where: { bookingId: assignment.bookingId, status: ProviderAssignmentStatus.CONFIRMED } })) throw new ConflictException('Booking already has a confirmed provider assignment');
      assignment.status = ProviderAssignmentStatus.CONFIRMED;
      assignment.confirmedAt = now;
      await assignmentRepository.save(assignment);
      await this.appendAssignmentHistory(manager.getRepository(ProviderAssignmentHistory), assignment.id, ProviderAssignmentStatus.ACCEPTED, ProviderAssignmentStatus.CONFIRMED, actorUserId, 'OPERATIONS_CONFIRMED', null);
      await this.transitionBooking(bookingRepository, manager.getRepository(BookingStatusHistory), assignment.booking, BookingStatus.PROVIDER_ASSIGNED, actorUserId, 'PROVIDER_ASSIGNMENT_CONFIRMED');
      return assignment;
    });
    return ProviderAssignmentResponseDto.fromEntity(confirmed);
  }

  async expireStaleOffers(actorUserId: string, now = new Date()): Promise<{ expiredCount: number; nextOffers: MatchingResultResponseDto[] }> {
    const expired = await this.assignments.manager.transaction(async (manager) => {
      const repository = manager.getRepository(ProviderAssignment);
      const stale = await repository.find({ where: { status: ProviderAssignmentStatus.OFFERED, expiresAt: LessThanOrEqual(now) }, relations: { booking: true } });
      for (const assignment of stale) {
        assignment.status = ProviderAssignmentStatus.EXPIRED;
        assignment.respondedAt = now;
        assignment.reasonCode = 'OFFER_TTL_EXPIRED';
        await repository.save(assignment);
        await this.appendAssignmentHistory(manager.getRepository(ProviderAssignmentHistory), assignment.id, ProviderAssignmentStatus.OFFERED, ProviderAssignmentStatus.EXPIRED, actorUserId, 'OFFER_TTL_EXPIRED', null);
      }
      return stale;
    });
    const nextOffers: MatchingResultResponseDto[] = [];
    for (const assignment of expired) {
      if (assignment.booking.status === BookingStatus.PENDING_PROVIDER_MATCH) nextOffers.push(await this.offerNext(await this.requireBookingById(assignment.bookingId), actorUserId, now));
    }
    return { expiredCount: expired.length, nextOffers };
  }

  private async offerNext(booking: Booking, actorUserId: string | null, now: Date): Promise<MatchingResultResponseDto> {
    const context = bookingToAvailabilityWindow(booking);
    if (!context.ready) throw new BadRequestException({ message: 'Booking scheduling context is incomplete', missingFields: context.missingFields });
    if (!booking.healthCheckPackage?.isActive || !booking.fulfilmentMode?.isActive) throw new BadRequestException('Booking package or fulfilment mode is inactive');
    const eligible = await this.capabilities.findEligibleProviders(booking.healthCheckPackageId, booking.fulfilmentModeId, context.window);
    const previous = await this.assignments.find({ where: { bookingId: booking.id } });
    const previousProviderIds = new Set(previous.map((assignment) => assignment.providerId));
    const candidate = eligible.find((service) => !previousProviderIds.has(service.providerId));

    return this.assignments.manager.transaction(async (manager) => {
      const bookingRepository = manager.getRepository(Booking);
      const assignmentRepository = manager.getRepository(ProviderAssignment);
      const lockedBooking = await bookingRepository.findOne({ where: { id: booking.id }, relations: { healthCheckPackage: true, fulfilmentMode: true }, lock: { mode: 'pessimistic_write' } });
      if (!lockedBooking) throw new NotFoundException('Booking not found');
      this.assertCanStartMatching(lockedBooking);
      if (await assignmentRepository.exists({ where: { bookingId: booking.id, status: In(ACTIVE_ASSIGNMENT_STATUSES) } })) throw new ConflictException('Booking already has an active provider offer or assignment');

      if (!candidate) {
        if (lockedBooking.status !== BookingStatus.UNFULFILLABLE) await this.transitionBooking(bookingRepository, manager.getRepository(BookingStatusHistory), lockedBooking, BookingStatus.UNFULFILLABLE, actorUserId, 'NO_ELIGIBLE_PROVIDERS_REMAIN');
        return { bookingStatus: BookingStatus.UNFULFILLABLE, assignment: null };
      }
      if (lockedBooking.status === BookingStatus.UNFULFILLABLE) await this.transitionBooking(bookingRepository, manager.getRepository(BookingStatusHistory), lockedBooking, BookingStatus.PENDING_PROVIDER_MATCH, actorUserId, 'MATCHING_RETRIED');
      const offeredAt = now;
      const expiresAt = new Date(offeredAt.getTime() + this.config.providerMatching.offerTtlMinutes * 60_000);
      const assignment = await assignmentRepository.save(assignmentRepository.create({ bookingId: booking.id, providerId: candidate.providerId, status: ProviderAssignmentStatus.OFFERED, offeredAt, expiresAt, respondedAt: null, acceptedAt: null, confirmedAt: null, reasonCode: 'SEQUENTIAL_ELIGIBILITY', reasonNote: null }));
      await this.appendAssignmentHistory(manager.getRepository(ProviderAssignmentHistory), assignment.id, null, ProviderAssignmentStatus.OFFERED, actorUserId, 'SEQUENTIAL_ELIGIBILITY', null);
      return { bookingStatus: BookingStatus.PENDING_PROVIDER_MATCH, assignment: ProviderAssignmentResponseDto.fromEntity(assignment) };
    });
  }

  private assertCanStartMatching(booking: Booking): void {
    if ([BookingStatus.DRAFT, BookingStatus.AWAITING_FUNDING].includes(booking.status)) throw new ConflictException('Booking funding and lifecycle state do not permit matching');
    if (![BookingStatus.PENDING_PROVIDER_MATCH, BookingStatus.UNFULFILLABLE].includes(booking.status)) throw new ConflictException(`Booking in ${booking.status} cannot enter provider matching`);
  }
  private assertBookingAwaitingMatch(booking: Booking): void { if (booking.status !== BookingStatus.PENDING_PROVIDER_MATCH) throw new ConflictException('Booking is no longer awaiting provider matching'); }
  private assertProviderOwnsOffer(assignment: ProviderAssignment, providerId: string): void { if (assignment.providerId !== providerId) throw new ConflictException('Provider does not own this offer'); }
  private assertOfferCanReceiveResponse(assignment: ProviderAssignment, now: Date): void { if (assignment.status !== ProviderAssignmentStatus.OFFERED) throw new ConflictException('Offer is not awaiting a response'); if (!assignment.expiresAt || assignment.expiresAt <= now) throw new ConflictException('Offer has expired'); }
  private async requireBookingByReference(reference: string): Promise<Booking> { const booking = await this.bookings.findOne({ where: { bookingReference: reference }, relations: { healthCheckPackage: true, fulfilmentMode: true } }); if (!booking) throw new NotFoundException('Booking not found'); return booking; }
  private async requireBookingById(id: string): Promise<Booking> { const booking = await this.bookings.findOne({ where: { id }, relations: { healthCheckPackage: true, fulfilmentMode: true } }); if (!booking) throw new NotFoundException('Booking not found'); return booking; }
  private async appendAssignmentHistory(repository: Repository<ProviderAssignmentHistory>, assignmentId: string, fromStatus: ProviderAssignmentStatus | null, toStatus: ProviderAssignmentStatus, actorUserId: string | null, reasonCode: string, reasonNote: string | null): Promise<void> { await repository.save(repository.create({ providerAssignmentId: assignmentId, fromStatus, toStatus, actorUserId, reasonCode, reasonNote })); }
  private async transitionBooking(bookingRepository: Repository<Booking>, historyRepository: Repository<BookingStatusHistory>, booking: Booking, toStatus: BookingStatus, actorUserId: string | null, reasonCode: string): Promise<void> { const fromStatus = booking.status; booking.status = toStatus; await bookingRepository.save(booking); await historyRepository.save(historyRepository.create({ bookingId: booking.id, fromStatus, toStatus, actorUserId, reasonCode, reasonNote: null })); }
}
