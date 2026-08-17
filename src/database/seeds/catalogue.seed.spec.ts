import { FulfilmentMode } from '../../health-checks/entities/fulfilment-mode.entity';
import { HealthCheckPackage } from '../../health-checks/entities/health-check-package.entity';
import {
  FULFILMENT_MODE_SEEDS,
  HEALTH_CHECK_PACKAGE_SEEDS,
  seedCatalogue,
} from './catalogue.seed';

describe('seedCatalogue', () => {
  it('inserts the stable catalogue codes with conflict-safe idempotency', async () => {
    const packageExecute = jest.fn().mockResolvedValue(undefined);
    const modeExecute = jest.fn().mockResolvedValue(undefined);
    const packageQuery = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: packageExecute,
    };
    const modeQuery = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: modeExecute,
    };
    const connection = {
      getRepository: jest.fn((entity: unknown) => ({
        createQueryBuilder: jest.fn(() =>
          entity === HealthCheckPackage ? packageQuery : modeQuery,
        ),
      })),
    };

    await seedCatalogue(connection as never);

    expect(connection.getRepository).toHaveBeenCalledWith(HealthCheckPackage);
    expect(packageQuery.values).toHaveBeenCalledWith(HEALTH_CHECK_PACKAGE_SEEDS);
    expect(packageQuery.orIgnore).toHaveBeenCalledTimes(1);
    expect(connection.getRepository).toHaveBeenCalledWith(FulfilmentMode);
    expect(modeQuery.values).toHaveBeenCalledWith(FULFILMENT_MODE_SEEDS);
    expect(modeQuery.orIgnore).toHaveBeenCalledTimes(1);
    expect(packageExecute).toHaveBeenCalledTimes(1);
    expect(modeExecute).toHaveBeenCalledTimes(1);
  });
});
