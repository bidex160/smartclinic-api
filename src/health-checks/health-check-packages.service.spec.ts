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
    const service = new HealthCheckPackagesService(healthCheckPackageRepository as never, { find: jest.fn().mockResolvedValue([]) } as never);

    await expect(service.findActive()).resolves.toMatchObject([
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
    expect(healthCheckPackageRepository.find).toHaveBeenCalledWith(expect.objectContaining({
      where: { isActive: true },
      order: { code: 'ASC' },
      relations: { contents: { clinicalContent: true }, addonAvailability: { clinicalContent: true } },
    }));
  });

  it('returns an active provider-offered package without restricting its canonical code', async () => {
    const executive = { id: 'executive', code: 'EXECUTIVE', name: 'Executive', description: null, benefits: [], estimatedDurationMinutes: 45, isActive: true, contents: [], addonAvailability: [] } as any;
    const packages = { find: jest.fn().mockResolvedValue([executive]) };
    const offerings = { find: jest.fn().mockResolvedValue([{ healthCheckPackageId: executive.id, priceMinor: '2500000', currency: 'NGN', fulfilmentMode: { code: 'PROVIDER_LOCATION', name: 'Provider location' } }]) };
    await expect(new HealthCheckPackagesService(packages as never, offerings as never).findActive()).resolves.toEqual([expect.objectContaining({ code: 'EXECUTIVE', fromPriceMinor: 2500000 })]);
    expect(packages.find).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
  });

  it('preserves normalized ESSENTIAL and COMPLETE composition ordering', async () => {
    const content = (code: string, sortOrder: number, category = 'MEASUREMENT') => ({
      isActive: true,
      sortOrder,
      clinicalContent: { code, name: code, description: null, category, isActive: true },
    });
    const repository = { find: jest.fn().mockResolvedValue([
      { id: 'essential', code: 'ESSENTIAL', name: 'Essential', description: null, benefits: [], estimatedDurationMinutes: 15, isActive: true, contents: ['PULSE', 'OXYGEN_SATURATION', 'TEMPERATURE', 'BMI', 'BLOOD_GLUCOSE', 'BLOOD_PRESSURE'].map((code, index) => content(code, 6 - index)), addonAvailability: [] },
      { id: 'complete', code: 'COMPLETE', name: 'Complete', description: null, benefits: [], estimatedDurationMinutes: 30, isActive: true, contents: [...['BLOOD_PRESSURE', 'BLOOD_GLUCOSE', 'BMI', 'TEMPERATURE', 'OXYGEN_SATURATION', 'PULSE'].map((code, index) => content(code, index + 1)), content('CLINICIAN_REVIEW', 7, 'REVIEW'), content('EXPANDED_INTERPRETATION', 8, 'REVIEW')], addonAvailability: [] },
    ]) };
    const service = new HealthCheckPackagesService(repository as never, { find: jest.fn().mockResolvedValue([]) } as never);

    const result = await service.findActive();

    expect(result.find((item) => item.code === 'ESSENTIAL')?.includedContents.map((item) => item.code)).toEqual(['BLOOD_PRESSURE', 'BLOOD_GLUCOSE', 'BMI', 'TEMPERATURE', 'OXYGEN_SATURATION', 'PULSE']);
    expect(result.find((item) => item.code === 'COMPLETE')?.includedContents.map((item) => item.code)).toEqual(['BLOOD_PRESSURE', 'BLOOD_GLUCOSE', 'BMI', 'TEMPERATURE', 'OXYGEN_SATURATION', 'PULSE', 'CLINICIAN_REVIEW', 'EXPANDED_INTERPRETATION']);
  });
});
