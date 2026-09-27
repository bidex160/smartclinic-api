import { DataSource } from 'typeorm';

import { PartnerInvitation } from '../../partners/entities/partner-invitation.entity';
import { Partner } from '../../partners/entities/partner.entity';
import { PartnerProgram } from '../../partners/entities/partner-program.entity';
import {
  seedStagingHealthyFamilies,
  STAGING_FAMILY_SEED_CONFIRMATION,
} from './staging-healthy-families.seed';

describe('seedStagingHealthyFamilies', () => {
  it('refuses to run without explicit staging confirmation', async () => {
    await expect(
      seedStagingHealthyFamilies({} as DataSource, { email: 'parent@example.test' }),
    ).rejects.toThrow('Refusing to seed Healthy Families');
  });

  it('creates the demo programme and one reusable addressed invitation', async () => {
    const school = { id: 'school-1', name: 'SmartClinic Demonstration Academy' };
    const program = { id: 'program-1', partnerId: school.id };
    const invitation = {
      id: 'invitation-1',
      token: 'test-token',
      partnerId: school.id,
      programId: program.id,
      email: 'parent@example.test',
      phone: null,
      status: 'INVITED',
    } as PartnerInvitation;
    const partnerRepository = {
      findOne: jest.fn().mockResolvedValue(school),
      create: jest.fn(),
      save: jest.fn(),
    };
    const programRepository = {
      findOne: jest.fn().mockResolvedValue(program),
      create: jest.fn(),
      save: jest.fn(),
    };
    const invitationRepository = {
      findOne: jest.fn().mockResolvedValue(invitation),
      create: jest.fn(),
      save: jest.fn(),
    };
    const connection = {
      getRepository: jest.fn((entity) => {
        if (entity === Partner) return partnerRepository;
        if (entity === PartnerProgram) return programRepository;
        return invitationRepository;
      }),
    } as unknown as DataSource;

    const result = await seedStagingHealthyFamilies(connection, {
      confirmation: STAGING_FAMILY_SEED_CONFIRMATION,
      email: ' Parent@Example.Test ',
      frontendUrl: 'https://staging.smartclinicnetwork.com/',
    });

    expect(invitationRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ email: 'parent@example.test', status: 'INVITED' }),
      }),
    );
    expect(invitationRepository.save).not.toHaveBeenCalled();
    expect(result.invitationUrl).toBe(
      'https://staging.smartclinicnetwork.com/healthy-families/join/test-token',
    );
  });
});
