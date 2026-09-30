import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Patient } from '../patients/entities/patient.entity';
import { PatientStatus } from '../patients/enums/patient-status.enum';
import { CurrentProviderService } from '../providers/current-provider.service';
import { ProviderOnboardingStatus } from '../providers/enums/provider-onboarding-status.enum';
import { ProviderStatus } from '../providers/enums/provider-status.enum';
import { User } from '../users/entities/user.entity';
import { PartnerFacilityDirectoryQueryDto } from './dto/partner-facility-directory.dto';
import { PartnerFacilityInterest } from './entities/partner-facility-interest.entity';
import { PartnerFacilityListing, PartnerFacilityReadiness } from './entities/partner-facility-listing.entity';

@Injectable()
export class PartnerFacilityDirectoryService {
  constructor(
    @InjectRepository(PartnerFacilityListing) private readonly listings: Repository<PartnerFacilityListing>,
    @InjectRepository(PartnerFacilityInterest) private readonly interests: Repository<PartnerFacilityInterest>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    private readonly currentProvider: CurrentProviderService,
  ) {}

  async directory(user: User, query: PartnerFacilityDirectoryQueryDto) {
    await this.patient(user.id);
    const qb = this.listings.createQueryBuilder('listing')
      .leftJoinAndSelect('listing.provider', 'provider')
      .where('listing.active = true');
    if (query.facilityType) qb.andWhere('listing.facilityType = :type', { type: query.facilityType });
    if (query.stateOrRegion) qb.andWhere('listing.stateOrRegion ILIKE :state', { state: query.stateOrRegion });
    if (query.city) qb.andWhere('listing.city ILIKE :city', { city: query.city });
    if (query.q) qb.andWhere('(listing.displayName ILIKE :q OR listing.city ILIKE :q OR listing.stateOrRegion ILIKE :q)', { q: `%${query.q}%` });
    qb.orderBy('listing.stateOrRegion', 'ASC', 'NULLS LAST')
      .addOrderBy('listing.city', 'ASC', 'NULLS LAST')
      .addOrderBy('listing.displayName', 'ASC')
      .skip((query.page - 1) * query.limit).take(query.limit);
    const [rows, total] = await qb.getManyAndCount();
    return { items: rows.map(row => this.view(row)), page: query.page, limit: query.limit, total, totalPages: total ? Math.ceil(total / query.limit) : 0 };
  }

  async requestContact(user: User, listingId: string, consentAcknowledged: boolean) {
    if (!consentAcknowledged) throw new BadRequestException('Consent is required before SmartClinic contacts this facility on your behalf');
    const patient = await this.patient(user.id);
    const listing = await this.listings.findOneBy({ id: listingId, active: true });
    if (!listing) throw new NotFoundException('Facility listing was not found');
    const existing = await this.interests.findOneBy({ patientId: patient.id, listingId: listing.id });
    if (existing) return { accepted: true, alreadyRequested: true };
    await this.interests.save(this.interests.create({ patientId: patient.id, listingId: listing.id, consentCapturedAt: new Date() }));
    return { accepted: true, alreadyRequested: false };
  }

  async adminDemand() {
    return this.interests.createQueryBuilder('interest')
      .innerJoin('interest.listing', 'listing')
      .select('listing.id', 'listingId')
      .addSelect('listing.sourceReference', 'sourceReference')
      .addSelect('listing.displayName', 'displayName')
      .addSelect('listing.facilityType', 'facilityType')
      .addSelect('listing.stateOrRegion', 'stateOrRegion')
      .addSelect('listing.city', 'city')
      .addSelect('COUNT(DISTINCT interest.patientId)', 'interestedPatients')
      .addSelect('MAX(interest.createdAt)', 'latestInterestAt')
      .groupBy('listing.id')
      .orderBy('COUNT(DISTINCT interest.patientId)', 'DESC')
      .addOrderBy('listing.displayName', 'ASC')
      .getRawMany();
  }

  async providerDemand(user: User) {
    const provider = await this.currentProvider.resolveOperational(user);
    return this.interests.createQueryBuilder('interest')
      .innerJoin('interest.listing', 'listing')
      .where('listing.providerId = :providerId', { providerId: provider.id })
      .select('listing.sourceReference', 'sourceReference')
      .addSelect('listing.displayName', 'displayName')
      .addSelect('listing.facilityType', 'facilityType')
      .addSelect('COUNT(DISTINCT interest.patientId)', 'interestedPatients')
      .addSelect('MIN(interest.createdAt)', 'firstInterestAt')
      .addSelect('MAX(interest.createdAt)', 'latestInterestAt')
      .groupBy('listing.id')
      .orderBy('MAX(interest.createdAt)', 'DESC')
      .getRawMany();
  }

  private async patient(userId: string) {
    const patient = await this.patients.findOne({ where: { userId }, withDeleted: true });
    if (!patient || patient.deletedAt || patient.status !== PatientStatus.ACTIVE) throw new NotFoundException('Patient profile was not found');
    return patient;
  }

  private view(row: PartnerFacilityListing) {
    return {
      id: row.id,
      sourceReference: row.sourceReference,
      displayName: row.displayName,
      facilityType: row.facilityType,
      location: { city: row.city, stateOrRegion: row.stateOrRegion, countryCode: row.countryCode },
      readiness: row.readiness,
      providerReference: row.provider?.providerReference ?? null,
      source: row.source,
      sourceVerifiedAt: row.sourceVerifiedAt,
      availableForConnection: row.readiness !== PartnerFacilityReadiness.AVAILABLE_TO_JOIN &&
        row.provider?.status === ProviderStatus.ACTIVE &&
        row.provider?.onboardingStatus === ProviderOnboardingStatus.APPROVED &&
        (row.provider?.newPatientRegistrationEnabled || row.provider?.existingPatientLinkEnabled),
    };
  }
}
