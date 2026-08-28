import { HealthCheckPackage } from './entities/health-check-package.entity';
import { HealthCheckPackagesService } from './health-check-packages.service';

describe('HealthCheckPackagesService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('maps package metadata and returns only active effective prices', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-17T12:00:00.000Z'));
    const healthCheckPackageRepository = {
      find: jest.fn().mockResolvedValue([
        {
          id: '02c1de7d-9c38-4d1e-b2e0-d376df3bb21e',
          code: 'ESSENTIAL',
          name: 'Essential Health Check',
          description: null,
          benefits: ['Blood pressure measurement'],
          estimatedDurationMinutes: 30,
          isActive: true,
          packagePrices: [
            {
              fulfilmentModeId: '5d0c515e-3d85-48a2-96a8-5e3d72221aa0',
              amount: '12500.00',
              currency: 'NGN',
              effectiveFrom: '2026-08-01',
              effectiveTo: null,
              isActive: true,
              fulfilmentMode: { code: 'HOME_VISIT', name: 'Home visit' },
            },
            {
              fulfilmentModeId: 'c31df62e-0ae9-4816-88f9-49e4ea2f5003',
              amount: '9000.00',
              currency: 'NGN',
              effectiveFrom: '2026-07-01',
              effectiveTo: '2026-08-01',
              isActive: true,
              fulfilmentMode: { code: 'PROVIDER_LOCATION', name: 'Provider location' },
            },
            {
              fulfilmentModeId: '7e66ecb3-53cc-4e51-b619-7d8ccacd9b4c',
              amount: '15000.00',
              currency: 'NGN',
              effectiveFrom: '2026-09-01',
              effectiveTo: null,
              isActive: true,
              fulfilmentMode: { code: 'PROVIDER_LOCATION', name: 'Provider location' },
            },
            {
              fulfilmentModeId: 'b0d1d683-4a3a-4f3d-a01d-1aeb75b9c394',
              amount: '10000.00',
              currency: 'NGN',
              effectiveFrom: '2026-08-01',
              effectiveTo: null,
              isActive: false,
              fulfilmentMode: { code: 'PROVIDER_LOCATION', name: 'Provider location' },
            },
          ],
        } as HealthCheckPackage,
      ]),
    };
    const service = new HealthCheckPackagesService(healthCheckPackageRepository as never);

    await expect(service.findActive()).resolves.toEqual([
      {
        id: '02c1de7d-9c38-4d1e-b2e0-d376df3bb21e',
        code: 'ESSENTIAL',
        name: 'Essential Health Check',
        description: null,
        benefits: ['Blood pressure measurement'],
        estimatedDurationMinutes: 30,
        isActive: true,
      },
    ]);
    expect(healthCheckPackageRepository.find).toHaveBeenCalledWith({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  });
});
