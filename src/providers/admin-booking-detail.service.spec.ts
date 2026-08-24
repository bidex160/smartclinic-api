import { NotFoundException } from '@nestjs/common';
import { BookingFundingSourceType } from '../bookings/enums/booking-funding-source-type.enum';
import { BookingFundingStatus } from '../bookings/enums/booking-funding-status.enum';
import { BookingStatus } from '../bookings/enums/booking-status.enum';
import { PaymentAttemptStatus } from '../payments/enums/payment-attempt-status.enum';
import { AdminBookingDetailService } from './admin-booking-detail.service';
import { MatchingQueueReadiness } from './enums/matching-queue-readiness.enum';
import { ProviderAssignmentStatus } from './enums/provider-assignment-status.enum';

const booking = (changes = {}) => ({ id: 'booking-id', bookingReference: 'SC-2026-ABCDEF123456', status: BookingStatus.PENDING_PROVIDER_MATCH, createdAt: new Date('2026-08-01T00:00:00Z'), updatedAt: new Date('2026-08-02T00:00:00Z'), healthCheckPackage: { code: 'ESSENTIAL', name: 'Essential', estimatedDurationMinutes: 15 }, fulfilmentMode: { code: 'HOME_VISIT', name: 'Home visit' }, participant: { givenName: 'Ada', familyName: 'Okafor', dateOfBirth: '1990-01-01', phone: 'private' }, contact: { givenName: 'Chidi', familyName: 'Okafor', email: 'chidi@example.test', phone: '+2348000000000' }, booker: null, preferredDate: '2026-09-01', preferredTimeWindowStart: '09:00', preferredTimeWindowEnd: null, preferredTimezone: 'Africa/Lagos', preferredLocationNote: 'Ikeja area', scheduledDate: '2026-09-02', scheduledTimeFrom: '11:00', scheduledTimeTo: '12:00', scheduledTimezone: 'Africa/Lagos', scheduledAt: new Date('2026-08-03T11:00:00Z'), providerLocation: null, quotedAmount: '12500.00', currency: 'NGN', ...changes });
const funding = (changes = {}) => ({ id: 'funding-id', bookingId: 'booking-id', sourceType: BookingFundingSourceType.SELF, status: BookingFundingStatus.SETTLED, amount: '12500.00', currency: 'NGN', responsibleUserId: 'secret-user', ...changes });
const attempt = (changes = {}) => ({ id: 'attempt-id', bookingFundingId: 'funding-id', status: PaymentAttemptStatus.SUCCEEDED, providerReference: 'SC-PAY-safe', providerCode: 'PAYSTACK', checkoutUrl: 'private-checkout', createdAt: new Date(), ...changes });
const assignment = (status: ProviderAssignmentStatus) => ({ id: 'assignment-id', bookingId: 'booking-id', providerId: 'provider-id', status, offeredAt: new Date('2026-08-03T10:00:00Z'), acceptedAt: status === ProviderAssignmentStatus.ACCEPTED || status === ProviderAssignmentStatus.CONFIRMED ? new Date('2026-08-03T10:05:00Z') : null, confirmedAt: status === ProviderAssignmentStatus.CONFIRMED ? new Date('2026-08-03T10:10:00Z') : null, expiresAt: new Date('2026-08-03T10:30:00Z'), createdAt: new Date(), provider: { displayName: 'SmartClinic Ikeja', professionalReference: 'private' } });

