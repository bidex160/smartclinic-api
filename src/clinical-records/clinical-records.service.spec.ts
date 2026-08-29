import { ConflictException, NotFoundException } from '@nestjs/common';
import { CareAppointment } from '../care-appointments/entities/care-appointment.entity';
import { Patient } from '../patients/entities/patient.entity';
import { ClinicalRecordsService } from './clinical-records.service';
import { ClinicalConsultationDetail } from './entities/clinical-consultation-detail.entity';
import { ClinicalRecord } from './entities/clinical-record.entity';
import { ClinicalRecordStatus } from './enums/clinical-record-status.enum';
import { ClinicalRecordType } from './enums/clinical-record-type.enum';
import { CareServiceDefinition } from '../providers/entities/care-service-definition.entity';

describe('ClinicalRecordsService', () => {
  const user: any = { id: 'provider-user' };
  const provider: any = { id: 'provider-id' };
  const patient: any = { id: 'patient-id', userId: 'patient-user', status: 'ACTIVE', deletedAt: null };
  const appointment: any = { id: 'appointment-id', reference: 'SC-APT-ABCDEF123456', patientId: patient.id, providerId: provider.id, careRequestId: 'care-id', scheduledDate: '2026-08-29', scheduledTimeFrom: '09:10', timezone: 'Africa/Lagos', careRequest: { id: 'care-id', assignedProviderId: provider.id, careServiceDefinitionId: 'definition-id' } };
  let record: any; let recordRepo: any; let detailRepo: any; let appointmentRepo: any; let definitionRepo: any; let manager: any; let subject: ClinicalRecordsService;

  beforeEach(() => {
    record = { id: 'record-id', reference: 'SC-CLR-ABCDEF123456', patientId: patient.id, providerId: provider.id, careRequestId: appointment.careRequestId, careAppointmentId: appointment.id, careServiceDefinitionId: 'definition-id', recordType: ClinicalRecordType.CONSULTATION, title: 'Consultation outcome', summary: null, status: ClinicalRecordStatus.DRAFT, occurredAt: new Date('2026-08-29T08:10:00Z'), finalizedAt: null, createdByUserId: user.id };
    recordRepo = { exists: jest.fn().mockResolvedValue(false), create: jest.fn((value) => ({ ...record, ...value })), save: jest.fn(async (value) => Object.assign(record, value)), findOne: jest.fn().mockResolvedValue(record), createQueryBuilder: jest.fn() };
    detailRepo = { create: jest.fn((value) => value), save: jest.fn(async (value) => value), findOne: jest.fn().mockResolvedValue(null), delete: jest.fn() };
    appointmentRepo = { findOne: jest.fn().mockResolvedValue(appointment) };
    definitionRepo = { findOne: jest.fn().mockResolvedValue({ id: 'definition-id', name: 'General Consultation', clinicalRecordType: ClinicalRecordType.CONSULTATION }) };
    manager = { transaction: jest.fn(async (work) => work(manager)), query: jest.fn().mockResolvedValue([{ occurred_at: record.occurredAt }]), getRepository: jest.fn((entity) => entity === ClinicalRecord ? recordRepo : entity === ClinicalConsultationDetail ? detailRepo : entity === CareAppointment ? appointmentRepo : entity === CareServiceDefinition ? definitionRepo : {}) };
    subject = new ClinicalRecordsService({ manager } as any, { findOne: jest.fn().mockResolvedValue(patient) } as any, { resolveOperational: jest.fn().mockResolvedValue(provider) } as any);
    jest.spyOn(subject as any, 'getMapped').mockImplementation(async () => ({ reference: record.reference, status: record.status, recordType: record.recordType }));
  });

  it('creates one DRAFT consultation with appointment-derived ownership and occurredAt', async () => {
    await expect(subject.createForAppointment(user, appointment.reference, { recordType: ClinicalRecordType.CONSULTATION, title: 'Consultation outcome', consultation: { diagnosis: 'Assessment' } })).resolves.toMatchObject({ status: ClinicalRecordStatus.DRAFT });
    expect(recordRepo.save).toHaveBeenCalledWith(expect.objectContaining({ patientId: patient.id, providerId: provider.id, careRequestId: appointment.careRequestId, careAppointmentId: appointment.id, careServiceDefinitionId: 'definition-id', createdByUserId: user.id, occurredAt: record.occurredAt }));
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('AT TIME ZONE'), [appointment.scheduledDate, appointment.scheduledTimeFrom, appointment.timezone]);
    expect(detailRepo.save).toHaveBeenCalledWith(expect.objectContaining({ clinicalRecordId: record.id, diagnosis: 'Assessment' }));
  });

  it('rejects another provider appointment and duplicate primary records', async () => {
    appointmentRepo.findOne.mockResolvedValueOnce(null);
    await expect(subject.createForAppointment(user, appointment.reference, { recordType: ClinicalRecordType.OTHER, title: 'Outcome' })).rejects.toBeInstanceOf(NotFoundException);
    recordRepo.exists.mockResolvedValueOnce(true);
    await expect(subject.createForAppointment(user, appointment.reference, { recordType: ClinicalRecordType.OTHER, title: 'Outcome' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('auto-creates the configured DRAFT with authoritative ownership, default title, and empty consultation detail', async () => {
    recordRepo.findOne.mockResolvedValueOnce(null);
    const result = await subject.ensureDraftForStartedAppointment(manager, appointment, appointment.careRequest, user.id);
    expect(result).toMatchObject({ recordType: ClinicalRecordType.CONSULTATION, status: ClinicalRecordStatus.DRAFT, title: 'General Consultation Clinical Record', patientId: patient.id, providerId: provider.id, careRequestId: appointment.careRequestId, careAppointmentId: appointment.id, careServiceDefinitionId: 'definition-id', summary: null, createdByUserId: user.id });
    expect(detailRepo.save).toHaveBeenCalledWith(expect.objectContaining({ clinicalRecordId: record.id, presentingComplaint: null, diagnosis: null, plan: null }));
  });

  it('creates nothing when no expected type is configured and reuses an existing matching record', async () => {
    definitionRepo.findOne.mockResolvedValueOnce({ id: 'definition-id', name: 'General Consultation', clinicalRecordType: null });
    await expect(subject.ensureDraftForStartedAppointment(manager, appointment, appointment.careRequest, user.id)).resolves.toBeNull();
    expect(recordRepo.save).not.toHaveBeenCalled();
    recordRepo.findOne.mockResolvedValueOnce(record);
    await expect(subject.ensureDraftForStartedAppointment(manager, appointment, appointment.careRequest, user.id)).resolves.toBe(record);
    expect(recordRepo.save).not.toHaveBeenCalled();
  });

  it('edits DRAFT records, keeps FINALIZED records immutable, and finalizes idempotently', async () => {
    jest.spyOn(subject as any, 'lockedOwnedRecord').mockResolvedValue(record);
    await subject.updateForAppointment(user, appointment.reference, { title: 'Updated', consultation: { plan: 'Review' } });
    expect(record.title).toBe('Updated');
    record.status = ClinicalRecordStatus.FINALIZED;
    await expect(subject.updateForAppointment(user, appointment.reference, { title: 'No' })).rejects.toBeInstanceOf(ConflictException);
    record.finalizedAt = new Date(); recordRepo.save.mockClear();
    await subject.finalizeForAppointment(user, appointment.reference);
    expect(recordRepo.save).not.toHaveBeenCalled();
    record.status = ClinicalRecordStatus.DRAFT; record.finalizedAt = null;
    await subject.finalizeForAppointment(user, appointment.reference);
    expect(record.status).toBe(ClinicalRecordStatus.FINALIZED); expect(record.finalizedAt).toBeInstanceOf(Date);
  });

  it('patient reads are scoped to own FINALIZED records only', async () => {
    const qb: any = {}; for (const method of ['innerJoinAndSelect', 'leftJoinAndSelect', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'skip', 'take']) qb[method] = jest.fn().mockReturnValue(qb); qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]); qb.getOne = jest.fn().mockResolvedValue(null);
    jest.spyOn(subject as any, 'readBuilder').mockReturnValue(qb);
    await subject.listMine({ id: patient.userId } as any, { page: 1, limit: 20 });
    expect(qb.where).toHaveBeenCalledWith('record.patientId = :patientId', { patientId: patient.id });
    expect(qb.andWhere).toHaveBeenCalledWith('record.status = :status', { status: ClinicalRecordStatus.FINALIZED });
    await expect(subject.getMine({ id: patient.userId } as any, record.reference)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('projects attachment metadata without storage or internal identifiers', () => {
    const mapped = (subject as any).map({ ...record, provider: { providerReference: 'SCPR-ABC', displayName: 'Clinic', providerType: 'CLINIC' }, careRequest: null, careAppointment: null, careServiceDefinition: null, consultation: null, attachments: [{ id: 'internal', reference: 'SC-CLA-ABCDEF123456', originalName: 'report.pdf', mimeType: 'application/pdf', sizeBytes: 1024, resourceType: 'DOCUMENT', storagePublicId: 'private/object', uploadedByUserId: user.id, createdAt: new Date('2026-08-29T09:00:00Z') }], createdAt: new Date(), updatedAt: new Date() });
    expect(mapped.attachments).toEqual([{ reference: 'SC-CLA-ABCDEF123456', originalName: 'report.pdf', mimeType: 'application/pdf', sizeBytes: 1024, resourceType: 'DOCUMENT', createdAt: new Date('2026-08-29T09:00:00Z') }]);
    expect(mapped.attachments[0]).not.toHaveProperty('id'); expect(mapped.attachments[0]).not.toHaveProperty('storagePublicId'); expect(mapped.attachments[0]).not.toHaveProperty('uploadedByUserId');
  });
});
