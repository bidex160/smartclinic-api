import { BadRequestException, ConflictException } from '@nestjs/common';
import { HealthCheckConfigurationService } from './health-check-configuration.service';

describe('HealthCheckConfigurationService', () => {
  const serviceRow = (changes: Record<string, unknown> = {}) => ({
    priceMinor: '800000', fulfilmentFeeMinor: '250000', currency: 'NGN',
    provider: { providerReference: 'SCPR-ONE', displayName: 'Clinic' },
    fulfilmentMode: { code: 'HOME_VISIT', name: 'Home visit' },
    healthCheckPackage: { code: 'ESSENTIAL', name: 'Essential', contents: [{ code: 'BLOOD_PRESSURE', name: 'Blood pressure', category: 'MEASUREMENT', sortOrder: 1 }], addonAvailability: [{ isActive: true, addon: { code: 'CHOLESTEROL', name: 'Cholesterol', category: 'LAB', isActive: true } }] },
    addons: [{ priceMinor: '150000', currency: 'NGN', addon: { code: 'CHOLESTEROL', name: 'Cholesterol' } }], ...changes,
  });
  const create = (row: any) => {
    const qb: any = {}; for (const name of ['innerJoinAndSelect', 'leftJoinAndSelect', 'where', 'andWhere']) qb[name] = jest.fn().mockReturnValue(qb);
    qb.getOne = jest.fn().mockResolvedValue(row);
    return new HealthCheckConfigurationService({ createQueryBuilder: jest.fn().mockReturnValue(qb) } as never);
  };

  it('calculates base, clinical add-ons, fulfilment fee and total from authoritative rows', async () => {
    await expect(create(serviceRow()).quote({ packageCode: 'ESSENTIAL', providerReference: 'SCPR-ONE', fulfilmentModeCode: 'HOME_VISIT', addonCodes: ['CHOLESTEROL'] })).resolves.toMatchObject({ pricing: { currency: 'NGN', basePackagePriceMinor: 800000, clinicalAddonsTotalMinor: 150000, fulfilmentFeeMinor: 250000, totalMinor: 1200000 }, selectedAddons: [{ code: 'CHOLESTEROL', priceMinor: 150000 }] });
  });
  it('keeps HOME_VISIT out of the clinical add-on domain', async () => {
    await expect(create(serviceRow()).quote({ packageCode: 'ESSENTIAL', providerReference: 'SCPR-ONE', fulfilmentModeCode: 'HOME_VISIT', addonCodes: ['HOME_VISIT'] })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects charging for an item already included in the package', async () => {
    await expect(create(serviceRow()).quote({ packageCode: 'ESSENTIAL', providerReference: 'SCPR-ONE', fulfilmentModeCode: 'HOME_VISIT', addonCodes: ['BLOOD_PRESSURE'] })).rejects.toBeInstanceOf(ConflictException);
  });
  it('rejects provider capability currency mismatch', async () => {
    const row = serviceRow({ addons: [{ priceMinor: '150000', currency: 'USD', addon: { code: 'CHOLESTEROL', name: 'Cholesterol' } }] });
    await expect(create(row).quote({ packageCode: 'ESSENTIAL', providerReference: 'SCPR-ONE', fulfilmentModeCode: 'HOME_VISIT', addonCodes: ['CHOLESTEROL'] })).rejects.toBeInstanceOf(ConflictException);
  });
});
