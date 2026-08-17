import { DataSource } from 'typeorm';

import dataSource from '../data-source';
import { FulfilmentMode } from '../../health-checks/entities/fulfilment-mode.entity';
import { HealthCheckPackage } from '../../health-checks/entities/health-check-package.entity';

export const HEALTH_CHECK_PACKAGE_SEEDS = [
  {
    code: 'ESSENTIAL',
    name: 'Essential Health Check',
    description: 'A foundational SmartClinic health screening package.',
    benefits: [
      'Blood pressure',
      'Blood glucose',
      'BMI',
      'Temperature',
      'Oxygen saturation',
      'Pulse',
    ],
    estimatedDurationMinutes: 15,
    isActive: true,
  },
  {
    code: 'COMPLETE',
    name: 'Complete Health Check',
    description: 'A comprehensive SmartClinic health screening package.',
    benefits: [
      'Blood pressure',
      'Blood glucose',
      'BMI',
      'Temperature',
      'Oxygen saturation',
      'Pulse',
      'Additional clinician review',
      'Expanded interpretation of recorded measurements',
    ],
    estimatedDurationMinutes: 30,
    isActive: true,
  },
] as const;

export const FULFILMENT_MODE_SEEDS = [
  {
    code: 'PROVIDER_LOCATION',
    name: 'Provider location',
    isActive: true,
  },
  {
    code: 'HOME_VISIT',
    name: 'Home visit',
    isActive: true,
  },
] as const;

export async function seedCatalogue(connection: DataSource): Promise<void> {
  await connection
    .getRepository(HealthCheckPackage)
    .upsert(
      HEALTH_CHECK_PACKAGE_SEEDS.map((healthCheckPackage) => ({
        ...healthCheckPackage,
        benefits: [...healthCheckPackage.benefits],
      })),
      ['code'],
    );

  await connection
    .getRepository(FulfilmentMode)
    .createQueryBuilder()
    .insert()
    .values([...FULFILMENT_MODE_SEEDS])
    .orIgnore()
    .execute();
}

async function run(): Promise<void> {
  await dataSource.initialize();

  try {
    await seedCatalogue(dataSource);
    console.log('Catalogue seed completed.');
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  void run().catch((error: unknown) => {
    console.error('Catalogue seed failed.', error);
    process.exitCode = 1;
  });
}
