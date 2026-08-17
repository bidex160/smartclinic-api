import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FulfilmentMode } from '../health-checks/entities/fulfilment-mode.entity';
import { HealthCheckPackage } from '../health-checks/entities/health-check-package.entity';
import { Patient } from '../patients/entities/patient.entity';
import { PatientStatus } from '../patients/enums/patient-status.enum';
import {
  generateBookingReference,
  isBookingReferenceCollision,
  MAX_BOOKING_REFERENCE_GENERATION_ATTEMPTS,
} from './booking-reference';
import { BookingResponseDto } from './dto/booking-response.dto';
import { CreatePublicBookingDto } from './dto/create-public-booking.dto';
import { BookingContact } from './entities/booking-contact.entity';
import { BookingStatusHistory } from './entities/booking-status-history.entity';
import { Booking } from './entities/booking.entity';
import { BookingStatus } from './enums/booking-status.enum';

@Injectable()
export class PublicBookingsService {
  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    @InjectRepository(HealthCheckPackage)
    private readonly healthCheckPackageRepository: Repository<HealthCheckPackage>,
    @InjectRepository(FulfilmentMode)
    private readonly fulfilmentModeRepository: Repository<FulfilmentMode>,
  ) {}

  async create(createPublicBookingDto: CreatePublicBookingDto): Promise<BookingResponseDto> {
    this.validatePreferredTimeWindow(createPublicBookingDto);
    await this.validateCatalogue(createPublicBookingDto);

    for (let attempt = 0; attempt < MAX_BOOKING_REFERENCE_GENERATION_ATTEMPTS; attempt += 1) {
      try {
        const booking = await this.bookingRepository.manager.transaction(async (manager) => {
          const patientRepository = manager.getRepository(Patient);
          const bookingRepository = manager.getRepository(Booking);
          const contactRepository = manager.getRepository(BookingContact);
          const historyRepository = manager.getRepository(BookingStatusHistory);
          const { booker, participant, booking: bookingDetails } = createPublicBookingDto;

          const patient = await patientRepository.save(
            patientRepository.create({
              userId: null,
              givenName: participant.givenName,
              familyName: participant.familyName,
              dateOfBirth: participant.dateOfBirth ?? null,
              phone: participant.phone ?? null,
              email: participant.email ?? null,
              status: PatientStatus.ACTIVE,
            }),
          );

          const savedBooking = await bookingRepository.save(
            bookingRepository.create({
              bookingReference: generateBookingReference(),
              bookerUserId: null,
              participantPatientId: patient.id,
              organisationContextId: null,
              healthCheckPackageId: bookingDetails.healthCheckPackageId,
              fulfilmentModeId: bookingDetails.fulfilmentModeId,
              status: BookingStatus.DRAFT,
              quotedAmount: null,
              currency: null,
              preferredDate: bookingDetails.preferredDate ?? null,
              preferredTimeWindowStart: bookingDetails.preferredTimeFrom ?? null,
              preferredTimeWindowEnd: bookingDetails.preferredTimeTo ?? null,
              preferredLocationNote: bookingDetails.locationNote ?? null,
            }),
          );

          await contactRepository.save(
            contactRepository.create({
              bookingId: savedBooking.id,
              givenName: booker.givenName,
              familyName: booker.familyName,
              email: booker.email ?? null,
              phone: booker.phone,
            }),
          );

          await historyRepository.save(
            historyRepository.create({
              bookingId: savedBooking.id,
              fromStatus: null,
              toStatus: BookingStatus.DRAFT,
              actorUserId: null,
            }),
          );

          return savedBooking;
        });

        return this.findResponseByReference(booking.bookingReference);
      } catch (error) {
        if (!isBookingReferenceCollision(error) || attempt === MAX_BOOKING_REFERENCE_GENERATION_ATTEMPTS - 1) {
          throw error;
        }
      }
    }

    throw new ConflictException('Unable to generate a unique booking reference');
  }

  private async validateCatalogue(createPublicBookingDto: CreatePublicBookingDto): Promise<void> {
    const [healthCheckPackageExists, fulfilmentModeExists] = await Promise.all([
      this.healthCheckPackageRepository.exists({
        where: { id: createPublicBookingDto.booking.healthCheckPackageId, isActive: true },
      }),
      this.fulfilmentModeRepository.exists({
        where: { id: createPublicBookingDto.booking.fulfilmentModeId, isActive: true },
      }),
    ]);

    if (!healthCheckPackageExists || !fulfilmentModeExists) {
      throw new BadRequestException('The selected Health Check package or fulfilment mode is unavailable');
    }
  }

  private validatePreferredTimeWindow(createPublicBookingDto: CreatePublicBookingDto): void {
    const { preferredTimeFrom, preferredTimeTo } = createPublicBookingDto.booking;
    if (preferredTimeFrom !== undefined && preferredTimeTo !== undefined && preferredTimeTo <= preferredTimeFrom) {
      throw new BadRequestException('preferredTimeTo must be after preferredTimeFrom');
    }
  }

  private async findResponseByReference(bookingReference: string): Promise<BookingResponseDto> {
    const booking = await this.bookingRepository.findOne({
      where: { bookingReference },
      relations: {
        healthCheckPackage: true,
        fulfilmentMode: true,
        participant: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking was not found after creation');
    }

    return BookingResponseDto.fromEntity(booking);
  }
}
