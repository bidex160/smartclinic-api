import { BadRequestException, ConflictException } from '@nestjs/common';
import { CareRequestStatusHistory } from '../care-requests/entities/care-request-status-history.entity';
import { CareRequest } from '../care-requests/entities/care-request.entity';
import { CareRequestStatus } from '../care-requests/enums/care-request-status.enum';
import { Patient } from '../patients/entities/patient.entity';
import { ProviderCareService } from '../providers/entities/provider-care-service.entity';
import { ProviderLocation } from '../providers/entities/provider-location.entity';
import { Provider } from '../providers/entities/provider.entity';
import { CareAppointmentStatusHistory } from './entities/care-appointment-status-history.entity';
import { CareAppointment } from './entities/care-appointment.entity';
import { CareAppointmentStatus } from './enums/care-appointment-status.enum';
import { CareAppointmentsService } from './care-appointments.service';
import { CareDeliveryMode } from '../providers/enums/care-delivery-mode.enum';
import { CareRequestFunding } from '../care-requests/entities/care-request-funding.entity';
import { CareRequestFundingStatus } from '../care-requests/enums/care-request-funding-status.enum';
import { CareServiceDefinition } from '../providers/entities/care-service-definition.entity';
import { ClinicalRecord } from '../clinical-records/entities/clinical-record.entity';
import { ClinicalRecordStatus } from '../clinical-records/enums/clinical-record-status.enum';
import { ClinicalRecordType } from '../clinical-records/enums/clinical-record-type.enum';

