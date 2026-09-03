import { BadRequestException, ConflictException } from '@nestjs/common';
import { HealthCheckConfigurationService } from './health-check-configuration.service';

describe('HealthCheckConfigurationService', () => {
  const serviceRow = (changes: Record<string, unknown> = {}) => ({
    priceMinor: '800000', fulfilmentFeeMinor: '250000', currency: 'NGN',
    provider: { providerReference: 'SCPR-ONE', displayName: 'Clinic' },
    fulfilmentMode: { code: 'HOME_VISIT', name: 'Home visit' },
    healthCheckPackage: { code: 'ESSENTIAL', name: 'Essential', contents: [{ clinicalContent: { code: 'BLOOD_PRESSURE', name: 'Blood pressure', category: 'MEASUREMENT', isActive: true }, sortOrder: 1, isActive: true }], addonAvailability: [{ isActive: true, clinicalContentId: 'cholesterol', clinicalContent: { id: 'cholesterol', code: 'CHOLESTEROL', name: 'Cholesterol', category: 'LAB', isActive: true } }] },
    addons: [{ clinicalContentId: 'cholesterol', priceMinor: '150000', currency: 'NGN', clinicalContent: { id: 'cholesterol', code: 'CHOLESTEROL', name: 'Cholesterol', category: 'LAB', isActive: true } }], ...changes,
  });
  const create = (row: any) => {
    const qb: any = {}; for (const name of ['innerJoinAndSelect', 'leftJoinAndSelect', 'where', 'andWhere']) qb[name] = jest.fn().mockReturnValue(qb);
    qb.getOne = jest.fn().mockResolvedValue(row);
    const patients={findOne:jest.fn().mockResolvedValue({id:'patient',userId:'user',status:'ACTIVE',deletedAt:null})};const quotes={create:jest.fn((x)=>x),save:jest.fn(async(x)=>({reference:'SC-HCQ-TEST',...x}))};
    return new HealthCheckConfigurationService({ createQueryBuilder: jest.fn().mockReturnValue(qb) } as never,patients as never,quotes as never,{} as never,{} as never,{} as never,{} as never);
  };

  it('calculates base, clinical add-ons, fulfilment fee and total from authoritative rows', async () => {
    await expect(create(serviceRow()).quote({id:'user'} as never,{ packageCode: 'ESSENTIAL', providerReference: 'SCPR-ONE', fulfilmentModeCode: 'HOME_VISIT', addonCodes: ['CHOLESTEROL'] })).resolves.toMatchObject({ configurationReference:'SC-HCQ-TEST',pricing: { currency: 'NGN', basePackagePriceMinor: 800000, clinicalAddonsTotalMinor: 150000, fulfilmentFeeMinor: 250000, totalMinor: 1200000 }, selectedAddons: [{ code: 'CHOLESTEROL', amountMinor: 150000 }] });
  });
  it('keeps HOME_VISIT out of the clinical add-on domain', async () => {
    await expect(create(serviceRow()).quote({id:'user'} as never,{ packageCode: 'ESSENTIAL', providerReference: 'SCPR-ONE', fulfilmentModeCode: 'HOME_VISIT', addonCodes: ['HOME_VISIT'] })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects charging for an item already included in the package', async () => {
    await expect(create(serviceRow()).quote({id:'user'} as never,{ packageCode: 'ESSENTIAL', providerReference: 'SCPR-ONE', fulfilmentModeCode: 'HOME_VISIT', addonCodes: ['BLOOD_PRESSURE'] })).rejects.toBeInstanceOf(ConflictException);
  });
  it('rejects provider capability currency mismatch', async () => {
    const row = serviceRow({ addons: [{ clinicalContentId: 'cholesterol', priceMinor: '150000', currency: 'USD', clinicalContent: { id: 'cholesterol', code: 'CHOLESTEROL', name: 'Cholesterol' } }] });
    await expect(create(row).quote({id:'user'} as never,{ packageCode: 'ESSENTIAL', providerReference: 'SCPR-ONE', fulfilmentModeCode: 'HOME_VISIT', addonCodes: ['CHOLESTEROL'] })).rejects.toBeInstanceOf(ConflictException);
  });
  it('does not create an unowned quote when no active patient belongs to the user',async()=>{const qb:any={};for(const name of ['innerJoinAndSelect','leftJoinAndSelect','where','andWhere'])qb[name]=jest.fn().mockReturnValue(qb);qb.getOne=jest.fn().mockResolvedValue(serviceRow());const subject=new HealthCheckConfigurationService({createQueryBuilder:jest.fn().mockReturnValue(qb)}as never,{findOne:jest.fn().mockResolvedValue(null)}as never,{create:jest.fn(),save:jest.fn()}as never,{}as never,{}as never,{}as never,{}as never);await expect(subject.quote({id:'user'}as never,{packageCode:'ESSENTIAL',providerReference:'SCPR-ONE',fulfilmentModeCode:'HOME_VISIT',addonCodes:[]})).rejects.toThrow('Patient profile not found');});
});
