import { ProviderDashboardService } from './provider-dashboard.service';
import { ProviderAssignmentStatus } from './enums/provider-assignment-status.enum';
import { HealthCheckEncounterStatus } from '../health-checks/enums/health-check-encounter-status.enum';

describe('ProviderDashboardService', () => {
  it('derives provider identity and returns only aggregate operational counts', async () => {
    const assignments = { count: jest.fn().mockResolvedValue(3) };
    const qb: any = {};
    for (const method of ['innerJoin', 'where', 'andWhere', 'select', 'addSelect']) qb[method] = jest.fn().mockReturnValue(qb);
    qb.getRawOne = jest.fn().mockResolvedValue({ today: '2', upcoming: '7' });
    const bookings = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    const encounters = { count: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(42) };
    const currentProvider = { resolve: jest.fn().mockResolvedValue({ id: 'provider-a' }) };
    const referrals = { summary: jest.fn().mockResolvedValue({ availablePoints: 220, reservedPoints: 30, levelProgress: { currentLevel: null, nextLevel: { code: 'LEVEL_1', name: 'Level 1', ordinal: 1 }, requirements: [{ targetType: 'PATIENT', qualified: 3, required: 10, remaining: 7, completed: false }], highestConfiguredLevelReached: false, qualifiedCounts: { PATIENT: 3, CLINIC: 1, LABORATORY: 0, PHARMACY: 0 } } }) };
    const subject = new ProviderDashboardService(assignments as never, bookings as never, encounters as never, currentProvider as never, referrals as never);
    const result = await subject.summary({ id: 'user-a' } as never, new Date('2026-08-25T08:00:00Z'));
    expect(currentProvider.resolve).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-a' }));
    expect(assignments.count).toHaveBeenCalledWith({ where: expect.objectContaining({ providerId: 'provider-a', status: ProviderAssignmentStatus.OFFERED }) });
    expect(qb.innerJoin).toHaveBeenCalledWith('provider_assignments', 'assignment', expect.stringContaining('assignment.provider_id = :providerId'), expect.objectContaining({ providerId: 'provider-a' }));
    expect(qb.select).toHaveBeenCalledWith(expect.stringContaining('AT TIME ZONE booking.scheduledTimezone'), 'today');
    expect(encounters.count).toHaveBeenNthCalledWith(1, { where: { providerId: 'provider-a', status: HealthCheckEncounterStatus.IN_PROGRESS } });
    expect(encounters.count).toHaveBeenNthCalledWith(2, { where: { providerId: 'provider-a', status: HealthCheckEncounterStatus.COMPLETED } });
    expect(result).toEqual({ offers: { new: 3 }, appointments: { today: 2, upcoming: 7 }, healthChecks: { inProgress: 1, completed: 42 }, referrals: { availablePoints: 220, reservedPoints: 30, currentLevel: null, nextLevel: { code: 'LEVEL_1', name: 'Level 1', ordinal: 1 }, nextLevelRequirements: [{ targetType: 'PATIENT', qualified: 3, required: 10, remaining: 7, completed: false }], highestConfiguredLevelReached: false, qualifiedPatients: 3, qualifiedClinics: 1, qualifiedLaboratories: 0, qualifiedPharmacies: 0 } });
    expect(result).not.toHaveProperty('earnings');
    expect(JSON.stringify(result)).not.toContain('provider-a');
  });
});