describe('AdminBookingDetailService', () => {
  let bookings: any, fundings: any, attempts: any, transactions: any, assignments: any, subject: AdminBookingDetailService;
  beforeEach(() => {
    bookings = { findOne: jest.fn().mockResolvedValue(booking()) };
    fundings = { findOne: jest.fn().mockResolvedValue(funding()) };
    attempts = { findOne: jest.fn().mockResolvedValue(attempt()) };
    transactions = { findOne: jest.fn().mockResolvedValue({ id: 'transaction-secret', providerReference: 'provider-secret', occurredAt: new Date('2026-08-03T09:00:00Z') }) };
    assignments = { findOne: jest.fn().mockResolvedValue(null) };
    subject = new AdminBookingDetailService(bookings, fundings, attempts, transactions, assignments);
  });

  it('returns a minimized operational booking detail with guest contact', async () => {
    const result: any = await subject.get('SC-2026-ABCDEF123456');
    expect(result).toMatchObject({ bookingReference: 'SC-2026-ABCDEF123456', participant: { givenName: 'Ada', familyName: 'Okafor' }, bookerContact: { givenName: 'Chidi', familyName: 'Okafor', email: 'chidi@example.test', phone: '+2348000000000' }, payment: { status: PaymentAttemptStatus.SUCCEEDED, paymentReference: 'SC-PAY-safe' }, readiness: MatchingQueueReadiness.INCOMPLETE_VISIT_ADDRESS });
    expect(result).toMatchObject({ preferredDate: '2026-09-01', confirmedSchedule: { date: '2026-09-02', timeFrom: '11:00', timeTo: '12:00', timezone: 'Africa/Lagos', providerLocation: null } });
    expect(result.participant).not.toHaveProperty('dateOfBirth'); expect(result).not.toHaveProperty('bookerUserId'); expect(result).not.toHaveProperty('history'); expect(result.payment).not.toHaveProperty('providerCode'); expect(JSON.stringify(result)).not.toContain('private-checkout'); expect(JSON.stringify(result)).not.toContain('provider-secret');
  });

  it('returns 404 for an unknown booking', async () => { bookings.findOne.mockResolvedValue(null); await expect(subject.get('SC-2026-UNKNOWN000000')).rejects.toBeInstanceOf(NotFoundException); });
  it('represents absent funding, payment, and assignment safely', async () => { fundings.findOne.mockResolvedValue(null); attempts.findOne.mockClear(); const result = await subject.get('SC-2026-ABCDEF123456'); expect(result.funding).toEqual({ fundingStatus: null, fundingType: null, amount: null, currency: null }); expect(result.payment).toEqual({ status: null, paymentReference: null, paidAt: null }); expect(result.assignment.assignmentId).toBeNull(); expect(result.readiness).toBe(MatchingQueueReadiness.FUNDING_INCOMPLETE); expect(attempts.findOne).not.toHaveBeenCalled(); });
  it('represents funding awaiting payment with no attempt', async () => { fundings.findOne.mockResolvedValue(funding({ status: BookingFundingStatus.PENDING })); attempts.findOne.mockResolvedValue(null); const result = await subject.get('SC-2026-ABCDEF123456'); expect(result.funding.fundingStatus).toBe(BookingFundingStatus.PENDING); expect(result.payment.status).toBeNull(); expect(result.readiness).toBe(MatchingQueueReadiness.FUNDING_INCOMPLETE); });
  it('returns the successful payment timestamp without transaction internals', async () => { const result: any = await subject.get('SC-2026-ABCDEF123456'); expect(result.payment.paidAt).toEqual(new Date('2026-08-03T09:00:00Z')); expect(result.payment).toEqual({ status: PaymentAttemptStatus.SUCCEEDED, paymentReference: 'SC-PAY-safe', paidAt: new Date('2026-08-03T09:00:00Z') }); });

  it.each([[ProviderAssignmentStatus.OFFERED, MatchingQueueReadiness.ACTIVE_OFFER], [ProviderAssignmentStatus.ACCEPTED, MatchingQueueReadiness.ACCEPTED_AWAITING_CONFIRMATION], [ProviderAssignmentStatus.CONFIRMED, MatchingQueueReadiness.ALREADY_ASSIGNED]])('summarizes the latest %s assignment', async (status, readiness) => { assignments.findOne.mockResolvedValue(assignment(status)); const result = await subject.get('SC-2026-ABCDEF123456'); expect(result.assignment).toMatchObject({ assignmentId: 'assignment-id', assignmentStatus: status, providerId: 'provider-id', providerName: 'SmartClinic Ikeja' }); expect(result.readiness).toBe(readiness); expect(assignments.findOne).toHaveBeenCalledWith(expect.objectContaining({ order: { createdAt: 'DESC', id: 'DESC' } })); });
});
