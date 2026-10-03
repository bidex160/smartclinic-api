import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { mapsLinks } from '../facility-outreach/registry/google-places';
import { Patient } from '../patients/entities/patient.entity';
import { PatientStatus } from '../patients/enums/patient-status.enum';
import { CurrentProviderService } from '../providers/current-provider.service';
import { ProviderOnboardingStatus } from '../providers/enums/provider-onboarding-status.enum';
import { ProviderStatus } from '../providers/enums/provider-status.enum';
import { User } from '../users/entities/user.entity';
import { PartnerFacilityDirectoryQueryDto } from './dto/partner-facility-directory.dto';
import { PartnerFacilityInterest } from './entities/partner-facility-interest.entity';
import { PartnerFacilityRequest } from './entities/partner-facility-request.entity';
import { PartnerFacilityListing, PartnerFacilityReadiness } from './entities/partner-facility-listing.entity';
import { CreatePartnerFacilityRequestDto, PartnerFacilityFollowUpStatus } from './dto/partner-facility-directory.dto';

@Injectable()
export class PartnerFacilityDirectoryService {
  constructor(
    @InjectRepository(PartnerFacilityListing) private readonly listings: Repository<PartnerFacilityListing>,
    @InjectRepository(PartnerFacilityInterest) private readonly interests: Repository<PartnerFacilityInterest>,
    @InjectRepository(PartnerFacilityRequest) private readonly requests: Repository<PartnerFacilityRequest>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    private readonly currentProvider: CurrentProviderService,
  ) {}

