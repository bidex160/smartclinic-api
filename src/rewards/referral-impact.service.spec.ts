import { ReferralImpactService, safePublicName } from './referral-impact.service';

describe('ReferralImpactService', () => {
  const summary = {
    referralCode: 'SC-ABC123',
    links: { PATIENT: '/register?ref=SC-ABC123', CLINIC: '/provider/register?ref=SC-ABC123&type=CLINIC', LABORATORY: '/provider/register?ref=SC-ABC123&type=LABORATORY', PHARMACY: '/provider/register?ref=SC-ABC123&type=PHARMACY' },
    availablePoints: 400, reservedPoints: 100, lifetimeEarnedPoints: 1000, lifetimeRedeemedPoints: 500,
    levelProgress: { currentLevel: { code: 'LEVEL_2', name: 'Level 2', ordinal: 2 }, nextLevel: { code: 'LEVEL_3', name: 'Level 3', ordinal: 3 }, highestLevelAchieved: 2, requirements: [], highestConfiguredLevelReached: false, qualifiedCounts: { PATIENT: 22, CLINIC: 5, LABORATORY: 4, PHARMACY: 4 } },
    registeredDirectReferrals: 40, qualifiedDirectReferrals: 35, pendingDirectReferrals: 3,
  } as any;

  it('formats a minimized public display name', () => {
    expect(safePublicName('  Tosin Adeyemi ')).toBe('Tosin A.');
    expect(safePublicName('Tosin')).toBe('Tosin');
    expect(safePublicName(null)).toBe('SmartClinic Member');
  });

  it('returns deterministic aggregate leaderboards without private fields', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ userId: 'u1', displayName: 'Tosin Adeyemi', points: '1000', referrals: '35', city: 'Ibadan', country: 'NG', level: 'Level 2', email: 'must-not-leak@example.com' }])
      .mockResolvedValueOnce([{ name: 'Ibadan', points: '1000' }])
      .mockResolvedValueOnce([{ name: 'NG', points: '1000' }]);
    const service = new ReferralImpactService({ query } as any, {} as any, {} as any);
    const result = await service.leaderboard();
    expect(result).toEqual({ people: [{ name: 'Tosin A.', points: 1000, referrals: 35, city: 'Ibadan', country: 'NG', level: 'Level 2' }], cities: [{ name: 'Ibadan', points: 1000 }], countries: [{ name: 'NG', points: 1000 }] });
    expect(result.people[0]).not.toHaveProperty('email');
    for (const [sql, parameters] of query.mock.calls) {
      expect(sql).toContain('u.public_leaderboard = true');
      expect(sql).toContain("direction = 'CREDIT'");
      expect(sql).toContain("status = 'QUALIFIED'");
      expect(sql).toContain('definition.ordinal DESC');
      expect(sql).toContain('LIMIT $1');
      expect(parameters).toEqual([20]);
    }
  });

  it('returns an empty public response when nobody opted in', async () => {
    const service = new ReferralImpactService({ query: jest.fn().mockResolvedValue([]) } as any, {} as any, {} as any);
    await expect(service.leaderboard()).resolves.toEqual({ people: [], cities: [], countries: [] });
  });

  it('lets the authenticated user opt out and back in without changing other account fields', async () => {
    const update = jest.fn().mockResolvedValue({ affected: 1 });
    const service = new ReferralImpactService({} as any, { update } as any, {} as any);
    await expect(service.updatePreference('user-1', false)).resolves.toEqual({ publicLeaderboard: false });
    expect(update).toHaveBeenNthCalledWith(1, { id: 'user-1' }, { publicLeaderboard: false });
    await expect(service.updatePreference('user-1', true)).resolves.toEqual({ publicLeaderboard: true });
    expect(update).toHaveBeenNthCalledWith(2, { id: 'user-1' }, { publicLeaderboard: true });
  });

  it('composes impact from existing summary and returns rank only for opted-in users', async () => {
    const query = jest.fn().mockResolvedValue([{ position: '12' }]);
    const users = { findOne: jest.fn().mockResolvedValue({ id: 'u1', publicLeaderboard: true }) };
    const service = new ReferralImpactService({ query } as any, users as any, { summary: jest.fn().mockResolvedValue(summary) } as any);
    const result = await service.impact('u1');
    expect(result).toMatchObject({
      referralCode: 'SC-ABC123', balances: { availablePoints: 400, reservedPoints: 100, lifetimeEarnedPoints: 1000, lifetimeRedeemedPoints: 500 },
      qualifiedCounts: summary.levelProgress.qualifiedCounts,
      summary: { registeredReferrals: 40, qualifiedReferrals: 35, pendingReferrals: 3 },
      leaderboard: { optedIn: true, position: 12 },
    });
    expect(result).not.toHaveProperty('userId');
  });

  it('does not perform a ranking query for an opted-out user', async () => {
    const query = jest.fn();
    const service = new ReferralImpactService({ query } as any, { findOne: jest.fn().mockResolvedValue({ id: 'u1', publicLeaderboard: false }) } as any, { summary: jest.fn().mockResolvedValue(summary) } as any);
    await expect(service.impact('u1')).resolves.toMatchObject({ leaderboard: { optedIn: false, position: null } });
    expect(query).not.toHaveBeenCalled();
  });

  it('makes a default-participating user rankable without changing ranking mathematics', async () => {
    const query = jest.fn().mockResolvedValue([{ position: '4' }]);
    const users = { findOne: jest.fn().mockResolvedValue({ id: 'new-user', publicLeaderboard: true }) };
    const service = new ReferralImpactService({ query } as any, users as any, { summary: jest.fn().mockResolvedValue(summary) } as any);

    await expect(service.impact('new-user')).resolves.toMatchObject({
      leaderboard: { optedIn: true, position: 4 },
    });
    expect(query.mock.calls[0][0]).toContain('ROW_NUMBER() OVER (ORDER BY points DESC, referrals DESC, "userId" ASC)');
  });
});
