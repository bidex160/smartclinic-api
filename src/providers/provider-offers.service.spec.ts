import { ConflictException, NotFoundException } from '@nestjs/common';
import { User } from '../users/entities/user.entity';
import { ProviderOffersService } from './provider-offers.service';
import { ProviderAssignmentStatus } from './enums/provider-assignment-status.enum';

const providerId = '10000000-0000-4000-8000-000000000001';
const otherProviderId = '10000000-0000-4000-8000-000000000002';
const assignmentId = '20000000-0000-4000-8000-000000000001';
const user = { id: '30000000-0000-4000-8000-000000000001' } as User;
const offer = (changes = {}) => ({ id: assignmentId, providerId, status: ProviderAssignmentStatus.OFFERED, offeredAt: new Date('2026-08-24T08:00:00Z'), expiresAt: new Date('2026-08-24T08:30:00Z'), respondedAt: null, acceptedAt: null, reasonNote: null, booking: { bookingReference: 'SC-2026-ABCDEF123456', preferredDate: '2026-08-24', preferredTimeWindowStart: '09:00', preferredTimeWindowEnd: '11:00', preferredTimezone: 'Africa/Lagos', preferredLocationNote: 'sensitive free text', healthCheckPackage: { code: 'ESSENTIAL', name: 'Essential Health Check' }, fulfilmentMode: { code: 'HOME_VISIT', name: 'Home visit' }, participant: { id: 'patient-id', givenName: 'Ada', familyName: 'Okafor', dateOfBirth: '1990-01-01', phone: '+2348000000000' } }, ...changes });

describe('ProviderOffersService', () => {
  let repository: any, matching: any, subject: ProviderOffersService, current: any;
  beforeEach(() => {
    const own: any = offer();
    repository = { find: jest.fn(async ({ where }) => where.providerId === providerId ? [own] : []), findOne: jest.fn(async ({ where }) => where.id === assignmentId && where.providerId === providerId ? own : null) };
    current = { resolve: jest.fn().mockResolvedValue({ id: providerId }) };
    matching = { acceptOffer: jest.fn(async () => { own.status = ProviderAssignmentStatus.CONFIRMED; own.respondedAt = new Date(); own.acceptedAt = new Date(); own.confirmedAt = new Date(); }), declineOffer: jest.fn(async (_id, _provider, reason) => { own.status = ProviderAssignmentStatus.DECLINED; own.respondedAt = new Date(); own.reasonNote = reason; }) };
    subject = new ProviderOffersService(repository, current, matching);
  });
  it('lists only offers scoped to the current provider', async () => { const result = await subject.list(user); expect(result).toHaveLength(1); expect(repository.find).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ providerId }) })); });
  it('gets an owned offer', async () => expect(subject.get(user, assignmentId)).resolves.toMatchObject({ assignmentId, bookingReference: 'SC-2026-ABCDEF123456' }));
  it('returns a safe 404 for another provider offer', async () => { repository.findOne.mockResolvedValue(null); await expect(subject.get(user, 'other-assignment')).rejects.toBeInstanceOf(NotFoundException); });
  it('accepts an owned offer using resolved provider identity and returns automatic confirmation', async () => { const result = await subject.accept(user, assignmentId); expect(matching.acceptOffer).toHaveBeenCalledWith(assignmentId, providerId, undefined, user.id); expect(result.status).toBe(ProviderAssignmentStatus.CONFIRMED); });
  it('declines an owned offer using resolved provider identity', async () => { const result = await subject.decline(user, assignmentId, 'Unavailable'); expect(matching.declineOffer).toHaveBeenCalledWith(assignmentId, providerId, 'Unavailable'); expect(result).toMatchObject({ status: ProviderAssignmentStatus.DECLINED, responseReason: 'Unavailable' }); });
  it('propagates predictable expired-offer conflicts without reviving the offer', async () => { matching.acceptOffer.mockRejectedValue(new ConflictException('Offer has expired')); await expect(subject.accept(user, assignmentId)).rejects.toBeInstanceOf(ConflictException); expect((await subject.get(user, assignmentId)).status).toBe(ProviderAssignmentStatus.OFFERED); });
  it('returns a minimized response without internal identities or patient details', async () => { const response = await subject.get(user, assignmentId); expect(response).not.toHaveProperty('providerId'); expect(response).not.toHaveProperty('bookingId'); expect(response).not.toHaveProperty('locationNote'); expect(response.participant).toEqual({ givenName: 'Ada', familyName: 'Okafor' }); expect(response.participant).not.toHaveProperty('dateOfBirth'); expect(response.participant).not.toHaveProperty('phone'); });
  it('cannot list another provider even if unrelated data exists', async () => { current.resolve.mockResolvedValue({ id: otherProviderId }); await expect(subject.list(user)).resolves.toEqual([]); });
});
