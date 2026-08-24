import { BadRequestException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

import { BookingStatusHistory } from './entities/booking-status-history.entity';
import { Booking } from './entities/booking.entity';
import * as bookingReference from './booking-reference';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingStatus } from './enums/booking-status.enum';

describe('BookingsService', () => {
  const createBookingDto: CreateBookingDto = {
    bookerUserId: '0b5161b0-9e9c-4baa-9ad5-8d3dc2e10273',
    participantPatientId: '4c7b8fe6-f9c1-4f01-9a0c-68daf48e1e0e',
    healthCheckPackageId: 'd3f17322-2dab-42bd-a006-35c3b864849d',
    fulfilmentModeId: '3c233f29-a510-4602-a337-df7e2d1e5a4a',
    preferredDate: '2026-08-20',
    preferredTimeWindowStart: '09:00',
    preferredTimeWindowEnd: '12:00',
    preferredTimezone: 'Africa/Lagos',
  };

  function createService(exists = true, priceError?: Error) {
    const savedBooking = {
      ...createBookingDto,
      id: 'e1585f20-fa0e-4e8f-9a8a-a6ba805ef5a5',
      bookingReference: 'SC-2026-ABCDEFGHIJKL',
      organisationContextId: null,
      quotedAmount: '12500.00',
      currency: 'NGN',
      preferredLocationNote: null,
      status: BookingStatus.DRAFT,
      createdAt: new Date('2026-08-17T12:00:00.000Z'),
      updatedAt: new Date('2026-08-17T12:00:00.000Z'),
      visitAddressSummary: null,
      healthCheckPackage: { code: 'ESSENTIAL', name: 'Essential Health Check' },
      fulfilmentMode: { code: 'PROVIDER_LOCATION', name: 'Provider location' },
      participant: { givenName: 'Ada', familyName: 'Okafor' },
    } as unknown as Booking;
    const transactionalBookingRepository = {
      create: jest.fn((input: Booking) => input),
      save: jest.fn().mockResolvedValue(savedBooking),
    };
    const transactionalHistoryRepository = {
      create: jest.fn((input: BookingStatusHistory) => input),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === Booking ? transactionalBookingRepository : transactionalHistoryRepository,
      ),
    };
    const bookingRepository = {
      manager: { transaction: jest.fn((work: (transactionManager: typeof manager) => unknown) => work(manager)) },
      findOne: jest.fn().mockResolvedValue(savedBooking),
    };
    const referenceRepository = { exists: jest.fn().mockResolvedValue(exists), findOne: jest.fn().mockResolvedValue({ code: 'PROVIDER_LOCATION' }) };
    const packagePricingService = {
      resolveCurrentPrice: priceError
        ? jest.fn().mockRejectedValue(priceError)
        : jest.fn().mockResolvedValue({ amount: '12500.00', currency: 'NGN' }),
    };
    const service = new BookingsService(
      bookingRepository as never,
      referenceRepository as never,
      referenceRepository as never,
      referenceRepository as never,
      referenceRepository as never,
      referenceRepository as never,
      packagePricingService as never,
    );

    return {
      service,
      bookingRepository,
      manager,
      transactionalBookingRepository,
      transactionalHistoryRepository,
      referenceRepository,
      packagePricingService,
    };
  }

  it('creates a draft booking and its initial status-history record atomically', async () => {
    const { service, transactionalBookingRepository, transactionalHistoryRepository } = createService();
    jest.spyOn(bookingReference, 'generateBookingReference').mockReturnValue('SC-2026-ABCDEFGHIJKL');

    await expect(service.create(createBookingDto)).resolves.toMatchObject({
      bookingReference: 'SC-2026-ABCDEFGHIJKL',
      status: BookingStatus.DRAFT,
      healthCheckPackage: { code: 'ESSENTIAL' },
      participant: { givenName: 'Ada' },
    });
    expect(transactionalBookingRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingReference: 'SC-2026-ABCDEFGHIJKL',
        status: BookingStatus.DRAFT,
        quotedAmount: '12500.00',
        currency: 'NGN',
        preferredTimezone: 'Africa/Lagos',
      }),
    );
    expect(transactionalHistoryRepository.create).toHaveBeenCalledWith({
      bookingId: 'e1585f20-fa0e-4e8f-9a8a-a6ba805ef5a5',
      fromStatus: null,
      toStatus: BookingStatus.DRAFT,
      actorUserId: createBookingDto.bookerUserId,
    });
  });

  it('ignores a legacy client end time and persists no authoritative preference end', async () => {
    const { service, bookingRepository } = createService();

    await expect(service.create({ ...createBookingDto, preferredTimeWindowStart: '12:00', preferredTimeWindowEnd: '09:00' })).resolves.toBeDefined();
    expect(bookingRepository.manager.transaction).toHaveBeenCalled();
  });

  it('rejects incomplete scheduling context before persistence', async () => {
    const { service, bookingRepository } = createService();
    await expect(service.create({ ...createBookingDto, preferredTimezone: undefined } as unknown as CreateBookingDto)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ ...createBookingDto, preferredTimeWindowEnd: undefined })).resolves.toBeDefined();
    expect(bookingRepository.manager.transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects unavailable referenced records before persistence', async () => {
    const { service, bookingRepository } = createService(false);

    await expect(service.create(createBookingDto)).rejects.toBeInstanceOf(BadRequestException);
    expect(bookingRepository.manager.transaction).not.toHaveBeenCalled();
  });

  it('does not create an unpriced registered booking when no current catalogue price exists', async () => {
    const { service, transactionalBookingRepository } = createService(
      true,
      new UnprocessableEntityException('No current catalogue price is available'),
    );

    await expect(service.create(createBookingDto)).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(transactionalBookingRepository.save).not.toHaveBeenCalled();
  });

  it('retrieves a booking by public reference with only explicitly mapped fields', async () => {
    const { service, bookingRepository, packagePricingService } = createService();

    await expect(service.findByReference('SC-2026-ABCDEFGHIJKL')).resolves.toEqual({
      bookingReference: 'SC-2026-ABCDEFGHIJKL',
      status: BookingStatus.DRAFT,
      healthCheckPackage: { code: 'ESSENTIAL', name: 'Essential Health Check' },
      fulfilmentMode: { code: 'PROVIDER_LOCATION', name: 'Provider location' },
      participant: { givenName: 'Ada', familyName: 'Okafor' },
      quotedAmount: '12500.00',
      quotedCurrency: 'NGN',
      preferredDate: '2026-08-20',
      preferredTimeWindowStart: '09:00',
      preferredTimeWindowEnd: '12:00',
      preferredTimezone: 'Africa/Lagos',
      locationNote: null,
      visitAddressSummary: null,
      createdAt: new Date('2026-08-17T12:00:00.000Z'),
      updatedAt: new Date('2026-08-17T12:00:00.000Z'),
    });
    expect(bookingRepository.findOne).toHaveBeenCalledWith({
      where: { bookingReference: 'SC-2026-ABCDEFGHIJKL' },
      relations: { healthCheckPackage: true, fulfilmentMode: true, participant: true, visitAddress: true },
    });
    expect(packagePricingService.resolveCurrentPrice).not.toHaveBeenCalled();
  });

  it('returns not found for an unknown public booking reference', async () => {
    const { service, bookingRepository } = createService();
    bookingRepository.findOne.mockResolvedValueOnce(null);

    await expect(service.findByReference('SC-2026-FFFFFFFFFFFF')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('always snapshots the server-resolved quote, even when a caller bypasses DTO validation', async () => {
    const { service, transactionalBookingRepository, packagePricingService } = createService();
    const maliciousInput = {
      ...createBookingDto,
      quotedAmount: '0.01',
      currency: 'USD',
    } as CreateBookingDto;

    await service.create(maliciousInput);

    expect(packagePricingService.resolveCurrentPrice).toHaveBeenCalled();
    expect(transactionalBookingRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ quotedAmount: '12500.00', currency: 'NGN' }),
    );
  });

  it('retries a database-enforced public-reference collision in a new transaction', async () => {
    const { service, bookingRepository, transactionalBookingRepository } = createService();
    const collision = new QueryFailedError('INSERT INTO bookings', [], {
      code: '23505',
      constraint: 'UQ_bookings_booking_reference',
    } as Error & { code: string; constraint: string });
    transactionalBookingRepository.save
      .mockRejectedValueOnce(collision)
      .mockResolvedValueOnce({ bookingReference: 'SC-2026-RETRIEDREF01' });
    jest
      .spyOn(bookingReference, 'generateBookingReference')
      .mockReturnValueOnce('SC-2026-COLLISION001')
      .mockReturnValueOnce('SC-2026-RETRIEDREF01');

    await expect(service.create(createBookingDto)).resolves.toMatchObject({
      bookingReference: 'SC-2026-ABCDEFGHIJKL',
    });
    expect(bookingRepository.manager.transaction).toHaveBeenCalledTimes(2);
    expect(transactionalBookingRepository.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ bookingReference: 'SC-2026-COLLISION001' }),
    );
    expect(transactionalBookingRepository.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ bookingReference: 'SC-2026-RETRIEDREF01' }),
    );
  });
});
