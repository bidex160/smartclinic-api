import { BadRequestException } from '@nestjs/common';
import { HealthCheckEncounter } from '../health-checks/entities/health-check-encounter.entity';
import { Provider } from '../providers/entities/provider.entity';
import { ProviderOnboardingStatus } from '../providers/enums/provider-onboarding-status.enum';
import { ProviderStatus } from '../providers/enums/provider-status.enum';
import { ProviderType } from '../providers/enums/provider-type.enum';
import { ReferralCode } from './entities/referral-code.entity';
import { Referral } from './entities/referral.entity';
import { RewardLevelAchievement } from './entities/reward-level-achievement.entity';
import { RewardLevelDefinition } from './entities/reward-level-definition.entity';
import { RewardPointsLedger } from './entities/reward-points-ledger.entity';
import { RewardLedgerDirection } from './enums/reward-ledger-direction.enum';
import { RewardRule } from './entities/reward-rule.entity';
import { ReferralStatus } from './enums/referral-status.enum';
import { ReferralTargetType } from './enums/referral-target-type.enum';
import { ReferralsService } from './referrals.service';
import { User } from '../users/entities/user.entity';

describe('ReferralsService', () => {
  let codes: any[]; let referrals: any[]; let ledger: any[]; let achievements: any[]; let providers: any[]; let levelDefinitions: any[]; let rewardRules: any[]; let completedPatients: Set<string>; let manager: any; let subject: ReferralsService;
  const referrerUserId = '10000000-0000-4000-8000-000000000001';

  beforeEach(() => {
    codes = [{ id: 'code-1', userId: referrerUserId, codeNormalized: 'SC-AB12CD', isActive: true }];
    referrals = []; ledger = []; achievements = []; providers = []; completedPatients = new Set();
    const requirements = [
      [ReferralTargetType.CLINIC, 2], [ReferralTargetType.LABORATORY, 2], [ReferralTargetType.PHARMACY, 2], [ReferralTargetType.PATIENT, 10],
    ].map(([targetType, requiredCount]) => ({ targetType, requiredCount }));
    const level = { id: 'level-1', code: 'LEVEL_1', name: 'Level 1', ordinal: 1, isActive: true, requirements };
    levelDefinitions = [level];
    rewardRules = [ReferralTargetType.PATIENT, ReferralTargetType.CLINIC, ReferralTargetType.LABORATORY, ReferralTargetType.PHARMACY].map((target) => ({ code: `${target}_QUALIFIED`, points: target === ReferralTargetType.PATIENT ? 10 : 100, isActive: true })).concat([{ code: 'LEVEL_1_COMPLETED', points: 50, isActive: true } as any]);
    const repo = (entity: any): any => {
      if (entity === ReferralCode) return { manager, findOne: jest.fn(async ({ where }: any) => codes.find((row) => (where.userId ? row.userId === where.userId : row.codeNormalized === where.codeNormalized && row.isActive === where.isActive)) ?? null), exists: jest.fn(async ({ where }: any) => codes.some((row) => row.codeNormalized === where.codeNormalized)), create: (value: any) => value, save: jest.fn(async (value) => { const row = { id: value.id ?? `code-${codes.length + 1}`, ...value }; codes.push(row); return row; }) };
      if (entity === Referral) return { manager, findOne: jest.fn(async ({ where }: any) => referrals.find((row) => Object.entries(where).every(([key, value]) => row[key] === value)) ?? null), exists: jest.fn(async ({ where }: any) => referrals.some((row) => row.referredUserId === where.referredUserId)), create: (value: any) => value, save: jest.fn(async (value) => { const row = { id: value.id ?? `referral-${referrals.length + 1}`, createdAt: value.createdAt ?? new Date(), ...value }; const index = referrals.findIndex((item) => item.id === row.id); if (index >= 0) referrals[index] = row; else referrals.push(row); return row; }), createQueryBuilder: () => qualifiedCountsBuilder() };
      if (entity === RewardRule) return { findOne: jest.fn(async ({ where }: any) => rewardRules.find((row) => row.code === where.code && row.isActive === where.isActive) ?? null) };
      if (entity === RewardPointsLedger) return { manager, exists: jest.fn(async ({ where }: any) => ledger.some((row) => row.eventKey === where.eventKey)), create: (value: any) => value, save: jest.fn(async (value) => { ledger.push({ id: `entry-${ledger.length + 1}`, ...value }); return value; }), createQueryBuilder: jest.fn() };
      if (entity === RewardLevelDefinition) return { manager, find: jest.fn(async () => levelDefinitions), findOne: jest.fn(async ({ where }: any) => levelDefinitions.find((item) => item.code === where.code) ?? null) };
      if (entity === RewardLevelAchievement) return { find: jest.fn(async ({ where }: any) => achievements.filter((row) => row.userId === where.userId)), findOne: jest.fn(async ({ where }: any) => achievements.find((row) => row.userId === where.userId && row.levelId === where.levelId) ?? null), create: (value: any) => value, save: jest.fn(async (value) => { const row = { id: `achievement-${achievements.length + 1}`, ...value }; achievements.push(row); return row; }) };
      if (entity === Provider) return { findOne: jest.fn(async ({ where }: any) => providers.find((row) => row.id === where.id) ?? null) };
      if (entity === HealthCheckEncounter) return { createQueryBuilder: () => ({ innerJoin: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), getCount: jest.fn(async () => completedPatients.size ? 1 : 0) }) };
      if (entity === User) return { findOne: jest.fn().mockResolvedValue({ id: referrerUserId }) };
      return {};
    };
    const qualifiedCountsBuilder = () => ({ select: jest.fn().mockReturnThis(), addSelect: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), groupBy: jest.fn().mockReturnThis(), getRawMany: jest.fn(async () => Object.values(ReferralTargetType).map((targetType) => ({ targetType, count: String(referrals.filter((row) => row.referrerUserId === referrerUserId && row.targetType === targetType && row.status === ReferralStatus.QUALIFIED).length) }))) });
    manager = { getRepository: jest.fn(repo), transaction: jest.fn(async (work: any) => work(manager)) };
    subject = new ReferralsService(repo(ReferralCode), repo(Referral), repo(RewardPointsLedger), repo(RewardLevelDefinition), { balance: jest.fn(async (userId: string) => {
      const entries = ledger.filter((entry) => entry.userId === userId);
      const earned = entries.filter((entry) => entry.direction === RewardLedgerDirection.CREDIT).reduce((sum, entry) => sum + entry.points, 0);
      const redeemed = entries.filter((entry) => entry.direction === RewardLedgerDirection.DEBIT).reduce((sum, entry) => sum + entry.points, 0);
      return { availablePoints: earned - redeemed, reservedPoints: 0, lifetimeEarnedPoints: earned, lifetimeRedeemedPoints: redeemed };
    }), metrics: jest.fn() } as never);
  });

  it('captures a valid patient registration but awards no points until qualification', async () => {
    await subject.capturePatient(manager, 'sc-ab12cd', 'user-2', 'patient-2');
    expect(referrals[0]).toMatchObject({ targetType: ReferralTargetType.PATIENT, status: ReferralStatus.REGISTERED });
    expect(ledger).toHaveLength(0);
  });

  it('rejects invalid and self referral codes', async () => {
    await expect(subject.capturePatient(manager, 'unknown', 'user-2', 'patient-2')).rejects.toBeInstanceOf(BadRequestException);
    await expect(subject.capturePatient(manager, 'SC-AB12CD', referrerUserId, 'patient-2')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('qualifies a patient only after the first completed encounter and credits once', async () => {
    await subject.capturePatient(manager, 'SC-AB12CD', 'user-2', 'patient-2');
    await subject.qualifyPatient('patient-2');
    expect(referrals[0].status).toBe(ReferralStatus.REGISTERED);
    completedPatients.add('patient-2');
    await subject.qualifyPatient('patient-2');
    await subject.qualifyPatient('patient-2');
    expect(referrals[0].status).toBe(ReferralStatus.QUALIFIED);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ points: 10, eventKey: `REFERRAL_QUALIFIED:${referrals[0].id}` });
  });

  it.each([
    [ProviderType.CLINIC, ReferralTargetType.CLINIC],
    [ProviderType.DIAGNOSTIC_CENTRE, ReferralTargetType.LABORATORY],
    [ProviderType.PHARMACY, ReferralTargetType.PHARMACY],
  ])('uses authoritative provider type %s and qualifies only after approval', async (providerType, targetType) => {
    const provider: any = { id: 'provider-2', userId: 'user-2', providerType, status: ProviderStatus.PENDING, onboardingStatus: ProviderOnboardingStatus.DRAFT, deletedAt: null };
    providers.push(provider);
    await subject.captureProvider(manager, 'SC-AB12CD', provider, targetType);
    await subject.qualifyProvider(provider.id);
    expect(referrals[0].status).toBe(ReferralStatus.REGISTERED);
    provider.status = ProviderStatus.ACTIVE; provider.onboardingStatus = ProviderOnboardingStatus.APPROVED;
    await subject.qualifyProvider(provider.id); await subject.qualifyProvider(provider.id);
    expect(referrals[0].status).toBe(ReferralStatus.QUALIFIED);
    expect(ledger).toHaveLength(1);
  });

  it('never trusts a provider URL target that disagrees with authoritative classification', async () => {
    const provider: any = { id: 'provider-2', userId: 'user-2', providerType: ProviderType.CLINIC };
    await expect(subject.captureProvider(manager, 'SC-AB12CD', provider, ReferralTargetType.PHARMACY)).rejects.toBeInstanceOf(BadRequestException);
    expect(referrals).toHaveLength(0);
  });

  it('achieves configured Level 1 only when all four requirements are met and awards its bonus once', async () => {
    const targets = [ReferralTargetType.CLINIC, ReferralTargetType.CLINIC, ReferralTargetType.LABORATORY, ReferralTargetType.LABORATORY, ReferralTargetType.PHARMACY, ReferralTargetType.PHARMACY, ...Array(9).fill(ReferralTargetType.PATIENT)];
    targets.forEach((targetType, index) => referrals.push({ id: `qualified-${index}`, referrerUserId, targetType, status: ReferralStatus.QUALIFIED }));
    referrals.push({ id: 'last-patient', referrerUserId, targetType: ReferralTargetType.PATIENT, status: ReferralStatus.REGISTERED, referredPatientId: 'patient-last' });
    completedPatients.add('patient-last');
    await subject.qualifyPatient('patient-last'); await subject.qualifyPatient('patient-last');
    expect(achievements).toHaveLength(1);
    expect(ledger.filter((entry) => entry.eventType === 'LEVEL_1_COMPLETED')).toHaveLength(1);
  });

  it('returns ledger-derived balance and aggregate configured Level 1 progress', async () => {
    const referralBuilder: any = {};
    for (const method of ['select', 'addSelect', 'where', 'andWhere', 'groupBy', 'setParameter']) referralBuilder[method] = jest.fn().mockReturnValue(referralBuilder);
    referralBuilder.getRawMany = jest.fn().mockResolvedValue([{ targetType: ReferralTargetType.PATIENT, count: '7' }, { targetType: ReferralTargetType.CLINIC, count: '1' }, { targetType: ReferralTargetType.LABORATORY, count: '2' }]);
    referralBuilder.getRawOne = jest.fn().mockResolvedValue({ registered: '12', qualified: '10' });
    (subject as any).referrals.createQueryBuilder = jest.fn().mockReturnValue(referralBuilder);
    const ledgerBuilder: any = {};
    for (const method of ['select', 'addSelect', 'where', 'setParameter']) ledgerBuilder[method] = jest.fn().mockReturnValue(ledgerBuilder);
    ledgerBuilder.getRawOne = jest.fn().mockResolvedValue({ available: '270', earned: '300' });
    (subject as any).ledger.createQueryBuilder = jest.fn().mockReturnValue(ledgerBuilder);
    (subject as any).withdrawals.balance.mockResolvedValue({ availablePoints: 270, reservedPoints: 30, lifetimeEarnedPoints: 300, lifetimeRedeemedPoints: 0 });
    const level = { id: 'level-1', code: 'LEVEL_1', name: 'Level 1', ordinal: 1, isActive: true, requirements: [{ targetType: ReferralTargetType.PATIENT, requiredCount: 10 }, { targetType: ReferralTargetType.CLINIC, requiredCount: 2 }, { targetType: ReferralTargetType.LABORATORY, requiredCount: 2 }, { targetType: ReferralTargetType.PHARMACY, requiredCount: 2 }] };
    (subject as any).levels.find = jest.fn().mockResolvedValue([level]);
    const originalGetRepository = manager.getRepository.getMockImplementation();
    manager.getRepository = jest.fn((entity: any) => entity === RewardLevelAchievement ? { find: jest.fn().mockResolvedValue([]) } : entity === Referral ? (subject as any).referrals : originalGetRepository(entity));
    await expect(subject.summary(referrerUserId)).resolves.toMatchObject({ referralCode: 'SC-AB12CD', availablePoints: 270, lifetimeEarnedPoints: 300, progress: { patients: { qualified: 7, required: 10 }, clinics: { qualified: 1, required: 2 }, laboratories: { qualified: 2, required: 2 }, pharmacies: { qualified: 0, required: 2 } }, completed: false, registeredDirectReferrals: 12, qualifiedDirectReferrals: 10 });
  });

  const configureFiveLevels = () => {
    levelDefinitions = Array.from({ length: 5 }, (_, index) => {
      const ordinal = index + 1;
      return { id: `level-${ordinal}`, code: `LEVEL_${ordinal}`, name: `Level ${ordinal}`, ordinal, isActive: true, requirements: [
        { targetType: ReferralTargetType.PATIENT, requiredCount: ordinal * 10 },
        { targetType: ReferralTargetType.CLINIC, requiredCount: ordinal * 2 },
        { targetType: ReferralTargetType.LABORATORY, requiredCount: ordinal * 2 },
        { targetType: ReferralTargetType.PHARMACY, requiredCount: ordinal * 2 },
      ] };
    });
  };

  const addQualifiedCounts = (patients: number, providersPerType: number) => {
    const targets = [
      ...Array(patients).fill(ReferralTargetType.PATIENT),
      ...Array(providersPerType).fill(ReferralTargetType.CLINIC),
      ...Array(providersPerType).fill(ReferralTargetType.LABORATORY),
      ...Array(providersPerType).fill(ReferralTargetType.PHARMACY),
    ];
    targets.forEach((targetType, index) => referrals.push({ id: `multi-${index}`, referrerUserId, targetType, status: ReferralStatus.QUALIFIED }));
  };

  it.each([[1, 10, 2], [2, 20, 4], [3, 30, 6], [4, 40, 8], [5, 50, 10]])('creates cumulative achievements through Level %s', async (expectedLevel, patients, providersPerType) => {
    configureFiveLevels(); addQualifiedCounts(patients, providersPerType);
    await subject.recalculateReferralAchievements(referrerUserId);
    expect(achievements.map((value) => value.levelId)).toEqual(levelDefinitions.slice(0, expectedLevel).map((value) => value.id));
    await subject.recalculateReferralAchievements(referrerUserId);
    expect(achievements).toHaveLength(expectedLevel);
  });

  it('jump-level reconciliation creates every missing consecutive achievement and bonuses only once', async () => {
    configureFiveLevels(); addQualifiedCounts(30, 6);
    rewardRules.push({ code: 'LEVEL_3_COMPLETED', points: 75, isActive: true });
    await subject.recalculateReferralAchievements(referrerUserId);
    await subject.recalculateReferralAchievements(referrerUserId);
    expect(achievements.map((value) => value.levelId)).toEqual(['level-1', 'level-2', 'level-3']);
    expect(ledger.filter((value) => value.eventType === 'LEVEL_3_COMPLETED')).toHaveLength(1);
    expect(ledger.find((value) => value.eventType === 'LEVEL_3_COMPLETED')).toMatchObject({ points: 75, eventKey: `LEVEL_ACHIEVED:${referrerUserId}:LEVEL_3` });
  });

  it('reports partial cumulative progress toward Level 3 after Level 2', () => {
    configureFiveLevels();
    const counts = new Map([[ReferralTargetType.PATIENT, 25], [ReferralTargetType.CLINIC, 5], [ReferralTargetType.LABORATORY, 4], [ReferralTargetType.PHARMACY, 4]]);
    const progress = (subject as any).levelProgress(levelDefinitions, [{ levelId: 'level-1' }, { levelId: 'level-2' }], counts);
    expect(progress).toMatchObject({ currentLevel: { code: 'LEVEL_2', ordinal: 2 }, nextLevel: { code: 'LEVEL_3', ordinal: 3 }, highestLevelAchieved: 2, highestConfiguredLevelReached: false });
    expect(progress.requirements).toEqual(expect.arrayContaining([
      { targetType: ReferralTargetType.PATIENT, qualified: 25, required: 30, remaining: 5, completed: false },
      { targetType: ReferralTargetType.CLINIC, qualified: 5, required: 6, remaining: 1, completed: false },
      { targetType: ReferralTargetType.LABORATORY, qualified: 4, required: 6, remaining: 2, completed: false },
    ]));
  });

  it('reports Level 5 as the highest configured level with no next requirements', () => {
    configureFiveLevels();
    const counts = new Map(Object.values(ReferralTargetType).map((target) => [target, 50]));
    const progress = (subject as any).levelProgress(levelDefinitions, levelDefinitions.map((level) => ({ levelId: level.id })), counts);
    expect(progress).toMatchObject({ currentLevel: { code: 'LEVEL_5', ordinal: 5 }, nextLevel: null, highestLevelAchieved: 5, requirements: [], highestConfiguredLevelReached: true });
  });
});
