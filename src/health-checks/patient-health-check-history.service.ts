import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Booking } from '../bookings/entities/booking.entity';
import { Patient } from '../patients/entities/patient.entity';
import { PatientStatus } from '../patients/enums/patient-status.enum';
import { ProviderAssignment } from '../providers/entities/provider-assignment.entity';
import { ProviderAssignmentStatus } from '../providers/enums/provider-assignment-status.enum';
import { User } from '../users/entities/user.entity';
import { PatientHealthCheckHistoryQueryDto } from './dto/patient-health-check-history-query.dto';
import { PatientHealthCheckHistoryItemDto, PatientHealthCheckHistoryResponseDto } from './dto/patient-health-check-history-response.dto';
import { HealthCheckEncounter } from './entities/health-check-encounter.entity';
import { HealthCheckEncounterStatus } from './enums/health-check-encounter-status.enum';
import { BookingFunding } from '../bookings/entities/booking-funding.entity';
import { BookingFundingSourceType } from '../bookings/enums/booking-funding-source-type.enum';
import { PaymentAttempt } from '../payments/entities/payment-attempt.entity';
import { BookingFundingStatus } from '../bookings/enums/booking-funding-status.enum';
import { BookingStatus } from '../bookings/enums/booking-status.enum';
import { PatientHealthCheckDetailResponseDto, PatientHealthCheckPortalCategory } from './dto/patient-health-check-history-response.dto';

@Injectable()
export class PatientHealthCheckHistoryService {
  constructor(@InjectRepository(Booking) private readonly bookings: Repository<Booking>, @InjectRepository(Patient) private readonly patients: Repository<Patient>, @InjectRepository(HealthCheckEncounter) private readonly encounters: Repository<HealthCheckEncounter>, @InjectRepository(ProviderAssignment) private readonly assignments: Repository<ProviderAssignment>, @InjectRepository(BookingFunding) private readonly funding: Repository<BookingFunding>, @InjectRepository(PaymentAttempt) private readonly attempts: Repository<PaymentAttempt>) {}

