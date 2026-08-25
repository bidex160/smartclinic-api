import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FulfilmentMode } from '../health-checks/entities/fulfilment-mode.entity';
import { HealthCheckPackage } from '../health-checks/entities/health-check-package.entity';
import { PackagePricingService } from '../health-checks/package-pricing.service';
import { Organisation } from '../organisations/entities/organisation.entity';
import { Patient } from '../patients/entities/patient.entity';
import { User } from '../users/entities/user.entity';
import { BookingResponseDto } from './dto/booking-response.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingStatus } from './enums/booking-status.enum';
import { BookingStatusHistory } from './entities/booking-status-history.entity';
import { Booking } from './entities/booking.entity';
import { BookingVisitAddress } from './entities/booking-visit-address.entity';
import {
  generateBookingReference,
  isBookingReferenceCollision,
  MAX_BOOKING_REFERENCE_GENERATION_ATTEMPTS,
} from './booking-reference';
import { validateBookingSchedulingPreference } from './booking-scheduling';
import { CreateSelfBookingDto } from './dto/create-self-booking.dto';
import { PatientStatus } from '../patients/enums/patient-status.enum';


@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Patient)
    private readonly patientRepository: Repository<Patient>,
    @InjectRepository(Organisation)
    private readonly organisationRepository: Repository<Organisation>,
    @InjectRepository(HealthCheckPackage)
    private readonly healthCheckPackageRepository: Repository<HealthCheckPackage>,
    @InjectRepository(FulfilmentMode)
    private readonly fulfilmentModeRepository: Repository<FulfilmentMode>,
    private readonly packagePricingService: PackagePricingService,
  ) {}

  async createSelf(user: User, dto: CreateSelfBookingDto): Promise<BookingResponseDto> {
    const patient = await this.patientRepository.findOne({ where: { userId: user.id }, withDeleted: true });
    if (!patient || patient.deletedAt || patient.status !== PatientStatus.ACTIVE) throw new NotFoundException('SELF Patient identity was not found for the authenticated user');
    return this.create({ ...dto, bookerUserId: user.id, participantPatientId: patient.id });
  }

  async create(createBookingDto: CreateBookingDto): Promise<BookingResponseDto> {
    validateBookingSchedulingPreference(createBookingDto);
    await this.validateReferences(createBookingDto);
    await this.validateVisitAddress(createBookingDto.fulfilmentModeId, createBookingDto.visitAddress);

    for (let attempt = 0; attempt < MAX_BOOKING_REFERENCE_GENERATION_ATTEMPTS; attempt += 1) {
      try {
        const booking = await this.bookingRepository.manager.transaction(async (manager) => {
          const bookingRepository = manager.getRepository(Booking);
          const historyRepository = manager.getRepository(BookingStatusHistory);
          const addressRepository = manager.getRepository(BookingVisitAddress);
          const quote = await this.packagePricingService.resolveCurrentPrice(
            createBookingDto.healthCheckPackageId,
            createBookingDto.fulfilmentModeId,
            new Date(),
            manager,
          );
          const { visitAddress: _visitAddress, ...bookingInput } = createBookingDto;
          const booking = bookingRepository.create({
            ...bookingInput,
            bookingReference: generateBookingReference(),
            organisationContextId: createBookingDto.organisationContextId ?? null,
            quotedAmount: quote.amount,
            currency: quote.currency,
            preferredDate: createBookingDto.preferredDate ?? null,
            preferredTimeWindowStart: createBookingDto.preferredTimeWindowStart ?? null,
            preferredTimeWindowEnd: null,
            preferredTimezone: createBookingDto.preferredTimezone ?? null,
            preferredLocationNote: createBookingDto.preferredLocationNote ?? null,
            status: BookingStatus.DRAFT,
          });
          const savedBooking = await bookingRepository.save(booking);
          if (createBookingDto.visitAddress) await addressRepository.save(addressRepository.create({ ...this.normalizedAddress(createBookingDto.visitAddress), bookingId: savedBooking.id }));

          await historyRepository.save(
            historyRepository.create({
              bookingId: savedBooking.id,
              fromStatus: null,
              toStatus: BookingStatus.DRAFT,
              actorUserId: createBookingDto.bookerUserId,
            }),
          );

          return savedBooking;
        });

        return this.findByReference(booking.bookingReference);
      } catch (error) {
        if (!isBookingReferenceCollision(error) || attempt === MAX_BOOKING_REFERENCE_GENERATION_ATTEMPTS - 1) {
          throw error;
        }
      }
    }

    throw new ConflictException('Unable to generate a unique booking reference');
  }

  async findByReference(bookingReference: string): Promise<BookingResponseDto> {
    const booking = await this.bookingRepository.findOne({
      where: { bookingReference },
      relations: {
        healthCheckPackage: true,
        fulfilmentMode: true,
        participant: true,
        visitAddress: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return BookingResponseDto.fromEntity(booking);
  }

  private async validateVisitAddress(modeId: string, address: CreateBookingDto['visitAddress']): Promise<void> { const mode = await this.fulfilmentModeRepository.findOne({ where: { id: modeId } }); if (['HOME_VISIT', 'PROVIDER_LOCATION'].includes(mode?.code ?? '') && !address) throw new BadRequestException('visitAddress is required for this fulfilment mode'); }
  private normalizedAddress(value: NonNullable<CreateBookingDto['visitAddress']>) { return { ...value, addressLine1: value.addressLine1.trim(), addressLine2: value.addressLine2?.trim() || null, city: value.city.trim(), stateOrRegion: value.stateOrRegion.trim(), postalCode: value.postalCode?.trim() || null, countryCode: value.countryCode.trim().toUpperCase(), latitude: value.latitude?.toString() ?? null, longitude: value.longitude?.toString() ?? null }; }

  private async validateReferences(createBookingDto: CreateBookingDto): Promise<void> {
    const [bookerExists, participantExists, healthCheckPackageExists, fulfilmentModeExists, organisationExists] =
      await Promise.all([
        this.userRepository.exists({ where: { id: createBookingDto.bookerUserId } }),
        this.patientRepository.exists({ where: { id: createBookingDto.participantPatientId } }),
        this.healthCheckPackageRepository.exists({
          where: { id: createBookingDto.healthCheckPackageId, isActive: true },
        }),
        this.fulfilmentModeRepository.exists({
          where: { id: createBookingDto.fulfilmentModeId, isActive: true },
        }),
        createBookingDto.organisationContextId
          ? this.organisationRepository.exists({ where: { id: createBookingDto.organisationContextId } })
          : Promise.resolve(true),
      ]);

    if (!bookerExists || !participantExists || !healthCheckPackageExists || !fulfilmentModeExists || !organisationExists) {
      throw new BadRequestException('One or more booking references are invalid or unavailable');
    }
  }

}
