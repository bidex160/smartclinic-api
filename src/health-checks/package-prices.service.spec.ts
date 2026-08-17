import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

import { CreatePackagePriceDto } from './dto/create-package-price.dto';
import { PackagePrice } from './entities/package-price.entity';
import { PackagePricesService } from './package-prices.service';

describe('PackagePricesService', () => {
  const createDto: CreatePackagePriceDto = {
    healthCheckPackageId: 'd3f17322-2dab-42bd-a006-35c3b864849d',
    fulfilmentModeId: '3c233f29-a510-4602-a337-df7e2d1e5a4a',
    amount: '12500.00',
    currency: 'NGN',
    effectiveFrom: '2026-09-01',
  };

  function createService(options: {
    packageExists?: boolean;
    modeExists?: boolean;
    prices?: PackagePrice[];
    saveError?: Error;
  } = {}) {
    const prices = options.prices ?? [];
    const save = jest.fn(async (input: PackagePrice) => {
      if (options.saveError) throw options.saveError;
      return {
        ...input,
        id: input.id ?? '9e914be4-e7c6-4c12-9e70-85c6d1a4f109',
        createdAt: input.createdAt ?? new Date('2026-08-17T12:00:00.000Z'),
        updatedAt: new Date('2026-08-17T12:00:00.000Z'),
      };
    });
    const priceRepository: {
      create: jest.Mock;
      save: jest.Mock;
      find: jest.Mock;
      findOne: jest.Mock;
      manager: { transaction: jest.Mock };
    } = {
      create: jest.fn((input: PackagePrice) => input),
      save,
      find: jest.fn().mockResolvedValue(prices),
      findOne: jest.fn().mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(prices.find((price) => price.id === where.id) ?? null),
      ),
      manager: { transaction: jest.fn() },
    };
    priceRepository.manager.transaction.mockImplementation((work: (manager: unknown) => unknown) =>
      work({ getRepository: () => priceRepository }),
    );
    const healthCheckPackageRepository = { exists: jest.fn().mockResolvedValue(options.packageExists ?? true) };
    const fulfilmentModeRepository = { exists: jest.fn().mockResolvedValue(options.modeExists ?? true) };
    return {
      service: new PackagePricesService(
        priceRepository as never,
        healthCheckPackageRepository as never,
        fulfilmentModeRepository as never,
      ),
      priceRepository,
      healthCheckPackageRepository,
      fulfilmentModeRepository,
    };
  }

  it('creates a valid NGN price with active catalogue references', async () => {
    const { service, priceRepository } = createService();

    await expect(service.create(createDto)).resolves.toMatchObject({
      amount: '12500.00',
      currency: 'NGN',
      effectiveFrom: '2026-09-01',
      effectiveTo: null,
      isActive: true,
    });
    expect(priceRepository.create).toHaveBeenCalledWith(expect.objectContaining({ isActive: true }));
  });

  it('lists retained price history and retrieves a price by its UUID', async () => {
    const price = {
      id: 'historical-price', ...createDto, effectiveTo: '2026-10-01', isActive: false,
      createdAt: new Date('2026-08-01T00:00:00.000Z'), updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    } as PackagePrice;
    const { service, priceRepository } = createService({ prices: [price] });

    await expect(service.findAll()).resolves.toEqual([expect.objectContaining({ id: price.id, isActive: false })]);
    await expect(service.findOne(price.id)).resolves.toEqual(expect.objectContaining({ id: price.id }));
    expect(priceRepository.find).toHaveBeenCalledWith({
      order: { healthCheckPackageId: 'ASC', fulfilmentModeId: 'ASC', effectiveFrom: 'DESC' },
    });
    await expect(service.findOne('missing-price')).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    ['invalid amount', { ...createDto, amount: '0.00' }, BadRequestException],
    ['non-NGN currency', { ...createDto, currency: 'USD' }, UnprocessableEntityException],
    ['invalid effective range', { ...createDto, effectiveTo: '2026-09-01' }, BadRequestException],
  ])('rejects a %s', async (_scenario, dto, exception) => {
    const { service } = createService();
    await expect(service.create(dto)).rejects.toBeInstanceOf(exception);
  });

  it('rejects inactive package and fulfilment-mode references', async () => {
    await expect(createService({ packageExists: false }).service.create(createDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(createService({ modeExists: false }).service.create(createDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('maps the database active-range exclusion constraint to a conflict', async () => {
    const overlap = new QueryFailedError('INSERT INTO package_prices', [], {
      constraint: 'EX_package_prices_active_effective_range',
    } as Error & { constraint: string });
    const { service } = createService({ saveError: overlap });

    await expect(service.create(createDto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('schedules a future price by closing the current price at the new effective date', async () => {
    const current = {
      id: 'current-price',
      ...createDto,
      amount: '10000.00',
      effectiveFrom: '2026-08-01',
      effectiveTo: null,
      isActive: true,
    } as PackagePrice;
    const { service, priceRepository } = createService({ prices: [current] });

    await expect(service.schedule(createDto)).resolves.toMatchObject({ effectiveFrom: '2026-09-01' });
    expect(priceRepository.save).toHaveBeenNthCalledWith(1, expect.objectContaining({
      id: 'current-price', amount: '10000.00', effectiveTo: '2026-09-01',
    }));
    expect(priceRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      amount: '12500.00', effectiveFrom: '2026-09-01', effectiveTo: null,
    }));
  });

  it('inserts a price before an existing future price without overwriting either amount', async () => {
    const current = {
      id: 'current-price', ...createDto, amount: '10000.00', effectiveFrom: '2026-08-01', effectiveTo: '2026-09-01', isActive: true,
    } as PackagePrice;
    const future = {
      id: 'future-price', ...createDto, amount: '15000.00', effectiveFrom: '2026-09-01', effectiveTo: null, isActive: true,
    } as PackagePrice;
    const { service, priceRepository } = createService({ prices: [current, future] });
    const between = { ...createDto, amount: '12000.00', effectiveFrom: '2026-08-15' };

    await service.schedule(between);

    expect(priceRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      id: 'current-price', amount: '10000.00', effectiveTo: '2026-08-15',
    }));
    expect(priceRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      amount: '12000.00', effectiveFrom: '2026-08-15', effectiveTo: '2026-09-01',
    }));
    expect(future.amount).toBe('15000.00');
  });

  it('deactivates a price without deleting it or changing its historical amount', async () => {
    const price = {
      id: 'historical-price', ...createDto, effectiveTo: null, isActive: true,
      createdAt: new Date('2026-08-01T00:00:00.000Z'), updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    } as PackagePrice;
    const { service, priceRepository } = createService({ prices: [price] });

    await expect(service.deactivate(price.id)).resolves.toMatchObject({ isActive: false, amount: '12500.00' });
    expect(priceRepository.save).toHaveBeenCalledWith(expect.objectContaining({ id: price.id, isActive: false, amount: '12500.00' }));
  });
});