  async list(user: User, query: PatientHealthCheckHistoryQueryDto): Promise<PatientHealthCheckHistoryResponseDto> {
    const patient = await this.patients.findOne({ where: { userId: user.id }, withDeleted: true });
    if (!patient || patient.deletedAt || patient.status !== PatientStatus.ACTIVE) return this.empty(query);
    const builder = this.bookings.createQueryBuilder('booking').innerJoinAndSelect('booking.healthCheckPackage', 'package').innerJoinAndSelect('booking.fulfilmentMode', 'fulfilmentMode').leftJoinAndSelect('booking.providerLocation', 'providerLocation').leftJoinAndSelect('booking.visitAddress', 'visitAddress').where('booking.participantPatientId = :patientId', { patientId: patient.id });
    if (query.bookingStatus) builder.andWhere('booking.status = :bookingStatus', { bookingStatus: query.bookingStatus });
    if (query.encounterStatus) builder.andWhere(`EXISTS (SELECT 1 FROM health_check_encounters filtered_encounter WHERE filtered_encounter.booking_id = booking.id AND filtered_encounter.status = :encounterStatus)`, { encounterStatus: query.encounterStatus });
    builder.orderBy('booking.createdAt', 'DESC').addOrderBy('booking.bookingReference', 'DESC').skip((query.page - 1) * query.limit).take(query.limit);
    const [bookings, total] = await builder.getManyAndCount(); const bookingIds = bookings.map((booking) => booking.id);
    const encounters = bookingIds.length ? await this.encounters.find({ where: { bookingId: In(bookingIds) } }) : [];
    const assignments = bookingIds.length ? await this.assignments.find({ where: { bookingId: In(bookingIds), status: ProviderAssignmentStatus.CONFIRMED }, relations: { provider: true }, order: { createdAt: 'DESC', id: 'DESC' } }) : [];
    const fundingRows = bookingIds.length ? await this.funding.find({ where: { bookingId: In(bookingIds), sourceType: BookingFundingSourceType.SELF } }) : [];
    const fundingIds = fundingRows.map((value) => value.id); const attemptRows = fundingIds.length ? await this.attempts.find({ where: { bookingFundingId: In(fundingIds) }, order: { createdAt: 'DESC', id: 'DESC' } }) : [];
    const encounterByBooking = new Map(encounters.map((encounter) => [encounter.bookingId, encounter])); const providerByBooking = new Map<string, string>();
    for (const assignment of assignments) if (!providerByBooking.has(assignment.bookingId)) providerByBooking.set(assignment.bookingId, assignment.provider.displayName);
    const fundingByBooking = new Map(fundingRows.map((value) => [value.bookingId, value])); const attemptByFunding = new Map<string, PaymentAttempt>(); for (const attempt of attemptRows) if (!attemptByFunding.has(attempt.bookingFundingId)) attemptByFunding.set(attempt.bookingFundingId, attempt);
    return { items: bookings.map((booking) => { const funding = fundingByBooking.get(booking.id) ?? null; return this.map(booking, encounterByBooking.get(booking.id) ?? null, providerByBooking.get(booking.id) ?? null, funding, funding ? attemptByFunding.get(funding.id) ?? null : null); }), page: query.page, limit: query.limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / query.limit) };
  }

  async get(user: User, reference: string): Promise<PatientHealthCheckDetailResponseDto> {
    const patient = await this.patients.findOne({ where: { userId: user.id }, withDeleted: true });
    if (!patient || patient.deletedAt || patient.status !== PatientStatus.ACTIVE) this.notFound();
    const booking = await this.bookings.findOne({ where: { bookingReference: reference, participantPatientId: patient.id }, relations: { healthCheckPackage: true, fulfilmentMode: true, providerLocation: true, visitAddress: true } });
    if (!booking) this.notFound();
    const encounter = await this.encounters.findOne({ where: { bookingId: booking.id } });
    const assignment = await this.assignments.findOne({ where: { bookingId: booking.id, status: ProviderAssignmentStatus.CONFIRMED }, relations: { provider: true }, order: { createdAt: 'DESC', id: 'DESC' } });
    const funding = await this.funding.findOne({ where: { bookingId: booking.id, sourceType: BookingFundingSourceType.SELF } });
    const attempt = funding ? await this.attempts.findOne({ where: { bookingFundingId: funding.id }, order: { createdAt: 'DESC', id: 'DESC' } }) : null;
    return { ...this.map(booking, encounter, assignment?.provider.displayName ?? null, funding, attempt), visitAddress: booking.fulfilmentMode.code === 'HOME_VISIT' && booking.visitAddress ? { addressLine1: booking.visitAddress.addressLine1, addressLine2: booking.visitAddress.addressLine2, city: booking.visitAddress.city, stateOrRegion: booking.visitAddress.stateOrRegion, postalCode: booking.visitAddress.postalCode, countryCode: booking.visitAddress.countryCode } : null };
  }

  private map(booking: Booking, encounter: HealthCheckEncounter | null, providerDisplayName: string | null, funding: BookingFunding | null, attempt: PaymentAttempt | null): PatientHealthCheckHistoryItemDto { const completed = encounter?.status === HealthCheckEncounterStatus.COMPLETED; const providerLocation = booking.providerLocation ? { name: booking.providerLocation.name, addressLine1: booking.providerLocation.addressLine1, addressLine2: booking.providerLocation.addressLine2, city: booking.providerLocation.city, stateOrRegion: booking.providerLocation.state, postalCode: booking.providerLocation.postalCode, countryCode: booking.providerLocation.countryCode } : null; return { bookingReference: booking.bookingReference, bookingStatus: booking.status, createdAt: booking.createdAt, updatedAt: booking.updatedAt, healthCheckPackage: { code: booking.healthCheckPackage.code, name: booking.healthCheckPackage.name }, fulfilmentMode: { code: booking.fulfilmentMode.code, name: booking.fulfilmentMode.name }, preferredDate: booking.preferredDate, preferredTimeFrom: booking.preferredTimeWindowStart, preferredTimeTo: booking.preferredTimeWindowEnd, preferredTimezone: booking.preferredTimezone, visitAddressSummary: booking.visitAddress ? { city: booking.visitAddress.city, stateOrRegion: booking.visitAddress.stateOrRegion, countryCode: booking.visitAddress.countryCode } : null, confirmedSchedule: booking.scheduledDate ? { date: booking.scheduledDate, timeFrom: booking.scheduledTimeFrom!, timeTo: booking.scheduledTimeTo!, timezone: booking.scheduledTimezone!, providerLocationName: providerLocation?.name ?? null, providerLocation } : null, providerDisplayName, encounterStatus: encounter?.status ?? null, startedAt: encounter?.startedAt ?? null, completedAt: encounter?.completedAt ?? null, hasCompletedResult: completed, portalCategory: this.category(booking.status, completed, funding?.status ?? null), fundingStatus: funding?.status ?? null, checkoutOption: funding?.checkoutOption ?? null, paymentStatus: attempt?.status ?? null }; }
  private category(status: BookingStatus, completed: boolean, fundingStatus: BookingFundingStatus | null): PatientHealthCheckPortalCategory { if (completed) return PatientHealthCheckPortalCategory.COMPLETED_HISTORY; if ([BookingStatus.DRAFT, BookingStatus.AWAITING_FUNDING].includes(status) || fundingStatus !== BookingFundingStatus.SETTLED) return PatientHealthCheckPortalCategory.AWAITING_PAYMENT; if ([BookingStatus.UNFULFILLABLE].includes(status)) return PatientHealthCheckPortalCategory.NEEDS_ATTENTION; if ([BookingStatus.CANCELLED, BookingStatus.EXPIRED].includes(status)) return PatientHealthCheckPortalCategory.CLOSED; return PatientHealthCheckPortalCategory.UPCOMING_ACTIVE; }
  private notFound(): never { throw new NotFoundException('Health Check was not found for the authenticated patient'); }
  private empty(query: PatientHealthCheckHistoryQueryDto): PatientHealthCheckHistoryResponseDto { return { items: [], page: query.page, limit: query.limit, total: 0, totalPages: 0 }; }
}
