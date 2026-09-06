import { NotFoundException } from '@nestjs/common';
import { CareRequest } from '../care-requests/entities/care-request.entity';
import { CareRequestStatus } from '../care-requests/enums/care-request-status.enum';
import { Patient } from '../patients/entities/patient.entity';
import { CareServiceDefinition } from '../providers/entities/care-service-definition.entity';
import { ProviderCareService } from '../providers/entities/provider-care-service.entity';
import { Provider } from '../providers/entities/provider.entity';
import { FastTrackRequestStatusHistory } from './entities/fasttrack-request-status-history.entity';
import { FastTrackRequest } from './entities/fasttrack-request.entity';
import { FastTrackService } from './fasttrack.service';

describe('FastTrackService family participants', () => {
  const user: any = { id: 'guardian-user' };
  const self: any = { id: 'self-patient', patientReference: 'SCP-SELF-0001', userId: user.id, status: 'ACTIVE', deletedAt: null };
  const dependant: any = { id: 'dependant-patient', patientReference: 'SCP-CHLD-0001', userId: null, email: null, phone: null };
  const dto: any = { providerReference: 'SCPR-ABCDEF0123456789', serviceCode: 'GENERAL_CONSULTATION', externalAppointmentReference: 'EXT-100', appointmentDate: '2026-09-10' };
  let requestRows: any[], requestRepo: any, patientRepo: any, careRepo: any, definitionRepo: any, providerRepo: any, offeringRepo: any, historyRepo: any, manager: any, access: any, subject: FastTrackService;

  beforeEach(() => {
    requestRows = [];
    requestRepo = { manager: null, findOne: jest.fn(), create: jest.fn((value) => value), save: jest.fn(async (value) => { const row = { id: value.id ?? 'fasttrack-id', ...value }; requestRows.push(row); return row; }), createQueryBuilder: jest.fn(() => ({ setLock: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), getOne: jest.fn().mockResolvedValue(null) })) };
    patientRepo = { manager: null, findOne: jest.fn().mockResolvedValue(self) };
    careRepo = { findOne: jest.fn() };
    definitionRepo = { findOne: jest.fn().mockResolvedValue({ id: 'definition-id', code: dto.serviceCode, isActive: true }) };
    providerRepo = { findOne: jest.fn().mockResolvedValue({ id: 'provider-id', providerReference: dto.providerReference, status: 'ACTIVE', onboardingStatus: 'APPROVED', deletedAt: null }) };
    offeringRepo = { findOne: jest.fn().mockResolvedValue({ id: 'offering-id', providerId: 'provider-id', careServiceDefinitionId: 'definition-id', isActive: true, supportsFastTrack: true, fastTrackFeeMinor: '500000', fastTrackCurrency: 'NGN' }) };
    historyRepo = { create: jest.fn((value) => value), save: jest.fn(async (value) => value) };
    manager = { getRepository: jest.fn((entity) => entity === FastTrackRequest ? requestRepo : entity === Patient ? patientRepo : entity === CareRequest ? careRepo : entity === CareServiceDefinition ? definitionRepo : entity === Provider ? providerRepo : entity === ProviderCareService ? offeringRepo : entity === FastTrackRequestStatusHistory ? historyRepo : {}), transaction: jest.fn(async (work) => work(manager)) };
    requestRepo.manager = manager; patientRepo.manager = manager;
    access = { resolveAccessiblePatient: jest.fn().mockResolvedValue(dependant) };
    subject = new FastTrackService(requestRepo, patientRepo, {} as any, access);
    jest.spyOn(subject as any, 'getMapped').mockResolvedValue({ reference: 'SC-FT-ABCDEF0123456789' });
  });

  it('preserves SELF creation when participantPatientReference is omitted', async () => {
    await subject.createExternal(user, dto);
    expect(patientRepo.findOne).toHaveBeenCalledWith({ where: { userId: user.id }, withDeleted: true });
    expect(access.resolveAccessiblePatient).not.toHaveBeenCalled();
    expect(requestRepo.create).toHaveBeenCalledWith(expect.objectContaining({ userId: user.id, patientId: self.id }));
  });

  it('creates an external FastTrack for an authorized accountless dependant', async () => {
    await subject.createExternal(user, { ...dto, participantPatientReference: dependant.patientReference });
    expect(access.resolveAccessiblePatient).toHaveBeenCalledWith(user.id, dependant.patientReference);
    expect(requestRepo.create).toHaveBeenCalledWith(expect.objectContaining({ userId: user.id, patientId: dependant.id }));
    expect(dependant).toMatchObject({ userId: null, email: null, phone: null });
  });

  it('propagates the PatientAccessService anti-enumeration denial without persistence', async () => {
    access.resolveAccessiblePatient.mockRejectedValue(new NotFoundException('Patient was not found'));
    await expect(subject.createExternal(user, { ...dto, participantPatientReference: 'SCP-NONE-0001' })).rejects.toBeInstanceOf(NotFoundException);
    expect(requestRepo.save).not.toHaveBeenCalled();
  });

  it('inherits the participant from an owned accepted Care Request', async () => {
    careRepo.findOne.mockResolvedValue({ id: 'care-id', reference: 'SC-CARE-ABC', userId: user.id, patientId: dependant.id, status: CareRequestStatus.PROVIDER_ACCEPTED, assignedProviderId: 'provider-id', assignedProviderCareServiceId: 'offering-id', careServiceDefinitionId: 'definition-id' });
    offeringRepo.findOne.mockResolvedValue({ ...await offeringRepo.findOne(), provider: { status: 'ACTIVE', onboardingStatus: 'APPROVED', deletedAt: null }, definition: { isActive: true } });
    await subject.createForCareRequest(user, 'SC-CARE-ABC');
    expect(careRepo.findOne).toHaveBeenCalledWith({ where: { reference: 'SC-CARE-ABC', userId: user.id }, lock: { mode: 'pessimistic_write' } });
    expect(requestRepo.create).toHaveBeenCalledWith(expect.objectContaining({ userId: user.id, patientId: dependant.id, careRequestId: 'care-id' }));
  });

  it('lists patient-facing requests by requester ownership rather than participant account linkage', async () => {
    const builder: any = { where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(), addOrderBy: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), take: jest.fn().mockReturnThis(), getManyAndCount: jest.fn().mockResolvedValue([[], 0]) };
    jest.spyOn(subject as any, 'readBuilder').mockReturnValue(builder);
    await subject.listMine(user, { page: 1, limit: 20 });
    expect(builder.where).toHaveBeenCalledWith('fasttrack.userId = :userId', { userId: user.id });
  });

  it('scopes cancellation to the creating guardian rather than any guardian of the participant', async () => {
    requestRepo.findOne.mockResolvedValue(null);
    await expect(subject.cancelMine({ id: 'other-guardian' } as any, 'SC-FT-ABCDEF0123456789')).rejects.toBeInstanceOf(NotFoundException);
    expect(requestRepo.findOne).toHaveBeenCalledWith({ where: { reference: 'SC-FT-ABCDEF0123456789', userId: 'other-guardian' }, lock: { mode: 'pessimistic_write' } });
  });

  it('projects safe participant identity without an internal Patient ID', () => {
    const mapped = (subject as any).map({ reference: 'SC-FT-ABC', source: 'EXTERNAL_APPOINTMENT', status: 'VERIFYING', patient: { ...dependant, givenName: 'Aisha', familyName: 'Okafor' }, provider: { providerReference: dto.providerReference, displayName: 'Primed Diagnostics', providerType: 'HOSPITAL' }, careServiceDefinition: { code: dto.serviceCode, name: 'General consultation' }, careRequest: null, externalAppointmentReference: dto.externalAppointmentReference, appointmentDate: dto.appointmentDate, appointmentTime: null, department: null, doctorName: null, notes: null, feeMinor: '500000', currency: 'NGN', verifiedAt: null, paidAt: null, confirmedAt: null, createdAt: new Date(), updatedAt: new Date() });
    expect(mapped.participant).toEqual({ patientReference: dependant.patientReference, firstName: 'Aisha', lastName: 'Okafor', displayName: 'Aisha Okafor' });
    expect(mapped.participant).not.toHaveProperty('id');
  });
});
