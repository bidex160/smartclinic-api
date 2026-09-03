import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { getMetadataArgsStorage } from 'typeorm';

import { FindCareQueryDto } from './dto/care-service.dto';
import { CreateAdminProviderDto } from './dto/admin-provider-management.dto';
import { RegisterProviderDto } from './dto/provider-onboarding.dto';
import { ProviderType } from './enums/provider-type.enum';
import { Provider } from './entities/provider.entity';

describe('ProviderType contract', () => {
  const registration = {
    displayName: 'University Hospital',
    email: 'hospital@example.test',
    phone: '+2348000000000',
    password: 'very-secure-password',
    providerType: 'HOSPITAL',
    countryCode: 'NG',
    stateOrRegion: 'Oyo',
    city: 'Ibadan',
  };

  it('accepts HOSPITAL across registration, Admin creation, and public provider filtering', async () => {
    const registerErrors = await validate(plainToInstance(RegisterProviderDto, registration));
    const adminErrors = await validate(plainToInstance(CreateAdminProviderDto, { ...registration, password: undefined }));
    const filterErrors = await validate(plainToInstance(FindCareQueryDto, { providerType: 'HOSPITAL' }));

    expect(registerErrors).toEqual([]);
    expect(adminErrors).toEqual([]);
    expect(filterErrors).toEqual([]);
    expect(ProviderType.HOSPITAL).toBe('HOSPITAL');
  });

  it('keeps every existing type valid and rejects unknown provider types', async () => {
    for (const providerType of ['INDIVIDUAL', 'CLINIC', 'DIAGNOSTIC_CENTRE', 'PHARMACY', 'OTHER']) {
      await expect(validate(plainToInstance(RegisterProviderDto, { ...registration, providerType }))).resolves.toEqual([]);
    }

    const errors = await validate(plainToInstance(RegisterProviderDto, { ...registration, providerType: 'HOSPITAL_SYSTEM' }));
    expect(errors.some((error) => error.property === 'providerType')).toBe(true);
  });

  it('uses the shared PostgreSQL enum contract for persistence', () => {
    const column = getMetadataArgsStorage().columns.find((candidate) => candidate.target === Provider && candidate.propertyName === 'providerType');
    expect(column?.options).toMatchObject({ type: 'enum', enum: ProviderType, enumName: 'provider_type_enum' });
  });
});
