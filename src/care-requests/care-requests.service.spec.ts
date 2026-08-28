import { ConflictException, NotFoundException } from '@nestjs/common';
import { CareRequestsService } from './care-requests.service';
import { CareRequest } from './entities/care-request.entity';
import { CareRequestStatusHistory } from './entities/care-request-status-history.entity';
import { Patient } from '../patients/entities/patient.entity';
import { CareServiceDefinition } from '../providers/entities/care-service-definition.entity';
import { CareRequestStatus } from './enums/care-request-status.enum';
import { CareRequestContactMethod } from './enums/care-request-contact-method.enum';
import { CareAppointmentStatus } from '../care-appointments/enums/care-appointment-status.enum';
import { CareDeliveryMode } from '../providers/enums/care-delivery-mode.enum';

describe('CareRequestsService', () => {
  const user: any = { id: 'user-1' }; const patient: any = { id: 'patient-1', userId: user.id, status: 'ACTIVE', deletedAt: null };
  const definition: any = { id: 'definition-1', code: 'GENERAL_CONSULTATION', name: 'General consultation', isActive: true };
  const provider: any = { id: 'provider-1', providerReference: 'SCPR-ABCDEF0123456789', displayName: 'Ada Clinic', providerType: 'CLINIC', city: 'Ikeja', stateOrRegion: 'Lagos', countryCode: 'NG', onboardingStatus: 'APPROVED' };
  const dto: any = { serviceCode: definition.code, countryCode: 'NG', stateOrRegion: 'Lagos', city: 'Ikeja', contactMethod: CareRequestContactMethod.WHATSAPP };
  let rows: any[]; let histories: any[]; let manager: any; let requests: any; let eligibility: any; let current: any; let readQb: any; let subject: CareRequestsService;
  beforeEach(() => {
    rows = []; histories = [];
    const patientRepo = { findOne: jest.fn().mockResolvedValue(patient) };
    const definitionRepo = { findOne: jest.fn().mockResolvedValue(definition) };
    readQb = {}; for (const method of ['innerJoinAndSelect', 'leftJoinAndSelect', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'skip', 'take']) readQb[method] = jest.fn().mockReturnValue(readQb); readQb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]); readQb.getOne = jest.fn().mockResolvedValue(null);
    const requestRepo = { create: jest.fn((value) => value), save: jest.fn(async (value) => { if (!value.id) { value.id = `request-${rows.length + 1}`; value.createdAt = new Date(); value.updatedAt = new Date(); rows.push(value); } return value; }), findOne: jest.fn(), createQueryBuilder: jest.fn().mockReturnValue(readQb) };
    const historyRepo = { create: jest.fn((value) => value), save: jest.fn(async (value) => { histories.push(value); return value; }) };
    const repositories = new Map<any, any>([[Patient, patientRepo], [CareServiceDefinition, definitionRepo], [CareRequest, requestRepo], [CareRequestStatusHistory, historyRepo]]);
    manager = { getRepository: (entity: any) => repositories.get(entity), transaction: jest.fn(async (fn) => fn(manager)) };
    (patientRepo as any).manager = manager;
    requests = { manager };
    eligibility = { requireEligible: jest.fn().mockResolvedValue({ id: 'offering-1', providerId: provider.id, provider }) };
    current = { resolve: jest.fn().mockResolvedValue(provider) };
    subject = new CareRequestsService(requests, patientRepo as any, eligibility, current);
    (subject as any).getMapped = jest.fn(async (_manager: any, id: string) => ({ reference: rows.find((row) => row.id === id)?.reference, status: rows.find((row) => row.id === id)?.status }));
  });

  it('creates no-preference requests atomically in MATCHING', async () => {
    const result: any = await subject.create(user, dto);
    expect(result.status).toBe(CareRequestStatus.MATCHING); expect(rows[0].assignedProviderId).toBeNull(); expect(eligibility.requireEligible).not.toHaveBeenCalled();
    expect(rows[0].deliveryMode).toBe(CareDeliveryMode.IN_PERSON);
    expect(histories).toEqual([expect.objectContaining({ fromStatus: null, toStatus: CareRequestStatus.MATCHING, actorUserId: user.id, reasonCode: 'MATCHING_REQUESTED' })]);
    expect(manager.transaction).toHaveBeenCalledTimes(1);
  });

  it.each([CareDeliveryMode.IN_PERSON, CareDeliveryMode.VIRTUAL, CareDeliveryMode.HOME_VISIT])('persists requested %s mode without a preferred provider', async (deliveryMode) => {
    await subject.create(user, { ...dto, deliveryMode });
    expect(rows[0].deliveryMode).toBe(deliveryMode);
  });

  it('routes an eligible preferred provider and exact offering for response', async () => {
    const result: any = await subject.create(user, { ...dto, preferredProviderReference: provider.providerReference });
    expect(result.status).toBe(CareRequestStatus.AWAITING_PROVIDER_RESPONSE);
    expect(rows[0]).toMatchObject({ preferredProviderId: provider.id, preferredProviderCareServiceId: 'offering-1', assignedProviderId: provider.id, assignedProviderCareServiceId: 'offering-1' });
  });

  it('rejects an inactive/unknown service', async () => { manager.getRepository(CareServiceDefinition).findOne.mockResolvedValue(null); await expect(subject.create(user, dto)).rejects.toBeInstanceOf(ConflictException); expect(rows).toHaveLength(0); });
  it('propagates preferred-provider eligibility failures without creating', async () => { eligibility.requireEligible.mockRejectedValue(new ConflictException()); await expect(subject.create(user, { ...dto, preferredProviderReference: provider.providerReference })).rejects.toBeInstanceOf(ConflictException); expect(rows).toHaveLength(0); });

  it('uses patient-scoped lookup for cancellation and hides another patient request', async () => { manager.getRepository(CareRequest).findOne.mockResolvedValue(null); await expect(subject.cancelMine(user, 'SC-CARE-ABCDEF123456')).rejects.toBeInstanceOf(NotFoundException); expect(manager.getRepository(CareRequest).findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { reference: 'SC-CARE-ABCDEF123456', patientId: patient.id } })); });
  it('prevents cancellation after provider acceptance', async () => { manager.getRepository(CareRequest).findOne.mockResolvedValue({ id: 'request', status: CareRequestStatus.PROVIDER_ACCEPTED }); await expect(subject.cancelMine(user, 'SC-CARE-ABCDEF123456')).rejects.toBeInstanceOf(ConflictException); });

  it('lets only the assigned provider accept and revalidates eligibility under lock', async () => {
    const request: any = { id: 'request', reference: 'SC-CARE-ABCDEF123456', status: CareRequestStatus.AWAITING_PROVIDER_RESPONSE, assignedProviderId: provider.id, careServiceDefinitionId: definition.id, deliveryMode: CareDeliveryMode.VIRTUAL, countryCode: 'NG', stateOrRegion: 'Lagos', city: 'Ikeja' }; rows.push(request); manager.getRepository(CareRequest).findOne.mockResolvedValue(request);
    await expect(subject.providerRespond(user, request.reference, true, null)).resolves.toMatchObject({ status: CareRequestStatus.PROVIDER_ACCEPTED });
    expect(eligibility.requireEligible).toHaveBeenCalledWith(expect.objectContaining({ providerId: provider.id, deliveryMode: CareDeliveryMode.VIRTUAL }), manager); expect(histories.at(-1)).toMatchObject({ toStatus: CareRequestStatus.PROVIDER_ACCEPTED, reasonCode: 'PROVIDER_ACCEPTED' });
  });
  it('hides requests from unrelated providers', async () => { manager.getRepository(CareRequest).findOne.mockResolvedValue(null); await expect(subject.providerRespond(user, 'SC-CARE-ABCDEF123456', true, null)).rejects.toBeInstanceOf(NotFoundException); });
  it('provider queues are scoped only to the currently assigned provider', async () => { await subject.listForProvider(user, { page: 1, limit: 20 }); expect(readQb.where).toHaveBeenCalledWith('request.assignedProviderId = :providerId', { providerId: provider.id }); });

  it('returns null appointment for an unscheduled patient/provider detail', async () => {
    const request: any = { reference: 'SC-CARE-ABCDEF123456', status: CareRequestStatus.PROVIDER_ACCEPTED, patientId: patient.id, assignedProviderId: provider.id, careServiceDefinition: definition, preferredProvider: null, assignedProvider: provider, countryCode: 'NG', stateOrRegion: 'Lagos', city: 'Ikeja', preferredDate: null, preferredTime: null, contactMethod: CareRequestContactMethod.WHATSAPP, notes: null, appointments: [], createdAt: new Date(), updatedAt: new Date() };
    readQb.getOne.mockResolvedValue(request);
    await expect(subject.getMine(user, request.reference)).resolves.toMatchObject({ appointment: null });
    await expect(subject.getForProvider(user, request.reference)).resolves.toMatchObject({ appointment: null });
  });

  it('projects the authoritative appointment and safe location without internal IDs', async () => {
    const appointment: any = { id: 'appointment-secret', reference: 'SC-APT-ABCDEF123456', status: CareAppointmentStatus.SCHEDULED, deliveryMode: CareDeliveryMode.IN_PERSON, meetingUrl: null, scheduledDate: '2026-09-10', scheduledTimeFrom: '10:30:00', scheduledTimeTo: '11:00:00', timezone: 'Africa/Lagos', createdAt: new Date('2026-08-28T10:00:00Z'), providerLocation: { id: 'location-secret', providerId: 'provider-secret', locationReference: 'SCPL-ABCDEF0123456789', name: 'Ikeja Clinic', addressLine1: '12 Clinic Road', addressLine2: null, city: 'Ikeja', state: 'Lagos', postalCode: '100271', countryCode: 'NG' } };
    const request: any = { reference: 'SC-CARE-ABCDEF123456', status: CareRequestStatus.SCHEDULED, patientId: patient.id, assignedProviderId: provider.id, careServiceDefinition: definition, preferredProvider: null, assignedProvider: provider, countryCode: 'NG', stateOrRegion: 'Lagos', city: 'Ikeja', preferredDate: null, preferredTime: null, contactMethod: CareRequestContactMethod.WHATSAPP, notes: null, appointments: [appointment], createdAt: new Date(), updatedAt: new Date() };
    readQb.getOne.mockResolvedValue(request);
    const patientResult: any = await subject.getMine(user, request.reference); const providerResult: any = await subject.getForProvider(user, request.reference);
    expect(patientResult.appointment).toEqual({ reference: appointment.reference, status: CareAppointmentStatus.SCHEDULED, scheduledDate: '2026-09-10', scheduledTimeFrom: '10:30:00', scheduledTimeTo: '11:00:00', timezone: 'Africa/Lagos', deliveryMode: CareDeliveryMode.IN_PERSON, hasMeetingLink: false, location: { reference: 'SCPL-ABCDEF0123456789', name: 'Ikeja Clinic', addressLine1: '12 Clinic Road', addressLine2: null, city: 'Ikeja', stateOrRegion: 'Lagos', postalCode: '100271', countryCode: 'NG' } });
    expect(providerResult.appointment).toEqual(patientResult.appointment);
    expect(JSON.stringify(patientResult)).not.toContain('appointment-secret'); expect(JSON.stringify(patientResult)).not.toContain('location-secret'); expect(JSON.stringify(providerResult)).not.toContain('provider-secret');
  });

  it('chooses an active appointment over history, otherwise the newest historical appointment deterministically', async () => {
    const base: any = { scheduledDate: '2026-09-10', scheduledTimeFrom: '10:30', scheduledTimeTo: '11:00', timezone: 'Africa/Lagos', providerLocation: null };
    const historical = { ...base, reference: 'SC-APT-AAAAAA111111', status: CareAppointmentStatus.CANCELLED, createdAt: new Date('2026-08-28T12:00:00Z') };
    const active = { ...base, reference: 'SC-APT-BBBBBB222222', status: CareAppointmentStatus.SCHEDULED, createdAt: new Date('2026-08-28T10:00:00Z') };
    expect((subject as any).currentAppointment([historical, active]).reference).toBe(active.reference);
    const newerCancelled = { ...base, reference: 'SC-APT-CCCCCC333333', status: CareAppointmentStatus.CANCELLED, createdAt: new Date('2026-08-28T13:00:00Z') };
    expect((subject as any).currentAppointment([historical, newerCancelled]).reference).toBe(newerCancelled.reference);
  });

  it('preserves narrow patient/provider ownership when joining appointments', async () => {
    readQb.getOne.mockResolvedValue(null);
    await expect(subject.getMine(user, 'SC-CARE-ABCDEF123456')).rejects.toBeInstanceOf(NotFoundException);
    await expect(subject.getForProvider(user, 'SC-CARE-ABCDEF123456')).rejects.toBeInstanceOf(NotFoundException);
    expect(readQb.andWhere).toHaveBeenCalledWith('request.patientId = :patientId', { patientId: patient.id });
    expect(readQb.andWhere).toHaveBeenCalledWith('request.assignedProviderId = :providerId', { providerId: provider.id });
  });

  it('admin assigns the exact eligible offering and records history', async () => {
    const request: any = { id: 'request', status: CareRequestStatus.MATCHING, assignedProviderId: null, careServiceDefinitionId: definition.id, countryCode: 'NG', stateOrRegion: 'Lagos', city: 'Ikeja' }; rows.push(request); manager.getRepository(CareRequest).findOne.mockResolvedValue(request);
    await subject.assign('SC-CARE-ABCDEF123456', 'admin-user', { providerReference: provider.providerReference });
    expect(request).toMatchObject({ assignedProviderId: provider.id, assignedProviderCareServiceId: 'offering-1', status: CareRequestStatus.AWAITING_PROVIDER_RESPONSE }); expect(histories.at(-1)).toMatchObject({ actorUserId: 'admin-user', reasonCode: 'PROVIDER_ASSIGNED' });
  });
  it('rejects assignment after acceptance', async () => { manager.getRepository(CareRequest).findOne.mockResolvedValue({ id: 'request', status: CareRequestStatus.PROVIDER_ACCEPTED }); await expect(subject.assign('SC-CARE-ABCDEF123456', 'admin', { providerReference: provider.providerReference })).rejects.toBeInstanceOf(ConflictException); });
});