describe('CareAppointmentsService', () => {
  const user: any = { id: 'provider-user' };
  const provider: any = { id: 'provider-id', status: 'ACTIVE', onboardingStatus: 'APPROVED', deletedAt: null };
  const care: any = { id: 'care-id', reference: 'SC-CARE-ABCDEF123456', patientId: 'patient-id', assignedProviderId: provider.id, assignedProviderCareServiceId: 'offering-id', careServiceDefinitionId: 'definition-id', deliveryMode: CareDeliveryMode.IN_PERSON, servicePriceMinor: '2000000', serviceCurrency: 'NGN', status: CareRequestStatus.PROVIDER_ACCEPTED };
  const dto: any = { scheduledDate: '2099-09-10', scheduledTimeFrom: '10:30', scheduledTimeTo: '11:00', timezone: 'Africa/Lagos', providerLocationReference: 'SCPL-ABCDEF0123456789' };
  let manager: any; let appointmentRepo: any; let providerRepo: any; let careRepo: any; let fundingRepo: any; let offeringRepo: any; let locationRepo: any; let definitionRepo: any; let clinicalRecordRepo: any; let appointmentHistory: any; let requestHistory: any; let overlap: boolean; let subject: CareAppointmentsService;
  beforeEach(() => {
    care.status = CareRequestStatus.PROVIDER_ACCEPTED; care.deliveryMode = CareDeliveryMode.IN_PERSON;
    overlap = false;
    const qb: any = {}; for (const method of ['where', 'andWhere']) qb[method] = jest.fn().mockReturnValue(qb); qb.getExists = jest.fn(async () => overlap);
    appointmentRepo = { exists: jest.fn().mockResolvedValue(false), createQueryBuilder: jest.fn().mockReturnValue(qb), create: jest.fn((value) => ({ id: 'appointment-id', ...value })), save: jest.fn(async (value) => value) };
    providerRepo = { findOne: jest.fn().mockResolvedValue(provider) };
    careRepo = { findOne: jest.fn().mockResolvedValue(care), save: jest.fn(async (value) => value) };
    offeringRepo = { findOne: jest.fn().mockResolvedValue({ id: 'offering-id', providerId: provider.id, careServiceDefinitionId: 'definition-id', isActive: true, supportsAppointmentRequests: true, deliveryOptions: [CareDeliveryMode.IN_PERSON, CareDeliveryMode.VIRTUAL, CareDeliveryMode.HOME_VISIT].map((deliveryMode) => ({ deliveryMode })), definition: { isActive: true } }) };
    locationRepo = { findOne: jest.fn().mockResolvedValue({ id: 'location-id', providerId: provider.id, isActive: true, locationReference: dto.providerLocationReference }) };
    appointmentHistory = { create: jest.fn((value) => value), save: jest.fn(async (value) => value) }; requestHistory = { create: jest.fn((value) => value), save: jest.fn(async (value) => value) };
    fundingRepo = { findOne: jest.fn().mockResolvedValue({ careRequestId: care.id, amountMinor: care.servicePriceMinor, currency: 'NGN', status: CareRequestFundingStatus.PAID }), save: jest.fn(async value => value) };
    definitionRepo = { findOne: jest.fn().mockResolvedValue({ id: care.careServiceDefinitionId, clinicalRecordType: null }) };
    clinicalRecordRepo = { findOne: jest.fn().mockResolvedValue(null) };
    manager = { transaction: jest.fn(async (work) => work(manager)), getRepository: jest.fn((entity) => entity === CareAppointment ? appointmentRepo : entity === Provider ? providerRepo : entity === CareRequest ? careRepo : entity === CareRequestFunding ? fundingRepo : entity === ProviderCareService ? offeringRepo : entity === ProviderLocation ? locationRepo : entity === CareServiceDefinition ? definitionRepo : entity === ClinicalRecord ? clinicalRecordRepo : entity === CareAppointmentStatusHistory ? appointmentHistory : entity === CareRequestStatusHistory ? requestHistory : {}) };
    subject = new CareAppointmentsService({ manager } as any, { findOne: jest.fn() } as any, { resolveOperational: jest.fn().mockResolvedValue(provider) } as any, { markGeneralCarePayable: jest.fn().mockResolvedValue(null) } as any, { ensureDraftForStartedAppointment: jest.fn().mockResolvedValue(null) } as any);
    jest.spyOn(subject as any, 'getMapped').mockImplementation(async () => ({ appointmentReference: 'SC-APT-ABCDEF123456' }));
  });

  it('atomically schedules accepted work with the exact offering and owned active location', async () => {
    await expect(subject.schedule(user, care.reference, dto)).resolves.toMatchObject({ appointmentReference: 'SC-APT-ABCDEF123456' });
    expect(appointmentRepo.save).toHaveBeenCalledWith(expect.objectContaining({ careRequestId: care.id, patientId: care.patientId, providerId: provider.id, providerCareServiceId: care.assignedProviderCareServiceId, providerLocationId: 'location-id', deliveryMode: CareDeliveryMode.IN_PERSON, meetingUrl: null, status: CareAppointmentStatus.SCHEDULED }));
    expect(care.status).toBe(CareRequestStatus.SCHEDULED);
    expect(appointmentHistory.save).toHaveBeenCalledWith(expect.objectContaining({ fromStatus: null, toStatus: CareAppointmentStatus.SCHEDULED }));
    expect(requestHistory.save).toHaveBeenCalledWith(expect.objectContaining({ fromStatus: CareRequestStatus.PROVIDER_ACCEPTED, toStatus: CareRequestStatus.SCHEDULED }));
  });

  it('gates paid scheduling on authoritative funding and permits explicit free satisfaction', async () => { fundingRepo.findOne.mockResolvedValueOnce({ status: CareRequestFundingStatus.PENDING }); await expect(subject.schedule(user, care.reference, dto)).rejects.toBeInstanceOf(ConflictException); care.servicePriceMinor = '0'; fundingRepo.findOne.mockResolvedValueOnce(null); await expect(subject.schedule(user, care.reference, dto)).resolves.toBeDefined(); expect(fundingRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: CareRequestFundingStatus.SATISFIED_FREE, amountMinor: '0' })); care.servicePriceMinor = '2000000'; });

  it.each([CareDeliveryMode.VIRTUAL, CareDeliveryMode.HOME_VISIT])('derives %s mode and rejects a provider location', async (deliveryMode) => {
    care.deliveryMode = deliveryMode;
    await expect(subject.schedule(user, care.reference, { ...dto, providerLocationReference: null })).resolves.toBeDefined();
    expect(appointmentRepo.save).toHaveBeenCalledWith(expect.objectContaining({ deliveryMode, providerLocationId: null }));
    care.status = CareRequestStatus.PROVIDER_ACCEPTED;
    await expect(subject.schedule(user, care.reference, dto)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('revalidates that the exact offering still supports the requested mode', async () => {
    care.deliveryMode = CareDeliveryMode.VIRTUAL;
    offeringRepo.findOne.mockResolvedValue({ id: 'offering-id', providerId: provider.id, careServiceDefinitionId: 'definition-id', isActive: true, supportsAppointmentRequests: true, deliveryOptions: [{ deliveryMode: CareDeliveryMode.IN_PERSON }], definition: { isActive: true } });
    await expect(subject.schedule(user, care.reference, { ...dto, providerLocationReference: null })).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows only the owning provider to set or clear HTTPS links on active virtual appointments', async () => {
    const appointment: any = { id: 'appointment-id', providerId: provider.id, deliveryMode: CareDeliveryMode.VIRTUAL, status: CareAppointmentStatus.SCHEDULED, meetingUrl: null };
    appointmentRepo.findOne = jest.fn().mockResolvedValue(appointment);
    await subject.updateMeetingLink(user, 'SC-APT-ABCDEF123456', 'https://meet.google.com/abc-defg-hij');
    expect(appointment.meetingUrl).toBe('https://meet.google.com/abc-defg-hij');
    await subject.updateMeetingLink(user, 'SC-APT-ABCDEF123456', null);
    expect(appointment.meetingUrl).toBeNull();
    appointmentRepo.findOne.mockResolvedValue(null);
    await expect(subject.updateMeetingLink(user, 'SC-APT-ABCDEF123456', 'https://zoom.us/j/123')).rejects.toThrow('Care Appointment was not found');
  });

  it('rejects insecure/malformed links, non-virtual appointments, and terminal lifecycle states', async () => {
    const appointment: any = { id: 'appointment-id', providerId: provider.id, deliveryMode: CareDeliveryMode.VIRTUAL, status: CareAppointmentStatus.SCHEDULED, meetingUrl: null };
    appointmentRepo.findOne = jest.fn().mockResolvedValue(appointment);
    await expect(subject.updateMeetingLink(user, 'SC-APT-ABCDEF123456', 'http://meet.example.test/room')).rejects.toBeInstanceOf(BadRequestException);
    await expect(subject.updateMeetingLink(user, 'SC-APT-ABCDEF123456', 'not-a-url')).rejects.toBeInstanceOf(BadRequestException);
    appointment.deliveryMode = CareDeliveryMode.IN_PERSON;
    await expect(subject.updateMeetingLink(user, 'SC-APT-ABCDEF123456', 'https://meet.example.test/room')).rejects.toBeInstanceOf(ConflictException);
    appointment.deliveryMode = CareDeliveryMode.VIRTUAL; appointment.status = CareAppointmentStatus.COMPLETED;
    await expect(subject.updateMeetingLink(user, 'SC-APT-ABCDEF123456', 'https://meet.example.test/room')).rejects.toBeInstanceOf(ConflictException);
  });

  it('exposes a virtual meeting URL only in authorized detail projections, never collection projections', () => {
    const row: any = { reference: 'SC-APT-ABCDEF123456', status: CareAppointmentStatus.SCHEDULED, deliveryMode: CareDeliveryMode.VIRTUAL, meetingUrl: 'https://meet.example.test/room', careRequest: { reference: care.reference }, providerCareService: { definition: { code: 'CONSULTATION', name: 'Consultation' } }, provider: { providerReference: 'SCPR-ABCDEF0123456789', displayName: 'Clinic', providerType: 'CLINIC' }, providerLocation: null, scheduledDate: '2099-09-10', scheduledTimeFrom: '10:30', scheduledTimeTo: '11:00', timezone: 'Africa/Lagos', notes: null, createdAt: new Date(), updatedAt: new Date() };
    expect((subject as any).map(row, true)).toMatchObject({ deliveryMode: CareDeliveryMode.VIRTUAL, meetingUrl: row.meetingUrl });
    expect((subject as any).map(row, false)).not.toHaveProperty('meetingUrl');
  });

  it('rejects unaccepted/cancelled requests and unrelated or inactive locations', async () => {
    care.status = CareRequestStatus.CANCELLED;
    await expect(subject.schedule(user, care.reference, dto)).rejects.toBeInstanceOf(ConflictException);
    care.status = CareRequestStatus.PROVIDER_ACCEPTED; locationRepo.findOne.mockResolvedValue(null);
    await expect(subject.schedule(user, care.reference, dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects invalid/past ranges and overlapping work while allowing adjacency', async () => {
    await expect(subject.schedule(user, care.reference, { ...dto, scheduledTimeTo: '10:00' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(subject.schedule(user, care.reference, { ...dto, scheduledDate: '2099-02-30' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(subject.schedule(user, care.reference, { ...dto, scheduledDate: '2020-01-01' })).rejects.toBeInstanceOf(BadRequestException);
    overlap = true; await expect(subject.schedule(user, care.reference, dto)).rejects.toBeInstanceOf(ConflictException);
    overlap = false; await expect(subject.schedule(user, care.reference, { ...dto, scheduledTimeFrom: '11:00', scheduledTimeTo: '11:30' })).resolves.toBeDefined();
  });

  it('uses patient/provider scoped lookups and strict lifecycle transitions', async () => {
    const transitionAppointment: any = { id: 'appointment-id', careRequestId: care.id, providerId: provider.id, patientId: 'patient-id', status: CareAppointmentStatus.SCHEDULED };
    appointmentRepo.findOne = jest.fn().mockResolvedValue(transitionAppointment); care.status = CareRequestStatus.SCHEDULED;
    await subject.start(user, 'SC-APT-ABCDEF123456');
    expect(transitionAppointment.status).toBe(CareAppointmentStatus.IN_PROGRESS); expect(care.status).toBe(CareRequestStatus.IN_PROGRESS);
    expect((subject as any).clinicalRecords.ensureDraftForStartedAppointment).toHaveBeenCalledWith(manager, transitionAppointment, care, user.id);
    await expect(subject.start(user, 'SC-APT-ABCDEF123456')).rejects.toThrow('cannot transition to IN_PROGRESS');
    expect((subject as any).clinicalRecords.ensureDraftForStartedAppointment).toHaveBeenCalledTimes(1);
    await subject.complete(user, 'SC-APT-ABCDEF123456');
    expect(transitionAppointment.status).toBe(CareAppointmentStatus.COMPLETED); expect(care.status).toBe(CareRequestStatus.COMPLETED);
    expect((subject as any).earnings.markGeneralCarePayable).toHaveBeenCalledWith(manager, care.reference, user.id);
  });

  it('gates completion on the configured finalized clinical record without changing earning authority', async () => {
    const transitionAppointment: any = { id: 'appointment-id', careRequestId: care.id, providerId: provider.id, patientId: 'patient-id', status: CareAppointmentStatus.IN_PROGRESS };
    appointmentRepo.findOne = jest.fn().mockResolvedValue(transitionAppointment); care.status = CareRequestStatus.IN_PROGRESS;
    definitionRepo.findOne.mockResolvedValue({ id: care.careServiceDefinitionId, clinicalRecordType: ClinicalRecordType.CONSULTATION });
    await expect(subject.complete(user, 'SC-APT-ABCDEF123456')).rejects.toThrow('clinical record is required');
    clinicalRecordRepo.findOne.mockResolvedValue({ recordType: ClinicalRecordType.CONSULTATION, status: ClinicalRecordStatus.DRAFT });
    await expect(subject.complete(user, 'SC-APT-ABCDEF123456')).rejects.toThrow('must be finalized');
    clinicalRecordRepo.findOne.mockResolvedValue({ recordType: ClinicalRecordType.LAB_RESULT, status: ClinicalRecordStatus.FINALIZED });
    await expect(subject.complete(user, 'SC-APT-ABCDEF123456')).rejects.toThrow('type must be CONSULTATION');
    clinicalRecordRepo.findOne.mockResolvedValue({ recordType: ClinicalRecordType.CONSULTATION, status: ClinicalRecordStatus.FINALIZED });
    await expect(subject.complete(user, 'SC-APT-ABCDEF123456')).resolves.toBeDefined();
    expect((subject as any).earnings.markGeneralCarePayable).toHaveBeenCalledTimes(1);
  });

  it('retains paid entitlement and HELD earning after cancellation/no-show without creating clinical records', async () => { const transitionAppointment: any = { id: 'appointment-id', careRequestId: care.id, providerId: provider.id, patientId: 'patient-id', status: CareAppointmentStatus.SCHEDULED }; appointmentRepo.findOne = jest.fn().mockResolvedValue(transitionAppointment); care.status = CareRequestStatus.SCHEDULED; await subject.cancelProvider(user, 'SC-APT-ABCDEF123456', 'Reschedule'); expect(care.status).toBe(CareRequestStatus.PROVIDER_ACCEPTED); expect((subject as any).earnings.markGeneralCarePayable).not.toHaveBeenCalled(); transitionAppointment.status = CareAppointmentStatus.SCHEDULED; care.status = CareRequestStatus.SCHEDULED; await subject.noShow(user, 'SC-APT-ABCDEF123456', null); expect(care.status).toBe(CareRequestStatus.PROVIDER_ACCEPTED); expect((subject as any).clinicalRecords.ensureDraftForStartedAppointment).not.toHaveBeenCalled(); });
});
