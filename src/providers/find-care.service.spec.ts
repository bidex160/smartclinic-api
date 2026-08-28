import { NotFoundException } from '@nestjs/common';
import { FindCareService } from './find-care.service';
import { ProviderOnboardingStatus } from './enums/provider-onboarding-status.enum';
import { ProviderStatus } from './enums/provider-status.enum';
import { CareDeliveryMode } from './enums/care-delivery-mode.enum';

const provider = () => ({
  id: 'internal-provider-id', providerReference: 'SCPR-ABCDEF0123456789', displayName: 'Ada Clinic', providerType: 'CLINIC', city: 'Ikeja', stateOrRegion: 'Lagos', countryCode: 'NG',
  email: 'private@example.test', phone: '+2348000000000', professionalReference: 'LICENCE-PRIVATE', status: ProviderStatus.ACTIVE, onboardingStatus: ProviderOnboardingStatus.APPROVED,
  locations: [{ id: 'internal-location', isActive: true, name: 'Ikeja Branch', addressLine1: '1 Clinic Road', addressLine2: null, city: 'Ikeja', state: 'Lagos', postalCode: null, countryCode: 'NG' }],
  careServices: [{ id: 'internal-service', isActive: true, priceMinor: '250000', currency: 'NGN', descriptionOverride: null, supportsAppointmentRequests: true, deliveryModes: [CareDeliveryMode.IN_PERSON, CareDeliveryMode.VIRTUAL], definition: { id: 'internal-definition', code: 'GENERAL_CONSULTATION', name: 'General consultation', description: 'Consult a clinician', isActive: true } }],
});

function qb(rows = [provider()]) {
  const value: any = {};
  for (const method of ['distinct', 'innerJoinAndSelect', 'leftJoinAndSelect', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'skip', 'take']) value[method] = jest.fn().mockReturnValue(value);
  value.getManyAndCount = jest.fn().mockResolvedValue([rows, rows.length]);
  value.getOne = jest.fn().mockResolvedValue(rows[0] ?? null);
  return value;
}

describe('FindCareService', () => {
  it('requires ACTIVE and APPROVED providers and active services in every public query', async () => {
    const builder = qb(); const providers = { createQueryBuilder: jest.fn().mockReturnValue(builder) };
    const result = await new FindCareService(providers as any, {} as any).providersList({ page: 1, limit: 20 });
    expect(builder.where).toHaveBeenCalledWith('provider.status = :active', { active: ProviderStatus.ACTIVE });
    expect(builder.andWhere).toHaveBeenCalledWith('provider.onboardingStatus = :approved', { approved: ProviderOnboardingStatus.APPROVED });
    expect(builder.innerJoinAndSelect).toHaveBeenCalledWith('provider.careServices', 'careService', 'careService.isActive = true');
    expect(result.items).toHaveLength(1);
  });

  it('applies service, provider type, and authoritative location filters', async () => {
    const builder = qb(); const service = new FindCareService({ createQueryBuilder: jest.fn().mockReturnValue(builder) } as any, {} as any);
    await service.providersList({ serviceCode: 'GENERAL_CONSULTATION', providerType: 'CLINIC' as any, deliveryMode: CareDeliveryMode.VIRTUAL, countryCode: 'NG', stateOrRegion: 'Lagos', city: 'Ikeja', page: 1, limit: 20 });
    const sql = builder.andWhere.mock.calls.map((call: any[]) => call[0]).filter((v: unknown) => typeof v === 'string').join(' ');
    expect(sql).toContain('definition.code = :serviceCode'); expect(sql).toContain('provider.providerType = :providerType'); expect(sql).toContain('careService.deliveryModes'); expect(sql).toContain('location.countryCode'); expect(sql).toContain('location.state'); expect(sql).toContain('location.city');
  });

  it('returns only safe public fields and integer minor-unit prices', async () => {
    const result: any = await new FindCareService({ createQueryBuilder: jest.fn().mockReturnValue(qb()) } as any, {} as any).providerDetail('SCPR-ABCDEF0123456789');
    expect(result).toMatchObject({ providerReference: 'SCPR-ABCDEF0123456789', services: [{ code: 'GENERAL_CONSULTATION', priceMinor: 250000, currency: 'NGN', deliveryModes: [CareDeliveryMode.IN_PERSON, CareDeliveryMode.VIRTUAL] }] });
    expect(result).not.toHaveProperty('id'); expect(result).not.toHaveProperty('email'); expect(result).not.toHaveProperty('phone'); expect(JSON.stringify(result)).not.toContain('internal-'); expect(JSON.stringify(result)).not.toContain('LICENCE-PRIVATE');
  });

  it('returns a narrow not-found response for a non-public provider', async () => {
    await expect(new FindCareService({ createQueryBuilder: jest.fn().mockReturnValue(qb([])) } as any, {} as any).providerDetail('SCPR-ABCDEF0123456789')).rejects.toBeInstanceOf(NotFoundException);
  });
});
