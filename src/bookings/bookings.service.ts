import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { QueryFailedError, Repository } from 'typeorm';

import { FulfilmentMode } from '../health-checks/entities/fulfilment-mode.entity';
import { HealthCheckPackage } from '../health-checks/entities/health-check-package.entity';
import { Organisation } from '../organisations/entities/organisation.entity';
import { Patient } from '../patients/entities/patient.entity';
import { User } from '../users/entities/user.entity';
import { BookingResponseDto } from './dto/booking-response.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingStatus } from './enums/booking-status.enum';
import { BookingStatusHistory } from './entities/booking-status-history.entity';
import { Booking } from './entities/booking.entity';

const BOOKING_REFERENCE_CONSTRAINT = 'UQ_bookings_booking_reference';
const MAX_REFERENCE_GENERATION_ATTEMPTS = 3;

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
  ) {}

  async create(createBookingDto: CreateBookingDto): Promise<BookingResponseDto> {
    this.validateCommercialAndTimeFields(createBookingDto);
    await this.validateReferences(createBookingDto);

    for (let attempt = 0; attempt < MAX_REFERENCE_GENERATION_ATTEMPTS; attempt += 1) {
      try {
        const booking = await this.bookingRepository.manager.transaction(async (manager) => {
          const bookingRepository = manager.getRepository(Booking);
          const historyRepository = manager.getRepository(BookingStatusHistory);
          const booking = bookingRepository.create({
            ...createBookingDto,
            bookingReference: this.generateBookingReference(),
            organisationContextId: createBookingDto.organisationContextId ?? null,
            quotedAmount: createBookingDto.quotedAmount ?? null,
            currency: createBookingDto.currency ?? null,
            preferredDate: createBookingDto.preferredDate ?? null,
            preferredTimeWindowStart: createBookingDto.preferredTimeWindowStart ?? null,
            preferredTimeWindowEnd: createBookingDto.preferredTimeWindowEnd ?? null,
            preferredLocationNote: createBookingDto.preferredLocationNote ?? null,
            status: BookingStatus.DRAFT,
          });
          const savedBooking = await bookingRepository.save(booking);

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
        if (!this.isBookingReferenceCollision(error) || attempt === MAX_REFERENCE_GENERATION_ATTEMPTS - 1) {
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
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return BookingResponseDto.fromEntity(booking);
  }

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

  private validateCommercialAndTimeFields(createBookingDto: CreateBookingDto): void {
    if ((createBookingDto.quotedAmount === undefined) !== (createBookingDto.currency === undefined)) {
      throw new BadRequestException('quotedAmount and currency must be provided together');
    }

    if (
      createBookingDto.preferredTimeWindowStart !== undefined &&
      createBookingDto.preferredTimeWindowEnd !== undefined &&
      createBookingDto.preferredTimeWindowEnd <= createBookingDto.preferredTimeWindowStart
    ) {
      throw new BadRequestException('preferredTimeWindowEnd must be after preferredTimeWindowStart');
    }
  }

  private generateBookingReference(): string {
    const year = new Date().getUTCFullYear();
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
    return `SC-${year}-${suffix}`;
  }

  private isBookingReferenceCollision(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string; constraint?: string }).code === '23505' &&
      (error.driverError as { constraint?: string }).constraint === BOOKING_REFERENCE_CONSTRAINT
    );
  }
}