  async directory(user: User, query: PartnerFacilityDirectoryQueryDto) {
    const patient = await this.patient(user.id);
    const qb = this.listings.createQueryBuilder('listing')
      .leftJoinAndSelect('listing.provider', 'provider')
      .where('listing.active = true');
    if (query.facilityType) qb.andWhere('listing.facilityType = :type', { type: query.facilityType });
    if (query.stateOrRegion) qb.andWhere('listing.stateOrRegion ILIKE :state', { state: query.stateOrRegion });
    if (query.city) qb.andWhere('(listing.city ILIKE :city OR listing.lga ILIKE :city)', { city: query.city });
    if (query.q) qb.andWhere('(listing.displayName ILIKE :q OR listing.city ILIKE :q OR listing.stateOrRegion ILIKE :q OR listing.address ILIKE :q)', { q: `%${query.q.replace(/[%_]/g, '')}%` });
    if (query.verifiedOnly) qb.andWhere('(listing.registryVerified = true OR EXISTS (SELECT 1 FROM provider_credentials pc WHERE pc.provider_id = listing.provider_id AND pc.status = \'VERIFIED\'))');
    const near = typeof query.lat === 'number' && typeof query.lng === 'number';
    if (near) {
      // Equirectangular distance is plenty for sorting within a country; km = degrees × 111.
      const cos = Math.cos((query.lat! * Math.PI) / 180);
      qb.addSelect(`CASE WHEN listing.latitude IS NULL THEN NULL ELSE 111.0 * SQRT(POWER(listing.latitude - :lat, 2) + POWER((listing.longitude - :lng) * :cos, 2)) END`, 'distance_km')
        .setParameters({ lat: query.lat, lng: query.lng, cos })
        .orderBy('distance_km', 'ASC', 'NULLS LAST');
    } else {
      qb.orderBy('CASE WHEN listing.providerId IS NOT NULL THEN 0 WHEN listing.registryVerified THEN 1 ELSE 2 END', 'ASC');
    }
    qb.addOrderBy('listing.displayName', 'ASC')
      .addOrderBy('listing.stateOrRegion', 'ASC', 'NULLS LAST')
      .addOrderBy('listing.city', 'ASC', 'NULLS LAST')
      .offset((query.page - 1) * query.limit).limit(query.limit);
    const [{ entities, raw }, total] = await Promise.all([qb.getRawAndEntities(), qb.getCount()]);
    const ids = entities.map((r) => r.id);
    const contacts = new Map<string, { phone: string | null; whatsapp: string | null }>();
    const asked = new Set<string>();
    const verifiedProviders = new Set<string>();
    if (ids.length) {
      const rows: { listing_id: string; phone: string | null; whatsapp: string | null }[] = await this.listings.manager.query('SELECT listing_id, phone, whatsapp FROM facility_outreach WHERE listing_id = ANY($1::uuid[])', [ids]);
      for (const r of rows) contacts.set(r.listing_id, { phone: r.phone, whatsapp: r.whatsapp });
      for (const i of await this.interests.find({ where: { patientId: patient.id, listingId: In(ids) }, select: { listingId: true } })) asked.add(i.listingId);
      const providerIds = entities.map((r) => r.providerId).filter((v): v is string => Boolean(v));
      if (providerIds.length) {
        const creds: { provider_id: string }[] = await this.listings.manager.query("SELECT provider_id FROM provider_credentials WHERE provider_id = ANY($1::uuid[]) AND status = 'VERIFIED'", [providerIds]);
        for (const c of creds) verifiedProviders.add(c.provider_id);
      }
    }
    // getRawAndEntities keeps the order of entities and raw rows aligned by id.
    const distance = new Map<string, number | null>();
    for (const r of raw as Record<string, unknown>[]) distance.set(String(r['listing_id']), r['distance_km'] == null ? null : Math.round(Number(r['distance_km']) * 10) / 10);
    return {
      items: entities.map((row) => ({
        ...this.view(row),
        contact: contacts.get(row.id) ?? { phone: row.registryPhone, whatsapp: null },
        verified: row.registryVerified || (row.providerId ? verifiedProviders.has(row.providerId) : false),
        alreadyAsked: asked.has(row.id),
        distanceKm: near ? distance.get(row.id) ?? null : null,
      })),
      page: query.page, limit: query.limit, total, totalPages: total ? Math.ceil(total / query.limit) : 0,
    };
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

  async createRequest(user: User, listingId: string, dto: CreatePartnerFacilityRequestDto) {
    if (!dto.consentAcknowledged) throw new BadRequestException('Consent is required before SmartClinic contacts this facility on your behalf');
    const patient = await this.patient(user.id);
    const listing = await this.listings.findOneBy({ id: listingId, active: true });
    if (!listing) throw new NotFoundException('Facility listing was not found');
    if (dto.preferredAt && new Date(dto.preferredAt).getTime() < Date.now()) throw new BadRequestException('Choose a future preferred date and time');
    const request = await this.requests.save(this.requests.create({
      patientId: patient.id, listingId: listing.id, requestType: dto.requestType,
      preferredAt: dto.preferredAt ? new Date(dto.preferredAt) : null,
      consentCapturedAt: new Date(), status: 'NEW',
    }));
    return { accepted: true, reference: `SC-PFR-${request.id.slice(0, 8).toUpperCase()}`, status: request.status, createdAt: request.createdAt };
  }

  async adminRequests() {
    return this.requests.createQueryBuilder('request')
      .innerJoinAndSelect('request.listing', 'listing')
      .innerJoinAndSelect('request.patient', 'patient')
      .where('request.status IN (:...statuses)', { statuses: ['NEW', 'CONTACTED'] })
      .select(['request.id', 'request.requestType', 'request.preferredAt', 'request.status', 'request.createdAt', 'request.consentCapturedAt', 'listing.displayName', 'listing.facilityType', 'listing.city', 'listing.stateOrRegion', 'patient.patientReference', 'patient.givenName', 'patient.familyName', 'patient.phone', 'patient.email'])
      .orderBy('request.createdAt', 'ASC')
      .take(500)
      .getMany();
  }

  async updateRequestStatus(id: string, status: PartnerFacilityFollowUpStatus) {
    const request = await this.requests.findOneBy({ id });
    if (!request) throw new NotFoundException('Facility follow-up request was not found');
    request.status = status;
    return this.requests.save(request);
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
      location: { city: row.city, stateOrRegion: row.stateOrRegion, countryCode: row.countryCode, address: row.address, lga: row.lga },
      levelOfCare: row.levelOfCare,
      ownership: row.ownership,
      registryVerified: row.registryVerified,
      ...mapsLinks(row),
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
