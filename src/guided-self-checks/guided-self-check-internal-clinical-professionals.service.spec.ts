import { ConflictException, ForbiddenException } from '@nestjs/common';
import { GuidedSelfCheckInternalClinicalProfessionalsService } from './guided-self-check-internal-clinical-professionals.service';
import { GuidedSelfCheckInternalClinicalCapability, GuidedSelfCheckInternalClinicalProfessionalStatus, GuidedSelfCheckInternalClinicalProfessionalType } from './enums/guided-self-check-internal-clinical-professional.enum';
import { UserStatus } from '../users/enums/user-status.enum';

describe('GuidedSelfCheckInternalClinicalProfessionalsService', () => {
  const activeUser = { id: 'user', emailNormalized: 'clinician@smartclinic.test', displayName: 'Ada Clinician', status: UserStatus.ACTIVE, deletedAt: null };

  function harness(existing: any = null) {
    const rows: any[] = existing ? [existing] : [];
    const userRepo = { findOne: jest.fn().mockResolvedValue(activeUser) };
    const professionalRepo = {
      findOne: jest.fn(async () => rows[0] ?? null),
      create: jest.fn((value: any) => value),
      save: jest.fn(async (value: any) => { const saved = { ...value, id: value.id ?? 'professional', reference: value.reference ?? 'SC-ICP-ABCDEF123456', user: activeUser, createdAt: new Date() }; rows[0] = saved; return saved; }),
    };
    const historyRepo = { save: jest.fn() };
    const manager: any = { getRepository: jest.fn((entity: any) => entity.name === 'User' ? userRepo : entity.name === 'GuidedSelfCheckInternalClinicalProfessional' ? professionalRepo : historyRepo), save: professionalRepo.save };
    const data: any = { manager, transaction: jest.fn((fn: any) => fn(manager)) };
    return { service: new GuidedSelfCheckInternalClinicalProfessionalsService(professionalRepo as never, data), professionalRepo, historyRepo, rows };
  }

  it('Admin governance can authorize an exact existing User with explicit capabilities', async () => {
    const { service, rows, historyRepo } = harness();
    const result = await service.authorize({ userEmail: activeUser.emailNormalized, displayName: 'Dr Ada', professionalType: GuidedSelfCheckInternalClinicalProfessionalType.DOCTOR, capabilities: [GuidedSelfCheckInternalClinicalCapability.URGENT_SELF_CHECK_REVIEW] }, 'admin');
    expect(result).toMatchObject({ reference: 'SC-ICP-ABCDEF123456', displayName: 'Dr Ada', status: GuidedSelfCheckInternalClinicalProfessionalStatus.ACTIVE, capabilities: [GuidedSelfCheckInternalClinicalCapability.URGENT_SELF_CHECK_REVIEW] });
    expect(rows[0]).not.toHaveProperty('password');
    expect(historyRepo.save).toHaveBeenCalledWith(expect.objectContaining({ event: 'INTERNAL_CLINICAL_PROFESSIONAL_AUTHORIZED', actorUserId: 'admin' }));
  });

  it('prevents duplicate active authorization for the same exact User', async () => {
    const existing = { id: 'professional', userId: activeUser.id, user: activeUser, status: GuidedSelfCheckInternalClinicalProfessionalStatus.ACTIVE, capabilities: [GuidedSelfCheckInternalClinicalCapability.URGENT_SELF_CHECK_REVIEW] };
    await expect(harness(existing).service.authorize({ userEmail: activeUser.emailNormalized, displayName: 'Ada', professionalType: GuidedSelfCheckInternalClinicalProfessionalType.DOCTOR, capabilities: [GuidedSelfCheckInternalClinicalCapability.URGENT_SELF_CHECK_REVIEW] }, 'admin')).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires the exact active capability; Provider/Admin/Operations identity alone is insufficient', async () => {
    const { service, professionalRepo } = harness();
    professionalRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.eligibleForUser('provider-or-admin', GuidedSelfCheckInternalClinicalCapability.URGENT_SELF_CHECK_REVIEW)).rejects.toBeInstanceOf(ForbiddenException);
    professionalRepo.findOne.mockResolvedValueOnce({ id: 'p', userId: activeUser.id, user: activeUser, status: GuidedSelfCheckInternalClinicalProfessionalStatus.ACTIVE, disabledAt: null, capabilities: [GuidedSelfCheckInternalClinicalCapability.SELF_CHECK_CLINICAL_REVIEW] });
    await expect(service.eligibleForUser(activeUser.id, GuidedSelfCheckInternalClinicalCapability.URGENT_SELF_CHECK_REVIEW)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a disabled professional even when capability remains in historical data', async () => {
    const existing = { id: 'professional', userId: activeUser.id, user: activeUser, status: GuidedSelfCheckInternalClinicalProfessionalStatus.DISABLED, disabledAt: new Date(), capabilities: [GuidedSelfCheckInternalClinicalCapability.URGENT_SELF_CHECK_REVIEW] };
    await expect(harness(existing).service.eligibleForUser(activeUser.id, GuidedSelfCheckInternalClinicalCapability.URGENT_SELF_CHECK_REVIEW)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
