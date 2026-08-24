import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { In, LessThanOrEqual, QueryFailedError, Repository } from "typeorm";
import { appConfig } from "../config/app.config";
import { BookingStatusHistory } from "../bookings/entities/booking-status-history.entity";
import { Booking } from "../bookings/entities/booking.entity";
import { BookingStatus } from "../bookings/enums/booking-status.enum";
import { bookingToAvailabilityWindow } from "./booking-availability-context";
import {
  MatchingResultResponseDto,
  ProviderAssignmentResponseDto,
} from "./dto/provider-assignment-response.dto";
import { ProviderAssignmentHistory } from "./entities/provider-assignment-history.entity";
import { ProviderAssignment } from "./entities/provider-assignment.entity";
import { ProviderAssignmentStatus } from "./enums/provider-assignment-status.enum";
import { ProviderCapabilitiesService } from "./provider-capabilities.service";
import { ProviderBookingReservation } from "./entities/provider-booking-reservation.entity";
import { ProviderBookingReservationStatus } from "./enums/provider-booking-reservation-status.enum";
import { Provider } from "./entities/provider.entity";
import { ProviderStatus } from "./enums/provider-status.enum";

const ACTIVE_ASSIGNMENT_STATUSES = [
  ProviderAssignmentStatus.OFFERED,
  ProviderAssignmentStatus.ACCEPTED,
  ProviderAssignmentStatus.CONFIRMED,
];

