import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProviderLocationDto } from './create-provider-location.dto';

const valid = { name: 'Clinic', addressLine1: '1 Main Road', city: 'Lagos', state: 'Lagos', countryCode: 'NG' };
describe('CreateProviderLocationDto', () => {
  it('normalizes and accepts an ISO country code', async () => { const dto = plainToInstance(CreateProviderLocationDto, { ...valid, countryCode: ' ng ' }); expect(await validate(dto)).toHaveLength(0); expect(dto.countryCode).toBe('NG'); });
  it('rejects an invalid country code', async () => expect(await validate(plainToInstance(CreateProviderLocationDto, { ...valid, countryCode: 'NGA' }))).not.toHaveLength(0));
  it.each([['latitude', 90.1], ['latitude', -90.1], ['longitude', 180.1], ['longitude', -180.1]])('rejects invalid %s %s', async (field, value) => expect(await validate(plainToInstance(CreateProviderLocationDto, { ...valid, [field]: value }))).not.toHaveLength(0));
  it('accepts valid coordinates', async () => expect(await validate(plainToInstance(CreateProviderLocationDto, { ...valid, latitude: 6.5244, longitude: 3.3792 }))).toHaveLength(0));
});
