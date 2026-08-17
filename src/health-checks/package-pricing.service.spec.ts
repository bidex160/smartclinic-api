import { InternalServerErrorException, UnprocessableEntityException } from '@nestjs/common';

import { BOOKING_CURRENCY, PackagePricingService } from './package-pricing.service';

describe('PackagePricingService', () => {
  const packageId = 'd3f17322-2dab-42bd-a006-35c3b864849d';
  const modeId = '3c233f29-a510-4602-a337-df7e2d1e5a4a';
  const now = new Date('2026-08-17T12:00:00.000Z');

  function createService(prices: object[]) {
    const repository = { find: jest.fn().mockResolvedValue(prices) };
    return { service: new PackagePricingService(repository as never), repository };
  }

  it('selects the one active, effective NGN price', async () => {
    const { service, repository } = createService([
      { amount: '12500.00', currency: 'NGN', isActive: true, effectiveFrom: '2026-08-01', effectiveTo: null },
    ]);

    await expect(service.resolveCurrentPrice(packageId, modeId, now)).resolves.toEqual({
      amount: '12500.00',
      currency: BOOKING_CURRENCY,
    });
    expect(repository.find).toHaveBeenCalledWith({
      where: { healthCheckPackageId: packageId, fulfilmentModeId: modeId, currency: BOOKING_CURRENCY },
    });
  });

  it.each([
    ['inactive', { amount: '12500.00', currency: 'NGN', isActive: false, effectiveFrom: '2026-08-01', effectiveTo: null }],
    ['future', { amount: '12500.00', currency: 'NGN', isActive: true, effectiveFrom: '2026-08-18', effectiveTo: null }],
    ['expired', { amount: '12500.00', currency: 'NGN', isActive: true, effectiveFrom: '2026-08-01', effectiveTo: '2026-08-17' }],
  ])('rejects a %s price', async (_scenario, price) => {
    const { service } = createService([price]);

    await expect(service.resolveCurrentPrice(packageId, modeId, now)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('uses the v1 NGN policy rather than selecting another active currency', async () => {
    const { service } = createService([
      { amount: '10.00', currency: 'USD', isActive: true, effectiveFrom: '2026-08-01', effectiveTo: null },
    ]);

    await expect(service.resolveCurrentPrice(packageId, modeId, now)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('fails safely if catalogue data contains more than one applicable NGN price', async () => {
    const { service } = createService([
      { amount: '12500.00', currency: 'NGN', isActive: true, effectiveFrom: '2026-08-01', effectiveTo: null },
      { amount: '13000.00', currency: 'NGN', isActive: true, effectiveFrom: '2026-08-01', effectiveTo: null },
    ]);

    await expect(service.resolveCurrentPrice(packageId, modeId, now)).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
