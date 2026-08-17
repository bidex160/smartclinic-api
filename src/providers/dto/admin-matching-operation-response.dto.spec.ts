import { BookingStatus } from '../../bookings/enums/booking-status.enum';
import { ProviderAssignmentStatus } from '../enums/provider-assignment-status.enum';
import { AdminExpireStaleOffersResponseDto, AdminStartMatchingResponseDto, StartMatchingOutcome } from './admin-matching-operation-response.dto';

describe('admin matching operation response DTOs', () => {
  it('maps an offer result to a minimized start-matching response', () => {
    const response = AdminStartMatchingResponseDto.fromDomain('SC-2026-ABCDEF123456', { bookingStatus: BookingStatus.PENDING_PROVIDER_MATCH, assignment: { id: '10000000-0000-4000-8000-000000000001', bookingId: 'secret-booking-id', providerId: 'secret-provider-id', status: ProviderAssignmentStatus.OFFERED, offeredAt: new Date(), expiresAt: new Date('2026-08-24T08:30:00Z'), respondedAt: null, acceptedAt: null, confirmedAt: null, reasonCode: 'SEQUENTIAL_ELIGIBILITY', reasonNote: 'internal context' } });
    expect(response).toEqual({ bookingReference: 'SC-2026-ABCDEF123456', bookingStatus: BookingStatus.PENDING_PROVIDER_MATCH, outcome: StartMatchingOutcome.OFFER_CREATED, assignmentId: '10000000-0000-4000-8000-000000000001', assignmentStatus: ProviderAssignmentStatus.OFFERED, offerExpiresAt: new Date('2026-08-24T08:30:00Z') });
    expect(response).not.toHaveProperty('bookingId'); expect(response).not.toHaveProperty('providerId'); expect(response).not.toHaveProperty('reasonCode'); expect(response).not.toHaveProperty('reasonNote');
  });
  it('maps an unfulfillable result without inventing a separate domain state', () => { expect(AdminStartMatchingResponseDto.fromDomain('SC-2026-ABCDEF123456', { bookingStatus: BookingStatus.UNFULFILLABLE, assignment: null })).toEqual({ bookingReference: 'SC-2026-ABCDEF123456', bookingStatus: BookingStatus.UNFULFILLABLE, outcome: StartMatchingOutcome.UNFULFILLABLE, assignmentId: null, assignmentStatus: null, offerExpiresAt: null }); });
  it('summarizes stale expiry continuation without assignment details', () => {
    const response = AdminExpireStaleOffersResponseDto.fromDomain({ expiredCount: 3, nextOffers: [{ bookingStatus: BookingStatus.PENDING_PROVIDER_MATCH, assignment: { id: 'assignment', bookingId: 'booking', providerId: 'provider', status: ProviderAssignmentStatus.OFFERED, offeredAt: new Date(), expiresAt: new Date(), respondedAt: null, acceptedAt: null, confirmedAt: null, reasonCode: 'internal', reasonNote: null } }, { bookingStatus: BookingStatus.UNFULFILLABLE, assignment: null }] });
    expect(response).toEqual({ expiredCount: 3, continuedMatchingCount: 1, unfulfillableCount: 1 });
    expect(response).not.toHaveProperty('nextOffers'); expect(response).not.toHaveProperty('providerId'); expect(response).not.toHaveProperty('reasonCode');
  });
});
