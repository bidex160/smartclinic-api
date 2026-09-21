import { ForbiddenException } from '@nestjs/common';
import { ReferralStatus } from '../rewards/enums/referral-status.enum';
import { ReferralTargetType } from '../rewards/enums/referral-target-type.enum';
import { UserNetworkRole } from '../users/enums/user-network-role.enum';
import { BuildersService } from './builders.service';

describe('BuildersService', () => {
  const frontendUrl = 'https://smartclinicnetwork.com/';
  let referrals: { summary: jest.Mock; history: jest.Mock };
  let levels: { findOne: jest.Mock };
  let service: BuildersService;

  beforeEach(() => {
    referrals = {
      summary: jest.fn(async () => summary()),
      history: jest.fn(async () => ({
        items: [
          { targetType: ReferralTargetType.PATIENT, status: ReferralStatus.QUALIFIED, registeredAt: new Date('2026-01-02T03:04:05.000Z') },
          { targetType: ReferralTargetType.CLINIC, status: ReferralStatus.REGISTERED, registeredAt: new Date('2026-01-01T00:00:00.000Z') },
        ],
        page: 1,
        limit: 5,
        total: 2,
        totalPages: 1,
      })),
    };
    levels = { findOne: jest.fn() };
    service = new BuildersService(referrals as never, levels as never, { frontendUrl } as never);
  });

  it('allows a Builder to access a dashboard built from authenticated-user referrals', async () => {
    const result = await service.dashboard({ id: 'builder-user', networkRole: UserNetworkRole.BUILDER } as never);

    expect(referrals.summary).toHaveBeenCalledWith('builder-user');
    expect(referrals.history).toHaveBeenCalledWith('builder-user', { page: 1, limit: 5 });
    expect(result).toMatchObject({
      referralCode: 'SC-ABC123',
      referralUrl: 'https://smartclinicnetwork.com/join?ref=SC-ABC123',
      qualifiedPatients: 14,
      qualifiedClinics: 3,
      qualifiedLaboratories: 4,
      qualifiedPharmacies: 2,
    });
    expect(result.progress).toEqual([
      { category: ReferralTargetType.PATIENT, qualified: 14, required: 20, remaining: 6, completed: false },
      { category: ReferralTargetType.CLINIC, qualified: 3, required: 4, remaining: 1, completed: false },
      { category: ReferralTargetType.LABORATORY, qualified: 4, required: 4, remaining: 0, completed: true },
      { category: ReferralTargetType.PHARMACY, qualified: 2, required: 4, remaining: 2, completed: false },
    ]);
  });

  it('allows an Ambassador through the same dashboard endpoint', async () => {
    await expect(service.dashboard({ id: 'ambassador-user', networkRole: UserNetworkRole.AMBASSADOR } as never)).resolves.toHaveProperty('referralCode', 'SC-ABC123');
  });

  it('forbids a normal patient without a network role', async () => {
    await expect(service.dashboard({ id: 'patient-user', networkRole: null } as never)).rejects.toBeInstanceOf(ForbiddenException);
    expect(referrals.summary).not.toHaveBeenCalled();
  });

  it('returns privacy-safe bounded recent referrals without internal ids or contact data', async () => {
    const result = await service.dashboard({ id: 'builder-user', networkRole: UserNetworkRole.BUILDER } as never);

    expect(result.recentReferrals).toHaveLength(2);
    expect(result.recentReferrals[0]).toMatchObject({
      name: 'Patient referral',
      type: ReferralTargetType.PATIENT,
      status: ReferralStatus.QUALIFIED,
      createdAt: '2026-01-02T03:04:05.000Z',
    });
    expect(result.recentReferrals[0].reference).toMatch(/^REF-PATIENT-/);
    expect(JSON.stringify(result.recentReferrals)).not.toContain('uuid');
    expect(JSON.stringify(result.recentReferrals)).not.toContain('@');
  });

  it('uses completed highest configured level requirements when Level 5 has no next level', async () => {
    referrals.summary.mockResolvedValueOnce(summary({
      currentLevel: { code: 'LEVEL_5', name: 'Level 5', ordinal: 5 },
      nextLevel: null,
      requirements: [],
      highestConfiguredLevelReached: true,
      qualifiedCounts: {
        PATIENT: 50,
        INDIVIDUAL: 10,
        CLINIC: 10,
        LABORATORY: 10,
        PHARMACY: 10,
      },
    }));
    levels.findOne.mockResolvedValueOnce({
      requirements: [
        { targetType: ReferralTargetType.PATIENT, requiredCount: 50 },
        { targetType: ReferralTargetType.CLINIC, requiredCount: 10 },
        { targetType: ReferralTargetType.LABORATORY, requiredCount: 10 },
        { targetType: ReferralTargetType.PHARMACY, requiredCount: 10 },
      ],
    });

    const result = await service.dashboard({ id: 'builder-user', networkRole: UserNetworkRole.BUILDER } as never);

    expect(result.nextLevel).toBeNull();
    expect(levels.findOne).toHaveBeenCalledWith({ where: { code: 'LEVEL_5', isActive: true }, relations: { requirements: true } });
    expect(result.progress.every((item) => item.completed)).toBe(true);
    expect(result.progress.find((item) => item.category === ReferralTargetType.PATIENT)).toMatchObject({ qualified: 50, required: 50, remaining: 0 });
  });
});

function summary(overrides: any = {}) {
  return {
    referralCode: 'SC-ABC123',
    levelProgress: {
      currentLevel: { code: 'LEVEL_1', name: 'Level 1', ordinal: 1 },
      nextLevel: { code: 'LEVEL_2', name: 'Level 2', ordinal: 2 },
      highestLevelAchieved: 1,
      highestConfiguredLevelReached: false,
      qualifiedCounts: {
        PATIENT: 14,
        INDIVIDUAL: 0,
        CLINIC: 3,
        LABORATORY: 4,
        PHARMACY: 2,
      },
      requirements: [
        { targetType: ReferralTargetType.PATIENT, qualified: 14, required: 20, remaining: 6, completed: false },
        { targetType: ReferralTargetType.INDIVIDUAL, qualified: 0, required: 4, remaining: 4, completed: false },
        { targetType: ReferralTargetType.CLINIC, qualified: 3, required: 4, remaining: 1, completed: false },
        { targetType: ReferralTargetType.LABORATORY, qualified: 4, required: 4, remaining: 0, completed: true },
        { targetType: ReferralTargetType.PHARMACY, qualified: 2, required: 4, remaining: 2, completed: false },
      ],
      ...overrides,
    },
  };
}
