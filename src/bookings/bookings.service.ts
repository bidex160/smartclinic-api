import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

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
import { BookingVisitAddress } from './entities/booking-visit-address.entity';
import {
  generateBookingReference,
  isBookingReferenceCollision,
  MAX_BOOKING_REFERENCE_GENERATION_ATTEMPTS,
} from './booking-reference';
import { validateBookingSchedulingPreference } from './booking-scheduling';
import { CreateSelfBookingDto } from './dto/create-self-booking.dto';
import { PatientStatus } from '../patients/enums/patient-status.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { ProviderCapabilitiesService } from '../providers/provider-capabilities.service';
import { deriveAppointmentEndTime } from '../providers/booking-availability-context';
import { ProviderService } from '../providers/entities/provider-service.entity';
import { ProviderServiceAddon } from '../providers/entities/provider-service-addon.entity';


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
    private readonly providerCapabilities: ProviderCapabilitiesService,
  ) {}

  async createSelf(user: User, dto: CreateSelfBookingDto): Promise<BookingResponseDto> {
    const patient = await this.patientRepository.findOne({ where: { userId: user.id }, withDeleted: true });
    if (!patient || patient.deletedAt || patient.status !== PatientStatus.ACTIVE) throw new NotFoundException('SELF Patient identity was not found for the authenticated user');
    return this.create({ ...dto, bookerUserId: user.id, participantPatientId: patient.id });
  }

  async requireSelfBooking(user: User, bookingReference: string): Promise<Booking> {
    if (user.deletedAt || user.status !== UserStatus.ACTIVE) this.selfBookingNotFound();
    const patient = await this.patientRepository.findOne({
      where: { userId: user.id },
      withDeleted: true,
    });
    if (!patient || patient.deletedAt || patient.status !== PatientStatus.ACTIVE)
      this.selfBookingNotFound();
    const booking = await this.bookingRepository.findOne({
      where: { bookingReference, participantPatientId: patient.id },
    });
    if (!booking) this.selfBookingNotFound();
    return booking;
  }

  async create(createBookingDto: CreateBookingDto): Promise<BookingResponseDto> {
    validateBookingSchedulingPreference(createBookingDto);
    await this.validateReferences(createBookingDto);
    await this.validateVisitAddress(createBookingDto.fulfilmentModeId, createBookingDto.visitAddress);
    const capability = await this.selectCommercialCapability(createBookingDto);

    for (let attempt = 0; attempt < MAX_BOOKING_REFERENCE_GENERATION_ATTEMPTS; attempt += 1) {
      try {
        const booking = await this.bookingRepository.manager.transaction(async (manager) => {
          const bookingRepository = manager.getRepository(Booking);
          const historyRepository = manager.getRepository(BookingStatusHistory);
          const addressRepository = manager.getRepository(BookingVisitAddress);
          const providerService = await manager.getRepository(ProviderService).findOne({ where: { id: capability.id, providerId: capability.providerId, healthCheckPackageId: createBookingDto.healthCheckPackageId, fulfilmentModeId: createBookingDto.fulfilmentModeId, isActive: true }, relations: { healthCheckPackage: { contents: true, addonAvailability: { addon: true } }, fulfilmentMode: true }, lock: { mode: 'pessimistic_read' } });
          if (!providerService) throw new ConflictException('Selected provider Health Check offering is no longer available');
          const packageConfiguration: Pick<HealthCheckPackage, 'code' | 'name' | 'contents' | 'addonAvailability'> = providerService.healthCheckPackage ?? { code: '', name: '', contents: [], addonAvailability: [] };
          const modeConfiguration: Pick<FulfilmentMode, 'code' | 'name'> = providerService.fulfilmentMode ?? { code: '', name: '' };
          const addonCodes = createBookingDto.addonCodes ?? [];
          if (addonCodes.includes('HOME_VISIT')) throw new BadRequestException('HOME_VISIT is a fulfilment mode, not a clinical add-on');
          const included = new Set((packageConfiguration.contents ?? []).filter((x) => x.isActive).map((x) => x.code));
          const duplicateIncluded = addonCodes.find((code) => included.has(code));
          if (duplicateIncluded) throw new ConflictException(`Clinical add-on is already included in the package: ${duplicateIncluded}`);
          const compatible = new Set((packageConfiguration.addonAvailability ?? []).filter((x) => x.isActive && x.addon.isActive).map((x) => x.addon.code));
          const capabilities = addonCodes.length ? await manager.getRepository(ProviderServiceAddon).createQueryBuilder('capability').innerJoinAndSelect('capability.addon', 'addon').where('capability.providerServiceId=:serviceId', { serviceId: providerService.id }).andWhere('capability.isActive=true').andWhere('addon.isActive=true').andWhere('addon.code IN (:...codes)', { codes: addonCodes }).setLock('pessimistic_read').getMany() : [];
          for (const code of addonCodes) { if (!compatible.has(code)) throw new BadRequestException(`Clinical add-on is unavailable for this package: ${code}`); if (!capabilities.some((x) => x.addon.code === code)) throw new ConflictException(`Provider does not offer clinical add-on: ${code}`); }
          if (capabilities.some((x) => x.currency !== providerService.currency)) throw new ConflictException('Clinical add-on currency does not match package currency');
          const addonTotal = capabilities.reduce((sum, x) => sum + BigInt(x.priceMinor), 0n);
          const base = BigInt(providerService.priceMinor), fee = BigInt(providerService.fulfilmentFeeMinor ?? '0'), total = base + addonTotal + fee;
          const { visitAddress: _visitAddress, addonCodes: _addonCodes, ...bookingInput } = createBookingDto;
          const booking = bookingRepository.create({
            ...bookingInput,
            bookingReference: generateBookingReference(),
            organisationContextId: createBookingDto.organisationContextId ?? null,
            quotedAmount: this.fromMinor(total.toString()),
            currency: providerService.currency,
            basePackagePriceMinor: base.toString(), clinicalAddonsTotalMinor: addonTotal.toString(), fulfilmentFeeMinor: fee.toString(),
            commercialConfigurationSnapshot: { package: { code: packageConfiguration.code, name: packageConfiguration.name }, includedContents: (packageConfiguration.contents ?? []).filter((x) => x.isActive).sort((a, b) => a.sortOrder - b.sortOrder).map((x) => ({ code: x.code, name: x.name, category: x.category })), selectedAddons: capabilities.map((x) => ({ code: x.addon.code, name: x.addon.name, priceMinor: x.priceMinor })), fulfilmentMode: { code: modeConfiguration.code, name: modeConfiguration.name }, pricing: { basePackagePriceMinor: base.toString(), clinicalAddonsTotalMinor: addonTotal.toString(), fulfilmentFeeMinor: fee.toString(), totalMinor: total.toString(), currency: providerService.currency } },
            commercialProviderId: providerService.providerId,
            commercialProviderServiceId: providerService.id,
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

  private async selectCommercialCapability(dto: CreateBookingDto) {
    const healthPackage = await this.healthCheckPackageRepository.findOne({ where: { id: dto.healthCheckPackageId, isActive: true } });
    const end = healthPackage?.estimatedDurationMinutes ? deriveAppointmentEndTime(dto.preferredTimeWindowStart, healthPackage.estimatedDurationMinutes) : null;
    if (!end) throw new BadRequestException('Health Check package has no valid appointment duration');
    const address = dto.visitAddress ? this.normalizedAddress(dto.visitAddress) : null;
    const eligible = await this.providerCapabilities.findEligibleProviders(dto.healthCheckPackageId, dto.fulfilmentModeId, { requestedDate: dto.preferredDate, requestedStartTime: dto.preferredTimeWindowStart, requestedEndTime: end, requestedTimezone: dto.preferredTimezone, visitAddress: address });
    const capability = eligible[0];
    if (!capability) throw new ConflictException('No eligible priced Provider is currently available for this Health Check');
    return capability;
  }
  private fromMinor(value: string) { const minor = BigInt(value); return `${minor / 100n}.${(minor % 100n).toString().padStart(2, '0')}`; }

  private selfBookingNotFound(): never {
    throw new NotFoundException('Health Check was not found for the authenticated patient');
  }

}
