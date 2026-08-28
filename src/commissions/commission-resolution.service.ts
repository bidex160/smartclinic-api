import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Provider } from '../providers/entities/provider.entity';
import { PlatformCommissionSetting } from './entities/platform-commission-setting.entity';
import { CommissionRateSource } from './enums/commission-rate-source.enum';

export type CommissionResolution =
  | { configured: true; source: CommissionRateSource; rateBasisPoints: number }
  | { configured: false; source: null; rateBasisPoints: null };

@Injectable()
export class CommissionResolutionService {
  constructor(@InjectRepository(Provider) private readonly providers: Repository<Provider>, @InjectRepository(PlatformCommissionSetting) private readonly settings: Repository<PlatformCommissionSetting>) {}

  async resolveForProvider(providerId: string): Promise<CommissionResolution> {
    const provider = await this.providers.findOne({ where: { id: providerId, deletedAt: IsNull() }, select: { id: true, commissionOverrideBps: true } });
    if (!provider) throw new NotFoundException('Provider not found');
    if (provider.commissionOverrideBps !== null && provider.commissionOverrideBps !== undefined) return { configured: true, source: CommissionRateSource.PROVIDER_OVERRIDE, rateBasisPoints: provider.commissionOverrideBps };
    const setting = await this.settings.findOneBy({ id: 1 });
    if (!setting || setting.defaultProviderCommissionBps === null) return { configured: false, source: null, rateBasisPoints: null };
    return { configured: true, source: CommissionRateSource.PLATFORM_DEFAULT, rateBasisPoints: setting.defaultProviderCommissionBps };
  }

  async requireForProvider(providerId: string): Promise<Extract<CommissionResolution, { configured: true }>> {
    const resolution = await this.resolveForProvider(providerId);
    if (!resolution.configured) throw new ConflictException('Provider commission is not configured');
    return resolution;
  }
}
