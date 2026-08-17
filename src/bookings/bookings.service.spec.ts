import { BadRequestException, NotFoundException } from '@nestjs/common';
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
    quotedAmount: '12500.00',
    currency: 'NGN',
    preferredDate: '2026-08-20',
    preferredTimeWindowStart: '09:00',
    preferredTimeWindowEnd: '12:00',
  };

  function createService(exists = true) {
    const savedBooking = {
      ...createBookingDto,
      id: 'e1585f20-fa0e-4e8f-9a8a-a6ba805ef5a5',
      bookingReference: 'SC-2026-ABCDEFGHIJKL',
      organisationContextId: null,
      preferredLocationNote: null,
      status: BookingStatus.DRAFT,
      createdAt: new Date('2026-08-17T12:00:00.000Z'),
      updatedAt: new Date('2026-08-17T12:00:00.000Z'),
      healthCheckPackage: { code: 'ESSENTIAL', name: 'Essential Health Check' },
      fulfilmentMode: { code: 'PROVIDER_LOCATION', name: 'Provider location' },
      participant: { givenName: 'Ada', familyName: 'Okafor' },
    } as Booking;
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
    const referenceRepository = { exists: jest.fn().mockResolvedValue(exists) };
    const service = new BookingsService(
      bookingRepository as never,
      referenceRepository as never,
      referenceRepository as never,
      referenceRepository as never,
      referenceRepository as never,
      referenceRepository as never,
    );

    return {
      service,
      bookingRepository,
      manager,
      transactionalBookingRepository,
      transactionalHistoryRepository,
      referenceRepository,
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
      expect.objectContaining({ bookingReference: 'SC-2026-ABCDEFGHIJKL', status: BookingStatus.DRAFT }),
    );
    expect(transactionalHistoryRepository.create).toHaveBeenCalledWith({
      bookingId: 'e1585f20-fa0e-4e8f-9a8a-a6ba805ef5a5',
      fromStatus: null,
      toStatus: BookingStatus.DRAFT,
      actorUserId: createBookingDto.bookerUserId,
    });
  });

  it('rejects inconsistent commercial and requested-time fields before persistence', async () => {
    const { service, bookingRepository } = createService();

    await expect(service.create({ ...createBookingDto, currency: undefined })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.create({ ...createBookingDto, preferredTimeWindowStart: '12:00', preferredTimeWindowEnd: '09:00' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(bookingRepository.manager.transaction).not.toHaveBeenCalled();
  });

  it('rejects unavailable referenced records before persistence', async () => {
    const { service, bookingRepository } = createService(false);

    await expect(service.create(createBookingDto)).rejects.toBeInstanceOf(BadRequestException);
    expect(bookingRepository.manager.transaction).not.toHaveBeenCalled();
  });

  it('retrieves a booking by public reference with only explicitly mapped fields', async () => {
    const { service, bookingRepository } = createService();

    await expect(service.findByReference('SC-2026-ABCDEFGHIJKL')).resolves.toEqual({
      bookingReference: 'SC-2026-ABCDEFGHIJKL',
      status: BookingStatus.DRAFT,
      healthCheckPackage: { code: 'ESSENTIAL', name: 'Essential Health Check' },
      fulfilmentMode: { code: 'PROVIDER_LOCATION', name: 'Provider location' },
      participant: { givenName: 'Ada', familyName: 'Okafor' },
      quotedAmount: '12500.00',
      currency: 'NGN',
      preferredDate: '2026-08-20',
      preferredTimeWindowStart: '09:00',
      preferredTimeWindowEnd: '12:00',
      createdAt: new Date('2026-08-17T12:00:00.000Z'),
      updatedAt: new Date('2026-08-17T12:00:00.000Z'),
    });
    expect(bookingRepository.findOne).toHaveBeenCalledWith({
      where: { bookingReference: 'SC-2026-ABCDEFGHIJKL' },
      relations: { healthCheckPackage: true, fulfilmentMode: true, participant: true },
    });
  });

  it('returns not found for an unknown public booking reference', async () => {
    const { service, bookingRepository } = createService();
    bookingRepository.findOne.mockResolvedValueOnce(null);

    await expect(service.findByReference('SC-2026-FFFFFFFFFFFF')).rejects.toBeInstanceOf(NotFoundException);
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
