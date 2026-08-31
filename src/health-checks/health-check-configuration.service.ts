import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProviderService } from '../providers/entities/provider-service.entity';
import { ProviderStatus } from '../providers/enums/provider-status.enum';
import { ProviderOnboardingStatus } from '../providers/enums/provider-onboarding-status.enum';
import { HealthCheckConfigurationQuoteDto } from './dto/health-check-configuration-quote.dto';

@Injectable()
export class HealthCheckConfigurationService {
  constructor(@InjectRepository(ProviderService) private readonly services: Repository<ProviderService>) {}

  async quote(dto: HealthCheckConfigurationQuoteDto) {
    if (dto.addonCodes.includes('HOME_VISIT')) throw new BadRequestException('HOME_VISIT is a fulfilment mode, not a clinical add-on');
    const service = await this.services.createQueryBuilder('service')
      .innerJoinAndSelect('service.provider', 'provider')
      .innerJoinAndSelect('service.healthCheckPackage', 'package')
      .innerJoinAndSelect('service.fulfilmentMode', 'mode')
      .leftJoinAndSelect('package.contents', 'content', 'content.isActive=true')
      .leftJoinAndSelect('package.addonAvailability', 'availability', 'availability.isActive=true')
      .leftJoinAndSelect('availability.addon', 'availableAddon', 'availableAddon.isActive=true')
      .leftJoinAndSelect('service.addons', 'capability', 'capability.isActive=true')
      .leftJoinAndSelect('capability.addon', 'addon', 'addon.isActive=true')
      .where('package.code=:packageCode', { packageCode: dto.packageCode }).andWhere('package.isActive=true')
      .andWhere('provider.providerReference=:providerReference', { providerReference: dto.providerReference })
      .andWhere('provider.status=:providerStatus', { providerStatus: ProviderStatus.ACTIVE })
      .andWhere('provider.onboardingStatus=:approved', { approved: ProviderOnboardingStatus.APPROVED })
      .andWhere('provider.deletedAt IS NULL').andWhere('mode.code=:modeCode', { modeCode: dto.fulfilmentModeCode })
      .andWhere('mode.isActive=true').andWhere('service.isActive=true').getOne();
    if (!service) throw new NotFoundException('Eligible Provider Health Check configuration not found');
    const duplicates = dto.addonCodes.filter((code) => service.healthCheckPackage.contents.some((content) => content.code === code));
    if (duplicates.length) throw new ConflictException(`Clinical add-on is already included in the package: ${duplicates.join(', ')}`);
    const allowed = new Set(service.healthCheckPackage.addonAvailability.map((link) => link.addon.code));
    const selected = dto.addonCodes.map((code) => {
      if (!allowed.has(code)) throw new BadRequestException(`Clinical add-on is unavailable for this package: ${code}`);
      const capability = service.addons.find((row) => row.addon.code === code);
      if (!capability) throw new ConflictException(`Provider does not offer clinical add-on: ${code}`);
      if (capability.currency !== service.currency) throw new ConflictException('Clinical add-on currency does not match the package currency');
      return capability;
    });
    const base = BigInt(service.priceMinor), fee = BigInt(service.fulfilmentFeeMinor ?? '0');
    const addons = selected.reduce((sum, row) => sum + BigInt(row.priceMinor), 0n);
    return { package: { code: service.healthCheckPackage.code, name: service.healthCheckPackage.name }, provider: { providerReference: service.provider.providerReference, name: service.provider.displayName }, fulfilmentMode: { code: service.fulfilmentMode.code, name: service.fulfilmentMode.name }, includedContents: service.healthCheckPackage.contents.sort((a, b) => a.sortOrder - b.sortOrder).map((x) => ({ code: x.code, name: x.name, category: x.category })), selectedAddons: selected.map((x) => ({ code: x.addon.code, name: x.addon.name, priceMinor: Number(x.priceMinor) })), pricing: { currency: service.currency, basePackagePriceMinor: Number(base), clinicalAddonsTotalMinor: Number(addons), fulfilmentFeeMinor: Number(fee), totalMinor: Number(base + addons + fee) } };
  }
}
