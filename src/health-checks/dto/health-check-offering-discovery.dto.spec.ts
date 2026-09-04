import { ValidationPipe } from '@nestjs/common';
import { HealthCheckOfferingDiscoveryDto } from './health-check-offering-discovery.dto';

describe('HealthCheckOfferingDiscoveryDto', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const input = { packageCode: ' executive ', fulfilmentModeCode: 'PROVIDER_LOCATION', preferredDate: '2026-09-10', preferredTime: '09:00', timezone: 'Africa/Lagos', countryCode: 'NG', stateOrRegion: 'Lagos', city: 'Ikeja' };

  it('accepts and normalizes an arbitrary canonical package code', async () => {
    await expect(pipe.transform(input, { type: 'query', metatype: HealthCheckOfferingDiscoveryDto })).resolves.toMatchObject({ packageCode: 'EXECUTIVE' });
  });

  it('still rejects malformed package codes', async () => {
    await expect(pipe.transform({ ...input, packageCode: 'bad code' }, { type: 'query', metatype: HealthCheckOfferingDiscoveryDto })).rejects.toBeDefined();
  });
});
