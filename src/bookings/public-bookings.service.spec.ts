import { BadRequestException } from '@nestjs/common';

import { BookingContact } from './entities/booking-contact.entity';
import { BookingStatusHistory } from './entities/booking-status-history.entity';
import { Booking } from './entities/booking.entity';
import { CreatePublicBookingDto, PublicBookingRelationship } from './dto/create-public-booking.dto';
import { PublicBookingsService } from './public-bookings.service';

describe('PublicBookingsService', () => {
  const createPublicBookingDto: CreatePublicBookingDto = {
    booker: {
      givenName: 'Ada',
      familyName: 'Okafor',
      email: 'ada@example.test',
      phone: '+2348012345678',
    },
    participant: {
      relationship: PublicBookingRelationship.SELF,
      givenName: 'Ada',
      familyName: 'Okafor',
      dateOfBirth: '1990-01-01',
      phone: '+2348012345678',
      email: 'ada@example.test',
    },
    booking: {
      healthCheckPackageId: 'd3f17322-2dab-42bd-a006-35c3b864849d',
      fulfilmentModeId: '3c233f29-a510-4602-a337-df7e2d1e5a4a',
      preferredDate: '2026-08-20',
      preferredTimeFrom: '09:00',
      preferredTimeTo: '12:00',
      locationNote: 'Reception desk',
    },
  };

  function createService(options: { packageExists?: boolean; modeExists?: boolean; contactSaveError?: Error } = {}) {
    const patientRepository = {
      create: jest.fn((input: object) => input),
      save: jest.fn().mockResolvedValue({ id: '2f4a443d-5c93-4f8f-a05a-8ddf37d91b7a' }),
    };
    const bookingTransactionRepository = {
      create: jest.fn((input: object) => input),
      save: jest.fn().mockResolvedValue({
        id: '55097f3a-ca31-4cc4-a4bc-2fdf6e5a0e13',
        bookingReference: 'SC-2026-7F23B0C9D1E4',
      }),
    };
    const contactRepository = {
      create: jest.fn((input: object) => input),
      save: options.contactSaveError ? jest.fn().mockRejectedValue(options.contactSaveError) : jest.fn().mockResolvedValue(undefined),
    };
    const historyRepository = {
      create: jest.fn((input: object) => input),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === Booking) return bookingTransactionRepository;
        if (entity === BookingContact) return contactRepository;
        if (entity === BookingStatusHistory) return historyRepository;
        return patientRepository;
      }),
    };
    const bookingRepository = {
      manager: { transaction: jest.fn((work: (transactionManager: typeof manager) => unknown) => work(manager)) },
      findOne: jest.fn().mockResolvedValue({
        bookingReference: 'SC-2026-7F23B0C9D1E4',
        status: 'DRAFT',
        quotedAmount: null,
        currency: null,
        preferredDate: '2026-08-20',
        preferredTimeWindowStart: '09:00',
        preferredTimeWindowEnd: '12:00',
        preferredLocationNote: 'Reception desk',
        createdAt: new Date('2026-08-17T12:00:00.000Z'),
        updatedAt: new Date('2026-08-17T12:00:00.000Z'),
        healthCheckPackage: { code: 'ESSENTIAL', name: 'Essential Health Check' },
        fulfilmentMode: { code: 'HOME_VISIT', name: 'Home visit' },
        participant: { givenName: 'Ada', familyName: 'Okafor' },
      } as Booking),
    };
    const healthCheckPackageRepository = { exists: jest.fn().mockResolvedValue(options.packageExists ?? true) };
    const fulfilmentModeRepository = { exists: jest.fn().mockResolvedValue(options.modeExists ?? true) };
    const service = new PublicBookingsService(
      bookingRepository as never,
      healthCheckPackageRepository as never,
      fulfilmentModeRepository as never,
    );

    return {
      service,
      bookingRepository,
      patientRepository,
      bookingTransactionRepository,
      contactRepository,
      historyRepository,
    };
  }

  it('creates a self booking without creating a User or exposing internal identifiers', async () => {
    const { service, patientRepository, bookingTransactionRepository, contactRepository, historyRepository } = createService();

    await expect(service.create(createPublicBookingDto)).resolves.toEqual(
      expect.objectContaining({
        bookingReference: 'SC-2026-7F23B0C9D1E4',
        participant: { givenName: 'Ada', familyName: 'Okafor' },
        locationNote: 'Reception desk',
      }),
    );
    expect(patientRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null, givenName: 'Ada', familyName: 'Okafor' }),
    );
    expect(bookingTransactionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ bookerUserId: null, participantPatientId: '2f4a443d-5c93-4f8f-a05a-8ddf37d91b7a' }),
    );
    expect(contactRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ givenName: 'Ada', familyName: 'Okafor', phone: '+2348012345678' }),
    );
    expect(historyRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ fromStatus: null, toStatus: 'DRAFT', actorUserId: null }),
    );
  });

  it('creates a distinct patient for a booking made for another person', async () => {
    const { service, patientRepository } = createService();
    const dto: CreatePublicBookingDto = {
      ...createPublicBookingDto,
      participant: {
        relationship: PublicBookingRelationship.FAMILY,
        givenName: 'Chidi',
        familyName: 'Okafor',
      },
    };

    await service.create(dto);

    expect(patientRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null, givenName: 'Chidi', familyName: 'Okafor', phone: null }),
    );
  });

  it('rejects an unavailable package or fulfilment mode before the transaction begins', async () => {
    const invalidPackage = createService({ packageExists: false });
    await expect(invalidPackage.service.create(createPublicBookingDto)).rejects.toBeInstanceOf(BadRequestException);
    expect(invalidPackage.bookingRepository.manager.transaction).not.toHaveBeenCalled();

    const invalidMode = createService({ modeExists: false });
    await expect(invalidMode.service.create(createPublicBookingDto)).rejects.toBeInstanceOf(BadRequestException);
    expect(invalidMode.bookingRepository.manager.transaction).not.toHaveBeenCalled();
  });

  it('propagates transactional failures so the database transaction can roll back every record', async () => {
    const { service, historyRepository } = createService({ contactSaveError: new Error('contact save failed') });

    await expect(service.create(createPublicBookingDto)).rejects.toThrow('contact save failed');
    expect(historyRepository.save).not.toHaveBeenCalled();
  });
});