@Injectable()
export class ProviderMatchingService {
  constructor(
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    @InjectRepository(ProviderAssignment)
    private readonly assignments: Repository<ProviderAssignment>,
    private readonly capabilities: ProviderCapabilitiesService,
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {}

  async startMatching(
    bookingReference: string,
    actorUserId: string | null,
    now = new Date(),
  ): Promise<MatchingResultResponseDto> {
    const booking = await this.requireBookingByReference(bookingReference);
    this.assertCanStartMatching(booking);
    return this.offerNext(booking, actorUserId, now);
  }

  async retryMatching(bookingReference: string, actorUserId: string, now = new Date()): Promise<MatchingResultResponseDto> {
    const booking = await this.requireBookingByReference(bookingReference);
    if (booking.status !== BookingStatus.UNFULFILLABLE)
      throw new ConflictException("Only an unfulfillable booking can be retried through this operation");
    return this.offerNext(booking, actorUserId, now);
  }

  async assignEligibleProvider(
    bookingReference: string,
    providerId: string,
    actorUserId: string,
    now = new Date(),
  ): Promise<MatchingResultResponseDto> {
    const booking = await this.requireBookingByReference(bookingReference);
    this.assertCanStartMatching(booking);
    const context = this.requireAvailabilityContext(booking);
    const eligible = await this.capabilities.findEligibleProviders(
      booking.healthCheckPackageId,
      booking.fulfilmentModeId,
      context,
    );
    if (!eligible.some((service) => service.providerId === providerId))
      throw new ConflictException("Selected provider is not currently eligible for this booking");
    return this.createOfferForProvider(booking, providerId, actorUserId, "MANUAL_PROVIDER_ASSIGNED", null, now, false);
  }

  async assignProviderOverride(
    bookingReference: string,
    providerId: string,
    reason: string,
    actorUserId: string,
    now = new Date(),
  ): Promise<MatchingResultResponseDto> {
    const reasonNote = reason.trim();
    if (reasonNote.length < 3) throw new BadRequestException("Override reason is required");
    const booking = await this.requireBookingByReference(bookingReference);
    this.assertCanStartMatching(booking);
    const context = this.requireAvailabilityContext(booking);
    const provider = await this.assignments.manager.getRepository(Provider).findOne({ where: { id: providerId } });
    if (!provider) throw new NotFoundException("Provider not found");
    if (provider.status !== ProviderStatus.ACTIVE || provider.deletedAt)
      throw new ConflictException("Provider is not operationally active");
    await this.assertCapacityAvailable(providerId, context);
    return this.createOfferForProvider(booking, providerId, actorUserId, "MANUAL_PROVIDER_OVERRIDE", reasonNote, now, false);
  }

  async reassign(
    bookingReference: string,
    actorUserId: string,
    reason: string,
    providerId?: string,
    now = new Date(),
  ): Promise<MatchingResultResponseDto> {
    const reasonNote = reason.trim();
    if (reasonNote.length < 3) throw new BadRequestException("Reassignment reason is required");
    const target = await this.requireBookingByReference(bookingReference);
    await this.assignments.manager.transaction(async (manager) => {
      const bookingRepository = manager.getRepository(Booking);
      const assignmentRepository = manager.getRepository(ProviderAssignment);
      const assignment = await assignmentRepository.findOne({
        where: { bookingId: target.id, status: In(ACTIVE_ASSIGNMENT_STATUSES) },
        order: { createdAt: "DESC", id: "DESC" },
        lock: { mode: "pessimistic_write" },
      });
      if (!assignment) throw new ConflictException("Booking has no active provider assignment to replace");
      const booking = await bookingRepository.findOne({ where: { id: target.id }, lock: { mode: "pessimistic_write" } });
      if (!booking) throw new NotFoundException("Booking not found");
      if (![BookingStatus.PENDING_PROVIDER_MATCH, BookingStatus.PROVIDER_ASSIGNED].includes(booking.status))
        throw new ConflictException(`Booking in ${booking.status} cannot be reassigned`);
      const fromStatus = assignment.status;
      assignment.status = ProviderAssignmentStatus.CANCELLED;
      assignment.respondedAt ??= now;
      assignment.reasonCode = "PROVIDER_REASSIGNED";
      assignment.reasonNote = reasonNote;
      await assignmentRepository.save(assignment);
      await this.appendAssignmentHistory(manager.getRepository(ProviderAssignmentHistory), assignment.id, fromStatus, ProviderAssignmentStatus.CANCELLED, actorUserId, "PROVIDER_REASSIGNED", reasonNote);
      const reservationRepository = manager.getRepository(ProviderBookingReservation);
      const reservation = await reservationRepository.findOne({ where: { providerAssignmentId: assignment.id }, lock: { mode: "pessimistic_write" } });
      if (reservation && [ProviderBookingReservationStatus.HELD, ProviderBookingReservationStatus.CONFIRMED].includes(reservation.status)) {
        reservation.status = ProviderBookingReservationStatus.RELEASED;
        reservation.releasedAt = now;
        await reservationRepository.save(reservation);
      }
      if (booking.status === BookingStatus.PROVIDER_ASSIGNED)
        await this.transitionBooking(bookingRepository, manager.getRepository(BookingStatusHistory), booking, BookingStatus.PENDING_PROVIDER_MATCH, actorUserId, "PROVIDER_REASSIGNED");
    });
    return providerId
      ? this.assignEligibleProvider(bookingReference, providerId, actorUserId, now)
      : this.startMatching(bookingReference, actorUserId, now);
  }

  async acceptOffer(
    assignmentId: string,
    providerId: string,
    now = new Date(),
  ): Promise<ProviderAssignmentResponseDto> {
    const offered = await this.assignments.findOne({
      where: { id: assignmentId },
      relations: { booking: { healthCheckPackage: true } },
    });
    if (!offered) throw new NotFoundException("Provider assignment not found");
    this.assertProviderOwnsOffer(offered, providerId);
    this.assertOfferCanReceiveResponse(offered, now);
    this.assertBookingAwaitingMatch(offered.booking);
    const context = bookingToAvailabilityWindow(offered.booking);
    if (!context.ready)
      throw new BadRequestException({
        message: "Booking scheduling context is incomplete",
        missingFields: context.missingFields,
      });
    if (offered.reasonCode !== "MANUAL_PROVIDER_OVERRIDE") {
      const eligible = await this.capabilities.findEligibleProviders(
        offered.booking.healthCheckPackageId,
        offered.booking.fulfilmentModeId,
        context.window,
      );
      if (!eligible.some((service) => service.providerId === providerId))
        throw new ConflictException(
          "Provider is no longer eligible or has conflicting reserved capacity",
        );
    } else {
      const provider = await this.assignments.manager.getRepository(Provider).findOne({ where: { id: providerId } });
      if (!provider || provider.deletedAt || provider.status !== ProviderStatus.ACTIVE)
        throw new ConflictException("Provider is no longer operationally active");
    }
    try {
      const result = await this.assignments.manager.transaction(
        async (manager) => {
          const assignmentRepository =
            manager.getRepository(ProviderAssignment);
          const bookingRepository = manager.getRepository(Booking);
          const assignment = await assignmentRepository.findOne({
            where: { id: assignmentId },
            lock: { mode: "pessimistic_write" },
          });
          if (!assignment)
            throw new NotFoundException("Provider assignment not found");
          this.assertProviderOwnsOffer(assignment, providerId);
          this.assertOfferCanReceiveResponse(assignment, now);
          const lockedBooking = await bookingRepository.findOne({
            where: { id: assignment.bookingId },
            lock: { mode: "pessimistic_write" },
          });
          if (!lockedBooking) throw new NotFoundException("Booking not found");
          this.assertBookingAwaitingMatch(lockedBooking);
          lockedBooking.healthCheckPackage = offered.booking.healthCheckPackage;
          const lockedContext = bookingToAvailabilityWindow(lockedBooking);
          if (!lockedContext.ready)
            throw new BadRequestException({
              message: "Booking scheduling context is incomplete",
              missingFields: lockedContext.missingFields,
            });
          const reservationRepository = manager.getRepository(
            ProviderBookingReservation,
          );
          await reservationRepository.save(
            reservationRepository.create({
              providerId,
              bookingId: assignment.bookingId,
              providerAssignmentId: assignment.id,
              providerLocationId: null,
              scheduledDate: lockedContext.window.requestedDate,
              startTime: lockedContext.window.requestedStartTime,
              endTime: lockedContext.window.requestedEndTime,
              timezone: lockedContext.window.requestedTimezone,
              status: ProviderBookingReservationStatus.HELD,
              releasedAt: null,
            }),
          );
          assignment.status = ProviderAssignmentStatus.ACCEPTED;
          assignment.respondedAt = now;
          assignment.acceptedAt = now;
          await assignmentRepository.save(assignment);
          await this.appendAssignmentHistory(
            manager.getRepository(ProviderAssignmentHistory),
            assignment.id,
            ProviderAssignmentStatus.OFFERED,
            ProviderAssignmentStatus.ACCEPTED,
            null,
            "PROVIDER_ACCEPTED",
            null,
          );
          assignment.booking = lockedBooking;
          return assignment;
        },
      );
      return ProviderAssignmentResponseDto.fromEntity(result);
    } catch (error) {
      this.rethrowReservationConflict(error);
    }
  }

  async declineOffer(
    assignmentId: string,
    providerId: string,
    reason?: string,
    now = new Date(),
  ): Promise<{
    declined: ProviderAssignmentResponseDto;
    next: MatchingResultResponseDto;
  }> {
    const declined = await this.assignments.manager.transaction(
      async (manager) => {
        const repository = manager.getRepository(ProviderAssignment);
        const bookingRepository = manager.getRepository(Booking);
        const assignment = await repository.findOne({
          where: { id: assignmentId },
          lock: { mode: "pessimistic_write" },
        });
        if (!assignment)
          throw new NotFoundException("Provider assignment not found");
        this.assertProviderOwnsOffer(assignment, providerId);
        this.assertOfferCanReceiveResponse(assignment, now);
        const lockedBooking = await bookingRepository.findOne({
          where: { id: assignment.bookingId },
          lock: { mode: "pessimistic_write" },
        });
        if (!lockedBooking) throw new NotFoundException("Booking not found");
        this.assertBookingAwaitingMatch(lockedBooking);
        assignment.status = ProviderAssignmentStatus.DECLINED;
        assignment.respondedAt = now;
        assignment.reasonCode = "PROVIDER_DECLINED";
        assignment.reasonNote = reason ?? null;
        await repository.save(assignment);
        await this.appendAssignmentHistory(
          manager.getRepository(ProviderAssignmentHistory),
          assignment.id,
          ProviderAssignmentStatus.OFFERED,
          ProviderAssignmentStatus.DECLINED,
          null,
          "PROVIDER_DECLINED",
          reason ?? null,
        );
        assignment.booking = lockedBooking;
        return assignment;
      },
    );
    const booking = await this.requireBookingById(declined.bookingId);
    return {
      declined: ProviderAssignmentResponseDto.fromEntity(declined),
      next: await this.offerNext(booking, null, now),
    };
  }

  async confirmAssignment(
    assignmentId: string,
    actorUserId: string,
    now = new Date(),
  ): Promise<ProviderAssignmentResponseDto> {
    const confirmed = await this.assignments.manager.transaction(
      async (manager) => {
        const assignmentRepository = manager.getRepository(ProviderAssignment);
        const bookingRepository = manager.getRepository(Booking);
        const assignment = await assignmentRepository.findOne({
          where: { id: assignmentId },
          lock: { mode: "pessimistic_write" },
        });
        if (!assignment)
          throw new NotFoundException("Provider assignment not found");
        if (assignment.status !== ProviderAssignmentStatus.ACCEPTED)
          throw new ConflictException(
            "Only an accepted assignment can be confirmed",
          );
        const lockedBooking = await bookingRepository.findOne({
          where: { id: assignment.bookingId },
          lock: { mode: "pessimistic_write" },
        });
        if (!lockedBooking) throw new NotFoundException("Booking not found");
        this.assertBookingAwaitingMatch(lockedBooking);
        if (
          await assignmentRepository.exists({
            where: {
              bookingId: assignment.bookingId,
              status: ProviderAssignmentStatus.CONFIRMED,
            },
          })
        )
          throw new ConflictException(
            "Booking already has a confirmed provider assignment",
          );
        const reservationRepository = manager.getRepository(
          ProviderBookingReservation,
        );
        const reservation = await reservationRepository.findOne({
          where: { providerAssignmentId: assignment.id },
          lock: { mode: "pessimistic_write" },
        });
        if (
          !reservation ||
          reservation.status !== ProviderBookingReservationStatus.HELD
        )
          throw new ConflictException(
            "Accepted assignment does not have an active held reservation",
          );
        reservation.status = ProviderBookingReservationStatus.CONFIRMED;
        await reservationRepository.save(reservation);
        assignment.status = ProviderAssignmentStatus.CONFIRMED;
        assignment.confirmedAt = now;
        await assignmentRepository.save(assignment);
        await this.appendAssignmentHistory(
          manager.getRepository(ProviderAssignmentHistory),
          assignment.id,
          ProviderAssignmentStatus.ACCEPTED,
          ProviderAssignmentStatus.CONFIRMED,
          actorUserId,
          "OPERATIONS_CONFIRMED",
          null,
        );
        await this.transitionBooking(
          bookingRepository,
          manager.getRepository(BookingStatusHistory),
          lockedBooking,
          BookingStatus.PROVIDER_ASSIGNED,
          actorUserId,
          "PROVIDER_ASSIGNMENT_CONFIRMED",
        );
        assignment.booking = lockedBooking;
        return assignment;
      },
    );
    return ProviderAssignmentResponseDto.fromEntity(confirmed);
  }

  async releaseReservationForAssignment(
    assignmentId: string,
    cancelled = false,
    now = new Date(),
  ): Promise<void> {
    await this.assignments.manager.transaction(async (manager) => {
      const repository = manager.getRepository(ProviderBookingReservation);
      const reservation = await repository.findOne({
        where: { providerAssignmentId: assignmentId },
        lock: { mode: "pessimistic_write" },
      });
      if (
        !reservation ||
        ![
          ProviderBookingReservationStatus.HELD,
          ProviderBookingReservationStatus.CONFIRMED,
        ].includes(reservation.status)
      )
        return;
      reservation.status = cancelled
        ? ProviderBookingReservationStatus.CANCELLED
        : ProviderBookingReservationStatus.RELEASED;
      reservation.releasedAt = now;
      await repository.save(reservation);
    });
  }

  async expireStaleOffers(
    actorUserId: string,
    now = new Date(),
  ): Promise<{
    expiredCount: number;
    nextOffers: MatchingResultResponseDto[];
  }> {
    const expired = await this.assignments.manager.transaction(
      async (manager) => {
        const repository = manager.getRepository(ProviderAssignment);
        const stale = await repository.find({
          where: {
            status: ProviderAssignmentStatus.OFFERED,
            expiresAt: LessThanOrEqual(now),
          },
          relations: { booking: true },
        });
        for (const assignment of stale) {
          assignment.status = ProviderAssignmentStatus.EXPIRED;
          assignment.respondedAt = now;
          assignment.reasonCode = "OFFER_TTL_EXPIRED";
          await repository.save(assignment);
          await this.appendAssignmentHistory(
            manager.getRepository(ProviderAssignmentHistory),
            assignment.id,
            ProviderAssignmentStatus.OFFERED,
            ProviderAssignmentStatus.EXPIRED,
            actorUserId,
            "OFFER_TTL_EXPIRED",
            null,
          );
        }
        return stale;
      },
    );
    const nextOffers: MatchingResultResponseDto[] = [];
    for (const assignment of expired) {
      if (assignment.booking.status === BookingStatus.PENDING_PROVIDER_MATCH)
        nextOffers.push(
          await this.offerNext(
            await this.requireBookingById(assignment.bookingId),
            actorUserId,
            now,
          ),
        );
    }
    return { expiredCount: expired.length, nextOffers };
  }

  private async offerNext(
    booking: Booking,
    actorUserId: string | null,
    now: Date,
  ): Promise<MatchingResultResponseDto> {
    const context = this.requireAvailabilityContext(booking);
    const eligible = await this.capabilities.findEligibleProviders(
      booking.healthCheckPackageId,
      booking.fulfilmentModeId,
      context,
    );
    const previous = await this.assignments.find({
      where: { bookingId: booking.id },
    });
    const previousProviderIds = new Set(
      previous.map((assignment) => assignment.providerId),
    );
    const candidate = eligible.find(
      (service) => !previousProviderIds.has(service.providerId),
    );

    return this.createOfferForProvider(booking, candidate?.providerId ?? null, actorUserId, "SEQUENTIAL_ELIGIBILITY", null, now, true);
  }

  private async createOfferForProvider(
    booking: Booking,
    providerId: string | null,
    actorUserId: string | null,
    reasonCode: string,
    reasonNote: string | null,
    now: Date,
    idempotentWhenActive: boolean,
  ): Promise<MatchingResultResponseDto> {
    return this.assignments.manager.transaction(async (manager) => {
      const bookingRepository = manager.getRepository(Booking);
      const assignmentRepository = manager.getRepository(ProviderAssignment);
      const lockedBooking = await bookingRepository.findOne({ where: { id: booking.id }, lock: { mode: "pessimistic_write" } });
      if (!lockedBooking) throw new NotFoundException("Booking not found");
      this.assertCanStartMatching(lockedBooking);
      const activeAssignment = await assignmentRepository.findOne({
        where: { bookingId: lockedBooking.id, status: In(ACTIVE_ASSIGNMENT_STATUSES) },
        order: { createdAt: "DESC", id: "DESC" },
      });
      if (activeAssignment && idempotentWhenActive)
        return { bookingStatus: lockedBooking.status, assignment: ProviderAssignmentResponseDto.fromEntity(activeAssignment) };
      if (activeAssignment)
        throw new ConflictException("Booking already has an active provider offer or assignment");
      if (!providerId) {
        if (lockedBooking.status !== BookingStatus.UNFULFILLABLE)
          await this.transitionBooking(bookingRepository, manager.getRepository(BookingStatusHistory), lockedBooking, BookingStatus.UNFULFILLABLE, actorUserId, actorUserId ? "NO_ELIGIBLE_PROVIDERS_REMAIN" : "AUTO_MATCHING_UNFULFILLABLE");
        return { bookingStatus: BookingStatus.UNFULFILLABLE, assignment: null };
      }
      if (lockedBooking.status === BookingStatus.UNFULFILLABLE)
        await this.transitionBooking(bookingRepository, manager.getRepository(BookingStatusHistory), lockedBooking, BookingStatus.PENDING_PROVIDER_MATCH, actorUserId, "MATCHING_RETRIED");
      const expiresAt = new Date(now.getTime() + this.config.providerMatching.offerTtlMinutes * 60_000);
      const assignment = await assignmentRepository.save(assignmentRepository.create({ bookingId: lockedBooking.id, providerId, status: ProviderAssignmentStatus.OFFERED, offeredAt: now, expiresAt, respondedAt: null, acceptedAt: null, confirmedAt: null, reasonCode, reasonNote }));
      await this.appendAssignmentHistory(manager.getRepository(ProviderAssignmentHistory), assignment.id, null, ProviderAssignmentStatus.OFFERED, actorUserId, reasonCode, reasonNote);
      return { bookingStatus: BookingStatus.PENDING_PROVIDER_MATCH, assignment: ProviderAssignmentResponseDto.fromEntity(assignment) };
    });
  }

  private requireAvailabilityContext(booking: Booking) {
    const context = bookingToAvailabilityWindow(booking);
    if (!context.ready)
      throw new BadRequestException({ message: context.reason === "INVALID_PACKAGE_DURATION" ? "Health Check package duration is missing or invalid" : "Booking scheduling context is incomplete", reason: context.reason, missingFields: context.missingFields });
    if (!booking.healthCheckPackage?.isActive || !booking.fulfilmentMode?.isActive)
      throw new BadRequestException("Booking package or fulfilment mode is inactive");
    return context.window;
  }

  private async assertCapacityAvailable(providerId: string, window: { requestedDate: string; requestedStartTime: string; requestedEndTime: string; requestedTimezone: string }): Promise<void> {
    const conflict = await this.assignments.manager.getRepository(ProviderBookingReservation)
      .createQueryBuilder("reservation")
      .where("reservation.providerId = :providerId", { providerId })
      .andWhere("reservation.scheduledDate = :scheduledDate", { scheduledDate: window.requestedDate })
      .andWhere("reservation.timezone = :timezone", { timezone: window.requestedTimezone })
      .andWhere("reservation.status IN (:...statuses)", { statuses: [ProviderBookingReservationStatus.HELD, ProviderBookingReservationStatus.CONFIRMED] })
      .andWhere("reservation.startTime < :requestedEndTime", { requestedEndTime: window.requestedEndTime })
      .andWhere("reservation.endTime > :requestedStartTime", { requestedStartTime: window.requestedStartTime })
      .getExists();
    if (conflict) throw new ConflictException("Provider already has reserved capacity for the requested window");
  }

  private assertCanStartMatching(booking: Booking): void {
    if (
      [BookingStatus.DRAFT, BookingStatus.AWAITING_FUNDING].includes(
        booking.status,
      )
    )
      throw new ConflictException(
        "Booking funding and lifecycle state do not permit matching",
      );
    if (
      ![
        BookingStatus.PENDING_PROVIDER_MATCH,
        BookingStatus.UNFULFILLABLE,
      ].includes(booking.status)
    )
      throw new ConflictException(
        `Booking in ${booking.status} cannot enter provider matching`,
      );
  }
  private assertBookingAwaitingMatch(booking: Booking): void {
    if (booking.status !== BookingStatus.PENDING_PROVIDER_MATCH)
      throw new ConflictException(
        "Booking is no longer awaiting provider matching",
      );
  }
  private assertProviderOwnsOffer(
    assignment: ProviderAssignment,
    providerId: string,
  ): void {
    if (assignment.providerId !== providerId)
      throw new ConflictException("Provider does not own this offer");
  }
  private assertOfferCanReceiveResponse(
    assignment: ProviderAssignment,
    now: Date,
  ): void {
    if (assignment.status !== ProviderAssignmentStatus.OFFERED)
      throw new ConflictException("Offer is not awaiting a response");
    if (!assignment.expiresAt || assignment.expiresAt <= now)
      throw new ConflictException("Offer has expired");
  }
  private async requireBookingByReference(reference: string): Promise<Booking> {
    const booking = await this.bookings.findOne({
      where: { bookingReference: reference },
      relations: { healthCheckPackage: true, fulfilmentMode: true },
    });
    if (!booking) throw new NotFoundException("Booking not found");
    return booking;
  }
  private async requireBookingById(id: string): Promise<Booking> {
    const booking = await this.bookings.findOne({
      where: { id },
      relations: { healthCheckPackage: true, fulfilmentMode: true },
    });
    if (!booking) throw new NotFoundException("Booking not found");
    return booking;
  }
  private async appendAssignmentHistory(
    repository: Repository<ProviderAssignmentHistory>,
    assignmentId: string,
    fromStatus: ProviderAssignmentStatus | null,
    toStatus: ProviderAssignmentStatus,
    actorUserId: string | null,
    reasonCode: string,
    reasonNote: string | null,
  ): Promise<void> {
    await repository.save(
      repository.create({
        providerAssignmentId: assignmentId,
        fromStatus,
        toStatus,
        actorUserId,
        reasonCode,
        reasonNote,
      }),
    );
  }
  private async transitionBooking(
    bookingRepository: Repository<Booking>,
    historyRepository: Repository<BookingStatusHistory>,
    booking: Booking,
    toStatus: BookingStatus,
    actorUserId: string | null,
    reasonCode: string,
  ): Promise<void> {
    const fromStatus = booking.status;
    booking.status = toStatus;
    await bookingRepository.save(booking);
    await historyRepository.save(
      historyRepository.create({
        bookingId: booking.id,
        fromStatus,
        toStatus,
        actorUserId,
        reasonCode,
        reasonNote: null,
      }),
    );
  }
  private rethrowReservationConflict(error: unknown): never {
    if (
      error instanceof QueryFailedError &&
      [
        "EX_provider_booking_reservations_active_overlap",
        "UQ_provider_booking_reservations_assignment",
      ].includes(
        (error.driverError as { constraint?: string }).constraint ?? "",
      )
    )
      throw new ConflictException(
        "Provider capacity is already reserved for an overlapping booking",
      );
    throw error;
  }
}
