import { BookingFundingStatus } from '../bookings/enums/booking-funding-status.enum';
import { BookingStatus } from '../bookings/enums/booking-status.enum';
import { AdminMatchingQueueService } from './admin-matching-queue.service';
import { MatchingQueueReadiness } from './enums/matching-queue-readiness.enum';
import { ProviderAssignmentStatus } from './enums/provider-assignment-status.enum';
import { deriveMatchingReadiness } from './matching-readiness';

const booking = (changes: Record<string, unknown> = {}) => ({ id: 'booking-1', bookingReference: 'SC-2026-000000000001', status: BookingStatus.PENDING_PROVIDER_MATCH, healthCheckPackageId: '10000000-0000-4000-8000-000000000001', fulfilmentModeId: '20000000-0000-4000-8000-000000000001', healthCheckPackage: { code: 'ESSENTIAL', name: 'Essential', estimatedDurationMinutes: 15 }, fulfilmentMode: { code: 'HOME_VISIT', name: 'Home visit' }, participant: { givenName: 'Ada', familyName: 'Okafor', phone: 'private', dateOfBirth: '1990-01-01' }, preferredDate: '2026-09-01', preferredTimeWindowStart: '09:00', preferredTimeWindowEnd: null, preferredTimezone: 'Africa/Lagos', quotedAmount: '12500.00', currency: 'NGN', createdAt: new Date('2026-08-01T00:00:00Z'), updatedAt: new Date('2026-08-02T00:00:00Z'), ...changes });
const funding = (changes = {}) => ({ id: 'funding', bookingId: 'booking-1', status: BookingFundingStatus.SETTLED, ...changes });
const assignment = (changes = {}) => ({ id: 'assignment', bookingId: 'booking-1', status: ProviderAssignmentStatus.OFFERED, createdAt: new Date(), provider: { displayName: 'SmartClinic Ikeja', userId: 'secret' }, ...changes });

describe('AdminMatchingQueueService', () => {
  let builder: any, fundingRepository: any, assignmentRepository: any, subject: AdminMatchingQueueService;
  beforeEach(() => {
    builder = { leftJoinAndSelect: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(), addOrderBy: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), take: jest.fn().mockReturnThis(), getManyAndCount: jest.fn().mockResolvedValue([[booking()], 1]) };
    fundingRepository = { find: jest.fn().mockResolvedValue([funding()]) };
    assignmentRepository = { find: jest.fn().mockResolvedValue([]) };
    subject = new AdminMatchingQueueService({ createQueryBuilder: jest.fn().mockReturnValue(builder) } as never, fundingRepository, assignmentRepository);
  });

  it('defaults to funded PENDING_PROVIDER_MATCH bookings in deterministic oldest-first order', async () => {
    const result = await subject.list({ page: 1, limit: 25 });
    expect(builder.where).toHaveBeenCalledWith('booking.status = :bookingStatus', { bookingStatus: BookingStatus.PENDING_PROVIDER_MATCH });
    expect(builder.andWhere).toHaveBeenCalledWith(expect.stringContaining('ready_funding.status'), expect.objectContaining({ settledFunding: BookingFundingStatus.SETTLED }));
    expect(builder.orderBy).toHaveBeenCalledWith('booking.createdAt', 'ASC');
    expect(builder.addOrderBy).toHaveBeenCalledWith('booking.bookingReference', 'ASC');
    expect(result.items[0].readiness).toBe(MatchingQueueReadiness.READY);
  });

  it('maps only safe operational data', async () => {
    assignmentRepository.find.mockResolvedValue([assignment()]);
    const item: any = (await subject.list({ page: 1, limit: 25 })).items[0];
    expect(item).toMatchObject({ bookingReference: 'SC-2026-000000000001', participant: { givenName: 'Ada', familyName: 'Okafor' }, currentAssignmentStatus: ProviderAssignmentStatus.OFFERED, currentProviderName: 'SmartClinic Ikeja', readiness: MatchingQueueReadiness.ACTIVE_OFFER });
    expect(item).not.toHaveProperty('id'); expect(item).not.toHaveProperty('funding'); expect(item).not.toHaveProperty('providerReference'); expect(item.participant).not.toHaveProperty('phone'); expect(item.participant).not.toHaveProperty('dateOfBirth');
  });

  it.each([
    [{ preferredTimezone: null }, funding(), null, MatchingQueueReadiness.INCOMPLETE_SCHEDULING],
    [{}, funding({ status: BookingFundingStatus.PENDING }), null, MatchingQueueReadiness.FUNDING_INCOMPLETE],
    [{}, funding(), assignment(), MatchingQueueReadiness.ACTIVE_OFFER],
    [{}, funding(), assignment({ status: ProviderAssignmentStatus.ACCEPTED }), MatchingQueueReadiness.ACCEPTED_AWAITING_CONFIRMATION],
    [{ status: BookingStatus.PROVIDER_ASSIGNED }, funding(), assignment({ status: ProviderAssignmentStatus.CONFIRMED }), MatchingQueueReadiness.ALREADY_ASSIGNED],
    [{ status: BookingStatus.UNFULFILLABLE }, funding(), null, MatchingQueueReadiness.UNFULFILLABLE],
  ])('derives readiness without persisting it', (bookingChanges, fundingRow, assignmentRow, expected) => {
    expect(deriveMatchingReadiness(booking(bookingChanges as any) as any, fundingRow as any, assignmentRow as any)).toBe(expected);
  });

  it('applies useful filters and paginates deterministically', async () => {
    const query: any = { bookingStatus: BookingStatus.UNFULFILLABLE, packageId: '10000000-0000-4000-8000-000000000001', fulfilmentModeId: '20000000-0000-4000-8000-000000000001', preferredDate: '2026-09-01', providerAssignmentStatus: ProviderAssignmentStatus.EXPIRED, bookingReference: 'SC-2026-000000000001', page: 2, limit: 10 };
    const result = await subject.list(query);
    expect(builder.andWhere).toHaveBeenCalledWith('booking.healthCheckPackageId = :packageId', { packageId: query.packageId });
    expect(builder.andWhere).toHaveBeenCalledWith('booking.fulfilmentModeId = :fulfilmentModeId', { fulfilmentModeId: query.fulfilmentModeId });
    expect(builder.andWhere).toHaveBeenCalledWith('booking.bookingReference = :bookingReference', { bookingReference: query.bookingReference });
    expect(builder.andWhere).toHaveBeenCalledWith(expect.stringContaining('latest_assignment.status'), { assignmentStatus: ProviderAssignmentStatus.EXPIRED });
    expect(builder.skip).toHaveBeenCalledWith(10); expect(builder.take).toHaveBeenCalledWith(10);
    expect(result).toMatchObject({ page: 2, limit: 10, total: 1, totalPages: 1 });
  });

  it('selects the latest assignment returned by createdAt then id ordering', async () => {
    assignmentRepository.find.mockResolvedValue([assignment({ id: 'new', status: ProviderAssignmentStatus.DECLINED }), assignment({ id: 'old', status: ProviderAssignmentStatus.OFFERED })]);
    const result = await subject.list({ page: 1, limit: 25 });
    expect(assignmentRepository.find).toHaveBeenCalledWith(expect.objectContaining({ order: { createdAt: 'DESC', id: 'DESC' } }));
    expect(result.items[0].currentAssignmentStatus).toBe(ProviderAssignmentStatus.DECLINED);
  });
});
