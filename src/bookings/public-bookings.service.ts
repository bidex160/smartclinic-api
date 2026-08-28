import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FulfilmentMode } from '../health-checks/entities/fulfilment-mode.entity';
import { HealthCheckPackage } from '../health-checks/entities/health-check-package.entity';
import { Patient } from '../patients/entities/patient.entity';
import { PatientStatus } from '../patients/enums/patient-status.enum';
import { generatePatientReference, isPatientReferenceCollision } from '../patients/patient-reference';
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
import { BookingVisitAddress } from './entities/booking-visit-address.entity';
import { BookingStatus } from './enums/booking-status.enum';
import { validateBookingSchedulingPreference } from './booking-scheduling';
import { PublicBookingSessionService } from './public-booking-session.service';
import { ProviderCapabilitiesService } from '../providers/provider-capabilities.service';
import { deriveAppointmentEndTime } from '../providers/booking-availability-context';
import { ProviderService } from '../providers/entities/provider-service.entity';

export interface PublicBookingCreationResult { booking: BookingResponseDto; sessionToken: string; }

@Injectable()
export class PublicBookingsService {
  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    @InjectRepository(HealthCheckPackage)
    private readonly healthCheckPackageRepository: Repository<HealthCheckPackage>,
    @InjectRepository(FulfilmentMode)
    private readonly fulfilmentModeRepository: Repository<FulfilmentMode>,
    private readonly providerCapabilities: ProviderCapabilitiesService,
    private readonly sessions: PublicBookingSessionService,
  ) {}

  async create(createPublicBookingDto: CreatePublicBookingDto): Promise<PublicBookingCreationResult> {
    validateBookingSchedulingPreference({
      preferredDate: createPublicBookingDto.booking.preferredDate,
      preferredTimeWindowStart: createPublicBookingDto.booking.preferredTimeFrom,
      preferredTimeWindowEnd: null,
      preferredTimezone: createPublicBookingDto.booking.preferredTimezone,
    });
    await this.validateCatalogue(createPublicBookingDto);
    await this.validateVisitAddress(createPublicBookingDto.booking.fulfilmentModeId, createPublicBookingDto.booking.visitAddress);
    const capability = await this.selectCommercialCapability(createPublicBookingDto);

    for (let attempt = 0; attempt < MAX_BOOKING_REFERENCE_GENERATION_ATTEMPTS; attempt += 1) {
      try {
        const created = await this.bookingRepository.manager.transaction(async (manager) => {
          const patientRepository = manager.getRepository(Patient);
          const bookingRepository = manager.getRepository(Booking);
          const contactRepository = manager.getRepository(BookingContact);
          const historyRepository = manager.getRepository(BookingStatusHistory);
          const addressRepository = manager.getRepository(BookingVisitAddress);
          const { booker, participant, booking: bookingDetails } = createPublicBookingDto;
          const providerService = await manager.getRepository(ProviderService).findOne({ where: { id: capability.id, providerId: capability.providerId, healthCheckPackageId: bookingDetails.healthCheckPackageId, fulfilmentModeId: bookingDetails.fulfilmentModeId, isActive: true }, lock: { mode: 'pessimistic_read' } });
          if (!providerService) throw new ConflictException('Selected provider Health Check offering is no longer available');

          const patient = await patientRepository.save(
            patientRepository.create({
              patientReference: generatePatientReference(),
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
              quotedAmount: this.fromMinor(providerService.priceMinor),
              currency: providerService.currency,
              commercialProviderId: providerService.providerId,
              commercialProviderServiceId: providerService.id,
              preferredDate: bookingDetails.preferredDate ?? null,
              preferredTimeWindowStart: bookingDetails.preferredTimeFrom ?? null,
              preferredTimeWindowEnd: null,
              preferredTimezone: bookingDetails.preferredTimezone ?? null,
              preferredLocationNote: bookingDetails.locationNote ?? null,
            }),
          );
          if (bookingDetails.visitAddress) await addressRepository.save(addressRepository.create({ ...this.normalizedAddress(bookingDetails.visitAddress), bookingId: savedBooking.id }));

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
          const sessionToken = await this.sessions.create(manager, savedBooking.id);
          return { savedBooking, sessionToken };
        });
        return { booking: await this.findResponseByReference(created.savedBooking.bookingReference), sessionToken: created.sessionToken };
      } catch (error) {
        if ((!isBookingReferenceCollision(error) && !isPatientReferenceCollision(error)) || attempt === MAX_BOOKING_REFERENCE_GENERATION_ATTEMPTS - 1) {
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
  private async validateVisitAddress(modeId: string, address: CreatePublicBookingDto['booking']['visitAddress']): Promise<void> { const mode = await this.fulfilmentModeRepository.findOne({ where: { id: modeId } }); if (['HOME_VISIT', 'PROVIDER_LOCATION'].includes(mode?.code ?? '') && !address) throw new BadRequestException('visitAddress is required for this fulfilment mode'); }
  private normalizedAddress(value: NonNullable<CreatePublicBookingDto['booking']['visitAddress']>) { return { ...value, addressLine1: value.addressLine1.trim(), addressLine2: value.addressLine2?.trim() || null, city: value.city.trim(), stateOrRegion: value.stateOrRegion.trim(), postalCode: value.postalCode?.trim() || null, countryCode: value.countryCode.trim().toUpperCase(), latitude: value.latitude?.toString() ?? null, longitude: value.longitude?.toString() ?? null }; }

  private async selectCommercialCapability(dto: CreatePublicBookingDto) {
    const details = dto.booking;
    const healthPackage = await this.healthCheckPackageRepository.findOne({ where: { id: details.healthCheckPackageId, isActive: true } });
    const end = healthPackage?.estimatedDurationMinutes ? deriveAppointmentEndTime(details.preferredTimeFrom, healthPackage.estimatedDurationMinutes) : null;
    if (!end) throw new BadRequestException('Health Check package has no valid appointment duration');
    const address = details.visitAddress ? this.normalizedAddress(details.visitAddress) : null;
    const eligible = await this.providerCapabilities.findEligibleProviders(details.healthCheckPackageId, details.fulfilmentModeId, { requestedDate: details.preferredDate, requestedStartTime: details.preferredTimeFrom, requestedEndTime: end, requestedTimezone: details.preferredTimezone, visitAddress: address });
    const capability = eligible[0];
    if (!capability) throw new ConflictException('No eligible priced Provider is currently available for this Health Check');
    return capability;
  }
  private fromMinor(value: string) { const minor = BigInt(value); return `${minor / 100n}.${(minor % 100n).toString().padStart(2, '0')}`; }

  private async findResponseByReference(bookingReference: string): Promise<BookingResponseDto> {
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
      throw new NotFoundException('Booking was not found after creation');
    }

    return BookingResponseDto.fromEntity(booking);
  }
}
