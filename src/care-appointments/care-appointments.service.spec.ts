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

describe('CareAppointmentsService', () => {
  const user: any = { id: 'provider-user' };
  const provider: any = { id: 'provider-id', status: 'ACTIVE', onboardingStatus: 'APPROVED', deletedAt: null };
  const care: any = { id: 'care-id', reference: 'SC-CARE-ABCDEF123456', patientId: 'patient-id', assignedProviderId: provider.id, assignedProviderCareServiceId: 'offering-id', careServiceDefinitionId: 'definition-id', status: CareRequestStatus.PROVIDER_ACCEPTED };
  const dto: any = { scheduledDate: '2099-09-10', scheduledTimeFrom: '10:30', scheduledTimeTo: '11:00', timezone: 'Africa/Lagos', providerLocationReference: 'SCPL-ABCDEF0123456789' };
  let manager: any; let appointmentRepo: any; let providerRepo: any; let careRepo: any; let offeringRepo: any; let locationRepo: any; let appointmentHistory: any; let requestHistory: any; let overlap: boolean; let subject: CareAppointmentsService;
  beforeEach(() => {
    overlap = false;
    const qb: any = {}; for (const method of ['where', 'andWhere']) qb[method] = jest.fn().mockReturnValue(qb); qb.getExists = jest.fn(async () => overlap);
    appointmentRepo = { exists: jest.fn().mockResolvedValue(false), createQueryBuilder: jest.fn().mockReturnValue(qb), create: jest.fn((value) => ({ id: 'appointment-id', ...value })), save: jest.fn(async (value) => value) };
    providerRepo = { findOne: jest.fn().mockResolvedValue(provider) };
    careRepo = { findOne: jest.fn().mockResolvedValue(care), save: jest.fn(async (value) => value) };
    offeringRepo = { findOne: jest.fn().mockResolvedValue({ id: 'offering-id', providerId: provider.id, careServiceDefinitionId: 'definition-id', isActive: true, supportsAppointmentRequests: true, definition: { isActive: true } }) };
    locationRepo = { findOne: jest.fn().mockResolvedValue({ id: 'location-id', providerId: provider.id, isActive: true, locationReference: dto.providerLocationReference }) };
    appointmentHistory = { create: jest.fn((value) => value), save: jest.fn(async (value) => value) }; requestHistory = { create: jest.fn((value) => value), save: jest.fn(async (value) => value) };
    manager = { transaction: jest.fn(async (work) => work(manager)), getRepository: jest.fn((entity) => entity === CareAppointment ? appointmentRepo : entity === Provider ? providerRepo : entity === CareRequest ? careRepo : entity === ProviderCareService ? offeringRepo : entity === ProviderLocation ? locationRepo : entity === CareAppointmentStatusHistory ? appointmentHistory : entity === CareRequestStatusHistory ? requestHistory : {}) };
    subject = new CareAppointmentsService({ manager } as any, { findOne: jest.fn() } as any, { resolve: jest.fn().mockResolvedValue(provider) } as any);
    jest.spyOn(subject as any, 'getMapped').mockImplementation(async () => ({ appointmentReference: 'SC-APT-ABCDEF123456' }));
  });

  it('atomically schedules accepted work with the exact offering and owned active location', async () => {
    await expect(subject.schedule(user, care.reference, dto)).resolves.toMatchObject({ appointmentReference: 'SC-APT-ABCDEF123456' });
    expect(appointmentRepo.save).toHaveBeenCalledWith(expect.objectContaining({ careRequestId: care.id, patientId: care.patientId, providerId: provider.id, providerCareServiceId: care.assignedProviderCareServiceId, providerLocationId: 'location-id', status: CareAppointmentStatus.SCHEDULED }));
    expect(care.status).toBe(CareRequestStatus.SCHEDULED);
    expect(appointmentHistory.save).toHaveBeenCalledWith(expect.objectContaining({ fromStatus: null, toStatus: CareAppointmentStatus.SCHEDULED }));
    expect(requestHistory.save).toHaveBeenCalledWith(expect.objectContaining({ fromStatus: CareRequestStatus.PROVIDER_ACCEPTED, toStatus: CareRequestStatus.SCHEDULED }));
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
    await subject.complete(user, 'SC-APT-ABCDEF123456');
    expect(transitionAppointment.status).toBe(CareAppointmentStatus.COMPLETED); expect(care.status).toBe(CareRequestStatus.COMPLETED);
  });
});
