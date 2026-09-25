import { BadRequestException, ConflictException } from '@nestjs/common';
import { HealthCheckConfigurationService } from './health-check-configuration.service';

describe('HealthCheckConfigurationService', () => {
  const serviceRow = (changes: Record<string, unknown> = {}) => ({
    priceMinor: '800000', fulfilmentFeeMinor: '250000', currency: 'NGN',
    provider: { providerReference: 'SCPR-ONE', displayName: 'Clinic' },
    fulfilmentMode: { code: 'HOME_VISIT', name: 'Home visit' },
    healthCheckPackage: { code: 'ESSENTIAL', name: 'Essential', contents: [{ clinicalContent: { code: 'BLOOD_PRESSURE', name: 'Blood pressure', category: 'MEASUREMENT', resultType: 'BLOOD_PRESSURE', unit: 'mmHg', isActive: true }, sortOrder: 1, isActive: true }], addonAvailability: [{ isActive: true, clinicalContentId: 'cholesterol', clinicalContent: { id: 'cholesterol', code: 'CHOLESTEROL', name: 'Cholesterol', category: 'LAB', resultType: 'SINGLE_NUMERIC', unit: 'mmol/L', isActive: true } }] },
    addons: [{ clinicalContentId: 'cholesterol', priceMinor: '150000', currency: 'NGN', clinicalContent: { id: 'cholesterol', code: 'CHOLESTEROL', name: 'Cholesterol', category: 'LAB', resultType: 'SINGLE_NUMERIC', unit: 'mmol/L', isActive: true } }], ...changes,
  });
  const create = (row: any) => {
    const qb: any = {}; for (const name of ['innerJoinAndSelect', 'leftJoinAndSelect', 'where', 'andWhere']) qb[name] = jest.fn().mockReturnValue(qb);
    qb.getOne = jest.fn().mockResolvedValue(row);
    const patients={findOne:jest.fn().mockResolvedValue({id:'patient',userId:'user',status:'ACTIVE',deletedAt:null})};const quotes={create:jest.fn((x)=>x),save:jest.fn(async(x)=>({reference:'SC-HCQ-TEST',...x}))};
    return new HealthCheckConfigurationService({ createQueryBuilder: jest.fn().mockReturnValue(qb) } as never,patients as never,quotes as never,{} as never,{} as never,{} as never,{} as never,{} as never);
  };

  it('calculates base, clinical add-ons, fulfilment fee and total from authoritative rows', async () => {
    await expect(create(serviceRow()).quote({id:'user'} as never,{ packageCode: 'ESSENTIAL', providerReference: 'SCPR-ONE', fulfilmentModeCode: 'HOME_VISIT', addonCodes: ['CHOLESTEROL'] })).resolves.toMatchObject({ configurationReference:'SC-HCQ-TEST',pricing: { currency: 'NGN', basePackagePriceMinor: 800000, clinicalAddonsTotalMinor: 150000, fulfilmentFeeMinor: 250000, totalMinor: 1200000 }, includedContents: [{ code: 'BLOOD_PRESSURE', resultType: 'BLOOD_PRESSURE', unit: 'mmHg' }], selectedAddons: [{ code: 'CHOLESTEROL', resultType: 'SINGLE_NUMERIC', unit: 'mmol/L', amountMinor: 150000 }] });
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
  it('does not create an unowned quote when no active patient belongs to the user',async()=>{const qb:any={};for(const name of ['innerJoinAndSelect','leftJoinAndSelect','where','andWhere'])qb[name]=jest.fn().mockReturnValue(qb);qb.getOne=jest.fn().mockResolvedValue(serviceRow());const subject=new HealthCheckConfigurationService({createQueryBuilder:jest.fn().mockReturnValue(qb)}as never,{findOne:jest.fn().mockResolvedValue(null)}as never,{create:jest.fn(),save:jest.fn()}as never,{}as never,{}as never,{}as never,{}as never,{}as never);await expect(subject.quote({id:'user'}as never,{packageCode:'ESSENTIAL',providerReference:'SCPR-ONE',fulfilmentModeCode:'HOME_VISIT',addonCodes:[]})).rejects.toThrow('Patient profile not found');});
  it('discovers an arbitrary active package code using area-only geography', async () => { const capabilities = { findEligibleProviders: jest.fn().mockResolvedValue([]) }; const packages = { findOne: jest.fn().mockResolvedValue({ id: 'package', code: 'EXECUTIVE', estimatedDurationMinutes: 30 }) }; const subject = new HealthCheckConfigurationService({} as never, {} as never, {} as never, {} as never, packages as never, { findOne: jest.fn().mockResolvedValue({ id: 'mode' }) } as never, capabilities as never, {} as never); await subject.discover({ packageCode: 'EXECUTIVE', fulfilmentModeCode: 'PROVIDER_LOCATION', preferredDate: '2026-09-10', preferredTime: '09:00', timezone: 'Africa/Lagos', countryCode: 'NG', stateOrRegion: 'Lagos', city: 'Ikeja', page: 1, limit: 20 }); expect(packages.findOne).toHaveBeenCalledWith({ where: { code: 'EXECUTIVE', isActive: true } }); expect(capabilities.findEligibleProviders).toHaveBeenCalledWith('package', 'mode', expect.objectContaining({ visitAddress: null })); });

  it('keeps home-visit discovery bound to the patient service area', async () => { const capabilities = { findEligibleProviders: jest.fn().mockResolvedValue([]) }; const packages = { findOne: jest.fn().mockResolvedValue({ id: 'package', code: 'ESSENTIAL', estimatedDurationMinutes: 30 }) }; const subject = new HealthCheckConfigurationService({} as never, {} as never, {} as never, {} as never, packages as never, { findOne: jest.fn().mockResolvedValue({ id: 'mode', code: 'HOME_VISIT' }) } as never, capabilities as never, {} as never); await subject.discover({ packageCode: 'ESSENTIAL', fulfilmentModeCode: 'HOME_VISIT', preferredDate: '2026-09-26', preferredTime: '13:00', timezone: 'Africa/Lagos', countryCode: 'NG', stateOrRegion: 'FCT', city: 'Municipal', page: 1, limit: 20 }); expect(capabilities.findEligibleProviders).toHaveBeenCalledWith('package', 'mode', expect.objectContaining({ visitAddress: expect.objectContaining({ countryCode: 'NG', stateOrRegion: 'FCT', city: 'Municipal' }) })); });

  it('falls back safely when staging lacks optional home-visit travel-pricing columns', async () => {
    const capabilities = { findEligibleProviders: jest.fn().mockResolvedValue([{ id: 'service-1' }]) };
    const packages = { findOne: jest.fn().mockResolvedValue({ id: 'package', code: 'ESSENTIAL', estimatedDurationMinutes: 30 }) };
    const modes = { findOne: jest.fn().mockResolvedValue({ id: 'mode', code: 'HOME_VISIT' }) };
    const manager = {
      query: jest.fn()
        .mockRejectedValueOnce(new Error('column travel_fee_minor does not exist'))
        .mockResolvedValueOnce([{ travel_fee_minor: 0, priority: 100, origin_latitude: null, origin_longitude: null, max_radius_km: null }]),
    };
    const services = {
      find: jest.fn().mockResolvedValue([{
        id: 'service-1',
        priceMinor: '800000',
        fulfilmentFeeMinor: '0',
        currency: 'NGN',
        provider: { providerReference: 'SCPR-ONE', displayName: 'Clinic' },
        fulfilmentMode: { code: 'HOME_VISIT', name: 'Home visit' },
        healthCheckPackage: { code: 'ESSENTIAL', contents: [], addonAvailability: [] },
        locationLinks: [],
        addons: [],
      }]),
      manager,
    };
    const subject = new HealthCheckConfigurationService(services as never, {} as never, {} as never, {} as never, packages as never, modes as never, capabilities as never, {} as never);
    const result = await subject.discover({ packageCode: 'ESSENTIAL', fulfilmentModeCode: 'HOME_VISIT', preferredDate: '2026-09-26', preferredTime: '13:00', timezone: 'Africa/Lagos', countryCode: 'NG', stateOrRegion: 'Federal Capital Territory', city: 'Municipal', page: 1, limit: 20 });
    expect(manager.query).toHaveBeenCalledTimes(2);
    expect(result.items).toEqual([expect.objectContaining({ providerReference: 'SCPR-ONE', travelFeeMinor: 0 })]);
  });

  it('binds a dependant configuration quote through PatientAccessService', async () => {
    const row = serviceRow({ healthCheckPackage: { ...serviceRow().healthCheckPackage, code: 'EXECUTIVE', name: 'Executive' } });
    const qb: any = {}; for (const name of ['innerJoinAndSelect', 'leftJoinAndSelect', 'where', 'andWhere']) qb[name] = jest.fn().mockReturnValue(qb); qb.getOne = jest.fn().mockResolvedValue(row);
    const quotes = { create: jest.fn((value) => value), save: jest.fn(async (value) => ({ reference: 'SC-HCQ-DEPENDANT', ...value })) };
    const dependant = { id: 'dependant-1', patientReference: 'SCP-CHLD-0001' };
    const access = { resolveAccessiblePatient: jest.fn().mockResolvedValue(dependant) };
    const subject = new HealthCheckConfigurationService({ createQueryBuilder: jest.fn().mockReturnValue(qb) } as never, {} as never, quotes as never, {} as never, {} as never, {} as never, {} as never, access as never);
    await subject.quote({ id: 'guardian-1' } as never, { packageCode: 'EXECUTIVE', providerReference: 'SCPR-ONE', fulfilmentModeCode: 'HOME_VISIT', addonCodes: [], participantPatientReference: dependant.patientReference });
    expect(access.resolveAccessiblePatient).toHaveBeenCalledWith('guardian-1', dependant.patientReference);
    expect(quotes.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'guardian-1', patientId: dependant.id }));
  });
});
