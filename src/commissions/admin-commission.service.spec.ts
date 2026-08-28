import { AdminCommissionService } from './admin-commission.service';
import { CommissionConfigHistory } from './entities/commission-config-history.entity';
import { PlatformCommissionSetting } from './entities/platform-commission-setting.entity';
import { Provider } from '../providers/entities/provider.entity';

describe('AdminCommissionService', () => {
  const actor = '20000000-0000-4000-8000-000000000001';
  let setting: any, provider: any, settings: any, providers: any, history: any, resolver: any, subject: AdminCommissionService;
  beforeEach(() => {
    setting = { id: 1, defaultProviderCommissionBps: null, updatedByUserId: null, updatedAt: new Date() };
    provider = { id: '10000000-0000-4000-8000-000000000001', providerReference: 'SCPR-ABC', providerType: 'CLINIC', commissionOverrideBps: null, deletedAt: null };
    settings = { findOneBy: jest.fn(async () => setting), findOne: jest.fn(async () => setting), create: jest.fn((value) => value), save: jest.fn(async (value) => { setting = value; return value; }) };
    providers = { findOne: jest.fn(async () => provider), save: jest.fn(async (value) => value) };
    history = { save: jest.fn(async (value) => value) };
    const manager: any = { getRepository: jest.fn((entity) => entity === PlatformCommissionSetting ? settings : entity === Provider ? providers : entity === CommissionConfigHistory ? history : null) };
    manager.transaction = jest.fn(async work => work(manager)); settings.manager = manager; providers.manager = manager;
    resolver = { resolveForProvider: jest.fn(async () => provider.commissionOverrideBps === null ? setting.defaultProviderCommissionBps === null ? { configured: false, source: null, rateBasisPoints: null } : { configured: true, source: 'PLATFORM_DEFAULT', rateBasisPoints: setting.defaultProviderCommissionBps } : { configured: true, source: 'PROVIDER_OVERRIDE', rateBasisPoints: provider.commissionOverrideBps }) };
    subject = new AdminCommissionService(settings, providers, resolver);
  });
  it('represents a missing platform default explicitly', async () => expect(subject.getPlatform()).resolves.toMatchObject({ configured: false, commissionBasisPoints: null }));
  it.each([0, 750, 1000, 10000])('configures %s basis points and appends actor/old/new audit history', async rate => { await expect(subject.setPlatform(rate, actor)).resolves.toMatchObject({ configured: true, commissionBasisPoints: rate }); expect(history.save).toHaveBeenCalledWith(expect.objectContaining({ oldRateBps: null, newRateBps: rate, actorUserId: actor })); });
  it('sets zero override and clearing it restores inheritance', async () => { await subject.setProvider(provider.id, 0, actor); expect(provider.commissionOverrideBps).toBe(0); await expect(subject.setProvider(provider.id, null, actor)).resolves.toMatchObject({ providerOverrideBasisPoints: null, effectiveBasisPoints: null }); expect(history.save).toHaveBeenCalledTimes(2); });
});
