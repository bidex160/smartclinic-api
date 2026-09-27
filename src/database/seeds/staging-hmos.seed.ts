import { DataSource, EntityManager } from 'typeorm';

import dataSource from '../data-source';
import { Hmo } from '../../hmo/entities/hmo.entity';

export const STAGING_HMO_SEED_CONFIRMATION = 'SMARTCLINIC_STAGING_ONLY';

const STAGING_HMOS: ReadonlyArray<Pick<Hmo, 'code' | 'name'>> = [
  { code: 'LEADWAY', name: 'Leadway Health' },
  { code: 'LIFEWORTH', name: 'LifeWORTH HMO' },
];

export async function seedStagingHmos(
  connection: DataSource,
  confirmation = process.env.CONFIRM_STAGING_HMO_SEED,
): Promise<void> {
  if (confirmation !== STAGING_HMO_SEED_CONFIRMATION) {
    throw new Error(
      'Refusing to seed HMOs. Set CONFIRM_STAGING_HMO_SEED=SMARTCLINIC_STAGING_ONLY only on the staging server.',
    );
  }

  await connection.transaction(async (manager: EntityManager) => {
    const repository = manager.getRepository(Hmo);

    for (const item of STAGING_HMOS) {
      const existing = await repository.findOne({ where: { code: item.code } });

      if (existing) {
        existing.name = item.name;
        existing.active = true;
        existing.verificationMethod = 'MANUAL';
        existing.claimSubmissionMethod = 'MANUAL';
        await repository.save(existing);
        continue;
      }

      await repository.save(
        repository.create({
          ...item,
          active: true,
          verificationMethod: 'MANUAL',
          claimSubmissionMethod: 'MANUAL',
        }),
      );
    }
  });
}

async function run(): Promise<void> {
  await dataSource.initialize();

  try {
    await seedStagingHmos(dataSource);
    console.log('Staging HMO catalogue seed completed.');
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  void run().catch((error: unknown) => {
    console.error('Staging HMO catalogue seed failed.', error);
    process.exitCode = 1;
  });
}
