import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Provider } from '../providers/entities/provider.entity';
import { CommissionConfigHistory } from './entities/commission-config-history.entity';
import { PlatformCommissionSetting } from './entities/platform-commission-setting.entity';
import { CommissionConfigTarget } from './enums/commission-config-target.enum';
import { CommissionResolutionService } from './commission-resolution.service';

@Injectable()
export class AdminCommissionService {
  constructor(@InjectRepository(PlatformCommissionSetting) private readonly settings: Repository<PlatformCommissionSetting>, @InjectRepository(Provider) private readonly providers: Repository<Provider>, private readonly resolver: CommissionResolutionService) {}

  async getPlatform() {
    const row = await this.settings.findOneBy({ id: 1 });
    const rate = row?.defaultProviderCommissionBps ?? null;
    return { configured: rate !== null, commissionBasisPoints: rate, commissionPercentage: rate === null ? null : (rate / 100).toFixed(2), updatedAt: row?.updatedAt ?? null };
  }

  async setPlatform(rate: number, actorUserId: string) {
    await this.settings.manager.transaction(async manager => {
      const repository = manager.getRepository(PlatformCommissionSetting);
      let row = await repository.findOne({ where: { id: 1 }, lock: { mode: 'pessimistic_write' } });
      const oldRate = row?.defaultProviderCommissionBps ?? null;
      if (!row) row = repository.create({ id: 1, defaultProviderCommissionBps: rate, updatedByUserId: actorUserId });
      else { row.defaultProviderCommissionBps = rate; row.updatedByUserId = actorUserId; }
      await repository.save(row);
      if (oldRate !== rate) await manager.getRepository(CommissionConfigHistory).save({ target: CommissionConfigTarget.PLATFORM_DEFAULT, providerId: null, oldRateBps: oldRate, newRateBps: rate, actorUserId });
    });
    return this.getPlatform();
  }

  async getProvider(providerId: string) {
    const provider = await this.providers.findOne({ where: { id: providerId }, withDeleted: true });
    if (!provider || provider.deletedAt) throw new NotFoundException('Provider not found');
    const setting = await this.settings.findOneBy({ id: 1 });
    const resolution = await this.resolver.resolveForProvider(providerId);
    return { providerReference: provider.providerReference, platformDefaultBasisPoints: setting?.defaultProviderCommissionBps ?? null, providerOverrideBasisPoints: provider.commissionOverrideBps, configured: resolution.configured, effectiveBasisPoints: resolution.rateBasisPoints, source: resolution.source };
  }

  async setProvider(providerId: string, rate: number | null, actorUserId: string) {
    await this.providers.manager.transaction(async manager => {
      const repository = manager.getRepository(Provider);
      const provider = await repository.findOne({ where: { id: providerId }, withDeleted: true, lock: { mode: 'pessimistic_write' } });
      if (!provider || provider.deletedAt) throw new NotFoundException('Provider not found');
      const oldRate = provider.commissionOverrideBps;
      provider.commissionOverrideBps = rate;
      await repository.save(provider);
      if (oldRate !== rate) await manager.getRepository(CommissionConfigHistory).save({ target: CommissionConfigTarget.PROVIDER_OVERRIDE, providerId, oldRateBps: oldRate, newRateBps: rate, actorUserId });
    });
    return this.getProvider(providerId);
  }
}
