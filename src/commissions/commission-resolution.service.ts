import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { Provider } from '../providers/entities/provider.entity';
import { PlatformCommissionSetting } from './entities/platform-commission-setting.entity';
import { CommissionRateSource } from './enums/commission-rate-source.enum';

export type CommissionResolution =
  | { configured: true; source: CommissionRateSource; rateBasisPoints: number }
  | { configured: false; source: null; rateBasisPoints: null };

@Injectable()
export class CommissionResolutionService {
  constructor(@InjectRepository(Provider) private readonly providers: Repository<Provider>, @InjectRepository(PlatformCommissionSetting) private readonly settings: Repository<PlatformCommissionSetting>) {}

  async resolveForProvider(providerId: string, manager?: EntityManager): Promise<CommissionResolution> {
    const providerRepository = manager?.getRepository(Provider) ?? this.providers;
    const settingRepository = manager?.getRepository(PlatformCommissionSetting) ?? this.settings;
    const provider = await providerRepository.findOne({ where: { id: providerId, deletedAt: IsNull() }, select: { id: true, commissionOverrideBps: true }, lock: manager ? { mode: 'pessimistic_read' } : undefined });
    if (!provider) throw new NotFoundException('Provider not found');
    if (provider.commissionOverrideBps !== null && provider.commissionOverrideBps !== undefined) return { configured: true, source: CommissionRateSource.PROVIDER_OVERRIDE, rateBasisPoints: provider.commissionOverrideBps };
    const setting = manager ? await settingRepository.findOne({ where: { id: 1 }, lock: { mode: 'pessimistic_read' } }) : await settingRepository.findOneBy({ id: 1 });
    if (!setting || setting.defaultProviderCommissionBps === null) return { configured: false, source: null, rateBasisPoints: null };
    return { configured: true, source: CommissionRateSource.PLATFORM_DEFAULT, rateBasisPoints: setting.defaultProviderCommissionBps };
  }

  async requireForProvider(providerId: string, manager?: EntityManager): Promise<Extract<CommissionResolution, { configured: true }>> {
    const resolution = await this.resolveForProvider(providerId, manager);
    if (!resolution.configured) throw new ConflictException('Provider commission is not configured');
    return resolution;
  }
}
