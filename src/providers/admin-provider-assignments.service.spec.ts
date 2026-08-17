import { NotFoundException } from '@nestjs/common';
import { BookingStatus } from '../bookings/enums/booking-status.enum';
import { AdminProviderAssignmentsService } from './admin-provider-assignments.service';
import { ProviderAssignmentStatus } from './enums/provider-assignment-status.enum';

const assignment = (changes = {}) => ({
  id: '10000000-0000-4000-8000-000000000001', providerId: '20000000-0000-4000-8000-000000000001', status: ProviderAssignmentStatus.DECLINED,
  offeredAt: new Date('2026-08-24T08:00:00Z'), expiresAt: new Date('2026-08-24T08:30:00Z'), respondedAt: new Date('2026-08-24T08:10:00Z'), acceptedAt: null, confirmedAt: null, reasonNote: 'Unavailable',
  provider: { id: '20000000-0000-4000-8000-000000000001', displayName: 'Smart Clinic Ikeja', userId: 'secret-user-id' },
  booking: { id: 'secret-booking-id', bookingReference: 'SC-2026-ABCDEF123456', status: BookingStatus.PENDING_PROVIDER_MATCH, preferredDate: '2026-08-24', preferredTimeWindowStart: '09:00', preferredTimeWindowEnd: '11:00', preferredTimezone: 'Africa/Lagos', bookerUserId: 'secret-booker', healthCheckPackage: { code: 'ESSENTIAL', name: 'Essential Health Check' }, fulfilmentMode: { code: 'HOME_VISIT', name: 'Home visit' }, participant: { givenName: 'Ada', familyName: 'Okafor', phone: '+2348000000000', email: 'private@example.test' }, funding: [{ amount: '1.00' }] },
  ...changes,
});

describe('AdminProviderAssignmentsService', () => {
  let repository: any, subject: AdminProviderAssignmentsService;
  beforeEach(() => { repository = { find: jest.fn().mockResolvedValue([assignment()]), findOne: jest.fn().mockResolvedValue(assignment()) }; subject = new AdminProviderAssignmentsService(repository); });
  it('lists assignments in a safe operational shape', async () => { const result = await subject.list({}); expect(result[0]).toMatchObject({ assignmentId: expect.any(String), provider: { displayName: 'Smart Clinic Ikeja' }, bookingReference: 'SC-2026-ABCDEF123456', bookingStatus: BookingStatus.PENDING_PROVIDER_MATCH, declineReason: 'Unavailable' }); expect(result[0]).not.toHaveProperty('bookingId'); expect(result[0]).not.toHaveProperty('bookerUserId'); expect(result[0].participant).toEqual({ givenName: 'Ada', familyName: 'Okafor' }); expect(result[0].participant).not.toHaveProperty('phone'); expect(result[0]).not.toHaveProperty('funding'); expect(result[0]).not.toHaveProperty('history'); });
  it('filters by status', async () => { await subject.list({ status: ProviderAssignmentStatus.ACCEPTED }); expect(repository.find).toHaveBeenCalledWith(expect.objectContaining({ where: { status: ProviderAssignmentStatus.ACCEPTED } })); });
  it('filters by booking reference and provider', async () => { await subject.list({ bookingReference: 'SC-2026-ABCDEF123456', providerId: '20000000-0000-4000-8000-000000000001' }); expect(repository.find).toHaveBeenCalledWith(expect.objectContaining({ where: { providerId: '20000000-0000-4000-8000-000000000001', booking: { bookingReference: 'SC-2026-ABCDEF123456' } } })); });
  it('gets one assignment', async () => expect(subject.get('10000000-0000-4000-8000-000000000001')).resolves.toMatchObject({ assignmentId: '10000000-0000-4000-8000-000000000001' }));
  it('returns 404 for a missing assignment', async () => { repository.findOne.mockResolvedValue(null); await expect(subject.get('10000000-0000-4000-8000-000000000099')).rejects.toBeInstanceOf(NotFoundException); });
});
