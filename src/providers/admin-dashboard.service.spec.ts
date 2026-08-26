import { AdminDashboardService } from './admin-dashboard.service';
import { ProviderAssignmentStatus } from './enums/provider-assignment-status.enum';
import { HealthCheckEncounterStatus } from '../health-checks/enums/health-check-encounter-status.enum';
import { ProviderOnboardingStatus } from './enums/provider-onboarding-status.enum';
import { ProviderStatus } from './enums/provider-status.enum';

const builder = (raw: object) => {
  const qb: any = {};
  for (const method of ['select', 'addSelect', 'where', 'setParameters']) qb[method] = jest.fn().mockReturnValue(qb);
  qb.getRawOne = jest.fn().mockResolvedValue(raw);
  return qb;
};

describe('AdminDashboardService', () => {
  it('returns authoritative aggregate booking, assignment, encounter, and provider counts', async () => {
    const bookingQb = builder({ awaitingFunding: '12', pendingProviderMatch: '4', scheduled: '18', needsAttention: '2' });
    const providerQb = builder({ pendingReview: '3', active: '21' });
    const assignments = { count: jest.fn().mockResolvedValue(5) };
    const encounters = { count: jest.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(120) };
    const referrals = { adminMetrics: jest.fn().mockResolvedValue({ registered: 20, qualified: 8, level1Achieved: 2, pointsIssued: 900 }) };
    const subject = new AdminDashboardService({ createQueryBuilder: jest.fn().mockReturnValue(bookingQb) } as never, assignments as never, encounters as never, { createQueryBuilder: jest.fn().mockReturnValue(providerQb) } as never, referrals as never);
    await expect(subject.summary(new Date('2026-08-25T08:00:00Z'))).resolves.toEqual({ bookings: { awaitingFunding: 12, pendingProviderMatch: 4, scheduled: 18, needsAttention: 2, inProgress: 3, completed: 120 }, matching: { activeOffers: 5 }, providers: { pendingReview: 3, active: 21 }, referrals: { registered: 20, qualified: 8, level1Achieved: 2, pointsIssued: 900 } });
    expect(assignments.count).toHaveBeenCalledWith({ where: expect.objectContaining({ status: ProviderAssignmentStatus.OFFERED }) });
    expect(encounters.count).toHaveBeenNthCalledWith(1, { where: { status: HealthCheckEncounterStatus.IN_PROGRESS } });
    expect(encounters.count).toHaveBeenNthCalledWith(2, { where: { status: HealthCheckEncounterStatus.COMPLETED } });
    expect(providerQb.where).toHaveBeenCalledWith('provider.deletedAt IS NULL');
    expect(providerQb.setParameters).toHaveBeenCalledWith({ submitted: ProviderOnboardingStatus.SUBMITTED, pending: ProviderStatus.PENDING, active: ProviderStatus.ACTIVE });
  });
});
