import { HealthCheckPackage } from './entities/health-check-package.entity';
import { HealthCheckPackagesService } from './health-check-packages.service';

describe('HealthCheckPackagesService', () => {
  it('returns only active packages as response DTOs', async () => {
    const healthCheckPackageRepository = {
      find: jest.fn().mockResolvedValue([
        {
          id: '02c1de7d-9c38-4d1e-b2e0-d376df3bb21e',
          code: 'ESSENTIAL',
          name: 'Essential Health Check',
          description: null,
          isActive: true,
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
        isActive: true,
      },
    ]);
    expect(healthCheckPackageRepository.find).toHaveBeenCalledWith({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  });
});
