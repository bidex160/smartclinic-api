import { BadRequestException, ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

import { BookingStatusHistory } from './entities/booking-status-history.entity';
import { Booking } from './entities/booking.entity';
import * as bookingReference from './booking-reference';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingStatus } from './enums/booking-status.enum';
import { PatientStatus } from '../patients/enums/patient-status.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { ProviderService } from '../providers/entities/provider-service.entity';
import { HealthCheckConfigurationQuote } from '../health-checks/entities/health-check-configuration-quote.entity';
import { BookingVisitAddress } from './entities/booking-visit-address.entity';

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
    visitAddress: { addressLine1: '12 Ring Road', city: 'Ibadan', stateOrRegion: 'Oyo', countryCode: 'NG' },
  };

  function createService(exists = true, priceError?: Error) {
    const savedBooking = {
      ...createBookingDto,
      id: 'e1585f20-fa0e-4e8f-9a8a-a6ba805ef5a5',
      bookingReference: 'SC-2026-ABCDEFGHIJKL',
      commercialConfiguration: null,
      organisationContextId: null,
      quotedAmount: '12500.00',
      currency: 'NGN',
      preferredLocationNote: null,
      status: BookingStatus.DRAFT,
      createdAt: new Date('2026-08-17T12:00:00.000Z'),
      updatedAt: new Date('2026-08-17T12:00:00.000Z'),
      visitAddressSummary: { city: 'Ibadan', stateOrRegion: 'Oyo', postalCode: undefined, countryCode: 'NG' },
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
    const providerService = { id: 'provider-service', providerId: 'provider-1', healthCheckPackageId: createBookingDto.healthCheckPackageId, fulfilmentModeId: createBookingDto.fulfilmentModeId, priceMinor: '1250000', currency: 'NGN', isActive: true };
    const transactionalProviderServiceRepository = { findOne: jest.fn().mockResolvedValue(providerService) };
    const manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === Booking ? transactionalBookingRepository : entity === ProviderService ? transactionalProviderServiceRepository : transactionalHistoryRepository,
      ),
    };
    const bookingRepository = {
      manager: { transaction: jest.fn((work: (transactionManager: typeof manager) => unknown) => work(manager)) },
      findOne: jest.fn().mockResolvedValue(savedBooking),
    };
    const referenceRepository = { exists: jest.fn().mockResolvedValue(exists), findOne: jest.fn().mockResolvedValue({ code: 'PROVIDER_LOCATION', isActive: true, estimatedDurationMinutes: 30 }) };
    const providerCapabilities = { findEligibleProviders: priceError ? jest.fn().mockRejectedValue(priceError) : jest.fn().mockResolvedValue([{ id: providerService.id, providerId: providerService.providerId, priceMinor: 1250000, currency: 'NGN' }]) };
    const service = new BookingsService(
      bookingRepository as never,
      referenceRepository as never,
      referenceRepository as never,
      referenceRepository as never,
      referenceRepository as never,
      referenceRepository as never,
      providerCapabilities as never,
      {} as never,
    );

    return {
      service,
      bookingRepository,
      manager,
      transactionalBookingRepository,
      transactionalHistoryRepository,
      transactionalProviderServiceRepository,
      referenceRepository,
      packagePricingService: providerCapabilities,
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
  it('scopes the legacy offering lock to its base row before loading joined configuration', async () => {
    const { service, transactionalProviderServiceRepository } = createService();
    await service.create(createBookingDto);
    expect(transactionalProviderServiceRepository.findOne).toHaveBeenNthCalledWith(1, {
      where: expect.objectContaining({ id: 'provider-service', isActive: true }),
      lock: { mode: 'pessimistic_read' },
    });
    expect(transactionalProviderServiceRepository.findOne.mock.calls[0][0]).not.toHaveProperty('relations');
    expect(transactionalProviderServiceRepository.findOne).toHaveBeenNthCalledWith(2, {
      where: { id: 'provider-service' },
      relations: { healthCheckPackage: { contents: { clinicalContent: true }, addonAvailability: { clinicalContent: true } }, fulfilmentMode: true },
    });
  });
  it('requires a structured address for PROVIDER_LOCATION registered bookings', async () => { const { service } = createService(); await expect(service.create({ ...createBookingDto, visitAddress: undefined })).rejects.toBeInstanceOf(BadRequestException); });
  it('accepts and normalizes a structured PROVIDER_LOCATION origin address', async () => { const { service, transactionalHistoryRepository } = createService(); await service.create({ ...createBookingDto, visitAddress: { addressLine1: ' 12 Ring Road ', city: ' Ibadan ', stateOrRegion: ' Oyo ', countryCode: 'ng' } }); expect(transactionalHistoryRepository.save).toHaveBeenCalledWith(expect.objectContaining({ addressLine1: '12 Ring Road', city: 'Ibadan', stateOrRegion: 'Oyo', countryCode: 'NG' })); });

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
      commercialConfiguration: null,
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
      visitAddressSummary: { city: 'Ibadan', stateOrRegion: 'Oyo', postalCode: undefined, countryCode: 'NG' },
      createdAt: new Date('2026-08-17T12:00:00.000Z'),
      updatedAt: new Date('2026-08-17T12:00:00.000Z'),
    });
    expect(bookingRepository.findOne).toHaveBeenCalledWith({
      where: { bookingReference: 'SC-2026-ABCDEFGHIJKL' },
      relations: { healthCheckPackage: true, fulfilmentMode: true, participant: true, visitAddress: true, providerLocation: true },
    });
    expect(packagePricingService.findEligibleProviders).not.toHaveBeenCalled();
  });

  it('returns not found for an unknown public booking reference', async () => {
    const { service, bookingRepository } = createService();
    bookingRepository.findOne.mockResolvedValueOnce(null);

    await expect(service.findByReference('SC-2026-FFFFFFFFFFFF')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resolves payment ownership only through active User to active SELF Patient to participant booking', async () => {
    const { service, bookingRepository, referenceRepository } = createService();
    const user = { id: createBookingDto.bookerUserId, status: UserStatus.ACTIVE, deletedAt: null } as any;
    referenceRepository.findOne.mockResolvedValueOnce({ id: createBookingDto.participantPatientId, userId: user.id, status: PatientStatus.ACTIVE, deletedAt: null });
    await expect(service.requireSelfBooking(user, 'SC-2026-ABCDEFGHIJKL')).resolves.toBeDefined();
    expect(bookingRepository.findOne).toHaveBeenCalledWith({ where: { bookingReference: 'SC-2026-ABCDEFGHIJKL', participantPatientId: createBookingDto.participantPatientId } });
  });

  it('returns the same narrow not-found response for another Patient booking', async () => {
    const { service, bookingRepository, referenceRepository } = createService();
    const user = { id: createBookingDto.bookerUserId, status: UserStatus.ACTIVE, deletedAt: null } as any;
    referenceRepository.findOne.mockResolvedValueOnce({ id: createBookingDto.participantPatientId, userId: user.id, status: PatientStatus.ACTIVE, deletedAt: null });
    bookingRepository.findOne.mockResolvedValueOnce(null);
    await expect(service.requireSelfBooking(user, 'SC-2026-111111111111')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('always snapshots the server-resolved quote, even when a caller bypasses DTO validation', async () => {
    const { service, transactionalBookingRepository, packagePricingService } = createService();
    const maliciousInput = {
      ...createBookingDto,
      quotedAmount: '0.01',
      currency: 'USD',
    } as CreateBookingDto;

    await service.create(maliciousInput);

    expect(packagePricingService.findEligibleProviders).toHaveBeenCalled();
    expect(transactionalBookingRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ quotedAmount: '12500.00', currency: 'NGN', commercialProviderId: 'provider-1', commercialProviderServiceId: 'provider-service' }),
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

describe('BookingsService quote-backed PostgreSQL locking', () => {
  const user = { id: 'user-1' } as any;
  const patient = { id: 'patient-1', userId: user.id, status: PatientStatus.ACTIVE, deletedAt: null } as any;
  const dto = {
    configurationReference: 'SC-HCQ-C8EA40D524DFB230',
    preferredDate: '2026-09-10',
    preferredTimeWindowStart: '09:00',
    preferredTimezone: 'Africa/Lagos',
    visitAddress: { addressLine1: 'Mokola', city: 'Ibadan', stateOrRegion: 'Oyo', countryCode: 'NG' },
  } as any;

  function harness(overrides: Partial<HealthCheckConfigurationQuote> = {}) {
    const quote = {
      id: 'quote-1', reference: dto.configurationReference, userId: user.id, patientId: patient.id,
      providerServiceId: 'offering-1', providerLocationId: 'location-1', currency: 'NGN',
      basePackagePriceMinor: '300000', clinicalAddonsTotalMinor: '0', fulfilmentFeeMinor: '0', totalMinor: '300000',
      configurationSnapshot: { package: { code: 'ESSENTIAL', name: 'Essential' }, selectedAddons: [] },
      expiresAt: new Date(Date.now() + 60_000), consumedAt: null, bookingId: null, ...overrides,
    } as HealthCheckConfigurationQuote;
    const offering = {
      id: quote.providerServiceId, providerId: 'provider-1', healthCheckPackageId: 'package-1', fulfilmentModeId: 'mode-1',
      isActive: true, healthCheckPackage: { isActive: true, estimatedDurationMinutes: 30 }, fulfilmentMode: { isActive: true },
    } as any;
    const savedBooking = { id: 'booking-1', bookingReference: 'SC-2026-QUOTELOCK001' } as Booking;
    const quoteRepository = { findOne: jest.fn().mockResolvedValue(quote), save: jest.fn(async (value) => value) };
    const offeringRepository = { findOne: jest.fn().mockResolvedValue(offering) };
    const bookingRepositoryInTransaction = { create: jest.fn((value) => value), save: jest.fn().mockResolvedValue(savedBooking), findOne: jest.fn().mockResolvedValue(savedBooking) };
    const addressRepository = { create: jest.fn((value) => value), save: jest.fn(async (value) => value) };
    const historyRepository = { create: jest.fn((value) => value), save: jest.fn(async (value) => value) };
    const manager = { getRepository: jest.fn((entity) => {
      if (entity === HealthCheckConfigurationQuote) return quoteRepository;
      if (entity === ProviderService) return offeringRepository;
      if (entity === Booking) return bookingRepositoryInTransaction;
      if (entity === BookingVisitAddress) return addressRepository;
      return historyRepository;
    }) };
    const bookingRepository = {
      manager: { transaction: jest.fn((work) => work(manager)) },
      findOne: jest.fn(),
    };
    const patientRepository = { findOne: jest.fn().mockResolvedValue(patient) };
    const fulfilmentModes = { findOne: jest.fn().mockResolvedValue({ id: 'mode-1', code: 'PROVIDER_LOCATION' }) };
    const capabilities = { findEligibleProviders: jest.fn().mockResolvedValue([{ id: offering.id }]) };
    const service = new BookingsService(
      bookingRepository as never, {} as never, patientRepository as never, {} as never, {} as never,
      fulfilmentModes as never, capabilities as never, quoteRepository as never,
    );
    jest.spyOn(service, 'findByReference').mockResolvedValue({ bookingReference: savedBooking.bookingReference } as any);
    return { service, quote, quoteRepository, offeringRepository, bookingRepositoryInTransaction, bookingRepository, capabilities };
  }

  it('locks only the quote base row and loads optional related configuration separately', async () => {
    const value = harness();
    await expect(value.service.createSelf(user, dto)).resolves.toMatchObject({ bookingReference: 'SC-2026-QUOTELOCK001' });

    expect(value.quoteRepository.findOne).toHaveBeenCalledWith({
      where: { reference: dto.configurationReference, userId: user.id, patientId: patient.id },
      lock: { mode: 'pessimistic_write' },
    });
    expect(value.quoteRepository.findOne.mock.calls[0][0]).not.toHaveProperty('relations');
    expect(value.offeringRepository.findOne).toHaveBeenCalledWith({
      where: { id: value.quote.providerServiceId },
      relations: { healthCheckPackage: true, fulfilmentMode: true },
    });
    expect(value.quoteRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      bookingId: 'booking-1', consumedAt: expect.any(Date),
    }));
  });

  it('rejects expired, consumed, and wrong-owner quotes before creating a booking', async () => {
    const expired = harness({ expiresAt: new Date(Date.now() - 1) });
    await expect(expired.service.createSelf(user, dto)).rejects.toThrow('quote has expired');
    expect(expired.bookingRepositoryInTransaction.save).not.toHaveBeenCalled();

    const consumed = harness({ consumedAt: new Date(), bookingId: null });
    await expect(consumed.service.createSelf(user, dto)).rejects.toThrow('already been consumed');
    expect(consumed.bookingRepositoryInTransaction.save).not.toHaveBeenCalled();

    const wrongOwner = harness();
    wrongOwner.quoteRepository.findOne.mockResolvedValue(null);
    await expect(wrongOwner.service.createSelf({ id: 'other-user' } as any, dto)).rejects.toBeInstanceOf(NotFoundException);
    expect(wrongOwner.bookingRepositoryInTransaction.save).not.toHaveBeenCalled();
  });

  it('returns the booking already bound under the quote lock and never creates a duplicate', async () => {
    const value = harness({ bookingId: 'booking-1', consumedAt: new Date() });
    await expect(value.service.createSelf(user, dto)).resolves.toMatchObject({ bookingReference: 'SC-2026-QUOTELOCK001' });
    expect(value.bookingRepositoryInTransaction.findOne).toHaveBeenCalledWith({ where: { id: 'booking-1' } });
    expect(value.bookingRepositoryInTransaction.save).not.toHaveBeenCalled();
    expect(value.quoteRepository.save).not.toHaveBeenCalled();
    expect(value.capabilities.findEligibleProviders).not.toHaveBeenCalled();
  });
});
