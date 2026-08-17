import { Injectable, InternalServerErrorException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { PackagePrice } from './entities/package-price.entity';

export const BOOKING_CURRENCY = 'NGN';

export interface ResolvedPackagePrice {
  amount: string;
  currency: string;
}

@Injectable()
export class PackagePricingService {
  constructor(
    @InjectRepository(PackagePrice)
    private readonly packagePriceRepository: Repository<PackagePrice>,
  ) {}

  async resolveCurrentPrice(
    healthCheckPackageId: string,
    fulfilmentModeId: string,
    now = new Date(),
    manager?: EntityManager,
  ): Promise<ResolvedPackagePrice> {
    const today = now.toISOString().slice(0, 10);
    const repository = manager?.getRepository(PackagePrice) ?? this.packagePriceRepository;
    const candidates = await repository.find({
      where: { healthCheckPackageId, fulfilmentModeId, currency: BOOKING_CURRENCY },
    });
    const applicablePrices = candidates.filter(
      (price) =>
        price.currency === BOOKING_CURRENCY &&
        price.isActive &&
        price.effectiveFrom <= today &&
        (price.effectiveTo === null || today < price.effectiveTo),
    );

    if (applicablePrices.length === 0) {
      throw new UnprocessableEntityException(
        'No current catalogue price is available for the selected package and fulfilment mode',
      );
    }

    if (applicablePrices.length > 1) {
      throw new InternalServerErrorException('Catalogue pricing integrity failure');
    }

    return { amount: applicablePrices[0].amount, currency: applicablePrices[0].currency };
  }
}
