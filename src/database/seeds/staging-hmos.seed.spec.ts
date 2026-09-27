import { DataSource } from 'typeorm';

import { Hmo } from '../../hmo/entities/hmo.entity';
import {
  seedStagingHmos,
  STAGING_HMO_SEED_CONFIRMATION,
} from './staging-hmos.seed';

describe('seedStagingHmos', () => {
  it('refuses to run without the explicit staging confirmation', async () => {
    await expect(
      seedStagingHmos({} as DataSource, undefined),
    ).rejects.toThrow('Refusing to seed HMOs');
  });

  it('creates missing HMOs and reactivates existing catalogue entries', async () => {
    const existing = {
      id: 'hmo-1',
      code: 'LEADWAY',
      name: 'Old Leadway label',
      active: false,
      verificationMethod: 'API',
      claimSubmissionMethod: 'API',
    } as Hmo;
    const findOne = jest
      .fn()
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(null);
    const create = jest.fn((value) => value);
    const save = jest.fn(async (value) => value);
    const repository = { findOne, create, save };
    const connection = {
      transaction: jest.fn(async (work) =>
        work({ getRepository: jest.fn(() => repository) }),
      ),
    } as unknown as DataSource;

    await seedStagingHmos(connection, STAGING_HMO_SEED_CONFIRMATION);

    expect(save).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        code: 'LEADWAY',
        name: 'Leadway Health',
        active: true,
        verificationMethod: 'MANUAL',
        claimSubmissionMethod: 'MANUAL',
      }),
    );
    expect(create).toHaveBeenCalledWith({
      code: 'LIFEWORTH',
      name: 'LifeWORTH HMO',
      active: true,
      verificationMethod: 'MANUAL',
      claimSubmissionMethod: 'MANUAL',
    });
    expect(save).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ code: 'LIFEWORTH' }),
    );
  });
});
