import { ConflictException } from '@nestjs/common';
import { CommissionResolutionService } from './commission-resolution.service';
import { CommissionRateSource } from './enums/commission-rate-source.enum';

describe('CommissionResolutionService', () => {
  let provider: any, setting: any, providers: any, settings: any, subject: CommissionResolutionService;
  beforeEach(() => {
    provider = { id: '10000000-0000-4000-8000-000000000001', providerType: 'CLINIC', commissionOverrideBps: null, deletedAt: null };
    setting = { id: 1, defaultProviderCommissionBps: 1000 };
    providers = { findOne: jest.fn().mockImplementation(async () => provider) };
    settings = { findOneBy: jest.fn().mockImplementation(async () => setting) };
    subject = new CommissionResolutionService(providers, settings);
  });
  it('inherits the configured platform default', async () => expect(subject.resolveForProvider(provider.id)).resolves.toEqual({ configured: true, source: CommissionRateSource.PLATFORM_DEFAULT, rateBasisPoints: 1000 }));
  it('uses a five-percent Provider override', async () => { provider.commissionOverrideBps = 500; await expect(subject.resolveForProvider(provider.id)).resolves.toEqual({ configured: true, source: CommissionRateSource.PROVIDER_OVERRIDE, rateBasisPoints: 500 }); });
  it('treats zero as an explicit override and does not use truthiness', async () => { provider.commissionOverrideBps = 0; await expect(subject.resolveForProvider(provider.id)).resolves.toEqual({ configured: true, source: CommissionRateSource.PROVIDER_OVERRIDE, rateBasisPoints: 0 }); });
  it('resolves an override even when the platform default is not configured', async () => { setting = { id: 1, defaultProviderCommissionBps: null }; provider.commissionOverrideBps = 750; await expect(subject.resolveForProvider(provider.id)).resolves.toMatchObject({ configured: true, rateBasisPoints: 750 }); expect(settings.findOneBy).not.toHaveBeenCalled(); });
  it('returns explicit not-configured and offers a fail-closed require method', async () => { setting = null; await expect(subject.resolveForProvider(provider.id)).resolves.toEqual({ configured: false, source: null, rateBasisPoints: null }); await expect(subject.requireForProvider(provider.id)).rejects.toBeInstanceOf(ConflictException); });
  it('does not derive commission from Provider type', async () => { provider.providerType = 'PHARMACY'; await expect(subject.resolveForProvider(provider.id)).resolves.toMatchObject({ rateBasisPoints: 1000 }); });
});
