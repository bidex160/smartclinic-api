import { BadRequestException } from '@nestjs/common';
import { PartnerFacilityDirectoryService } from './partner-facility-directory.service';
import { PartnerFacilityType } from './entities/partner-facility-listing.entity';

describe('PartnerFacilityDirectoryService', () => {
  const user: any = { id: 'user-1' };
  const patient: any = { id: 'patient-1', userId: user.id, status: 'ACTIVE', deletedAt: null };
  let listings: any, interests: any, patients: any, subject: PartnerFacilityDirectoryService;

  beforeEach(() => {
    const qb: any = {};
    for (const method of ['leftJoinAndSelect', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'skip', 'take']) qb[method] = jest.fn().mockReturnValue(qb);
    qb.getManyAndCount = jest.fn().mockResolvedValue([[{ id: 'listing-1', sourceReference: 'HFR-1', displayName: 'A Hospital', facilityType: PartnerFacilityType.HOSPITAL, countryCode: 'NG', stateOrRegion: 'Lagos', city: 'Ikeja', readiness: 'AVAILABLE_TO_JOIN', provider: null }], 1]);
    listings = { createQueryBuilder: jest.fn(() => qb), findOneBy: jest.fn().mockResolvedValue({ id: 'listing-1' }) };
    interests = { findOneBy: jest.fn().mockResolvedValue(null), create: jest.fn(v => v), save: jest.fn(async v => v), createQueryBuilder: jest.fn() };
    patients = { findOne: jest.fn().mockResolvedValue(patient) };
    subject = new PartnerFacilityDirectoryService(listings, interests, patients, { resolveOperational: jest.fn().mockResolvedValue({ id: 'provider-id' }) } as any);
  });

  it('filters by type and location and returns location-first, alphabetical directory rows', async () => {
    const result: any = await subject.directory(user, { page: 1, limit: 20, facilityType: PartnerFacilityType.HOSPITAL, stateOrRegion: 'Lagos' });
    const qb = listings.createQueryBuilder();
    expect(qb.andWhere).toHaveBeenCalledWith('listing.facilityType = :type', { type: 'HOSPITAL' });
    expect(qb.andWhere).toHaveBeenCalledWith('listing.stateOrRegion ILIKE :state', { state: 'Lagos' });
    expect(qb.addOrderBy).toHaveBeenCalledWith('listing.displayName', 'ASC');
    expect(result.items[0]).toMatchObject({ readiness: 'AVAILABLE_TO_JOIN', availableForConnection: false });
  });

  it('requires explicit consent and records no duplicate patient-facility interest', async () => {
    await expect(subject.requestContact(user, 'listing-1', false)).rejects.toBeInstanceOf(BadRequestException);
    await expect(subject.requestContact(user, 'listing-1', true)).resolves.toEqual({ accepted: true, alreadyRequested: false });
    expect(interests.save).toHaveBeenCalledWith(expect.objectContaining({ patientId: patient.id, listingId: 'listing-1', consentCapturedAt: expect.any(Date) }));
    interests.findOneBy.mockResolvedValue({ id: 'existing' });
    await expect(subject.requestContact(user, 'listing-1', true)).resolves.toEqual({ accepted: true, alreadyRequested: true });
  });
});
