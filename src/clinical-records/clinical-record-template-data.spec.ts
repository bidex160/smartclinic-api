import { BadRequestException, ConflictException } from '@nestjs/common';
import { CareAppointment } from '../care-appointments/entities/care-appointment.entity';
import { CareServiceDefinition } from '../providers/entities/care-service-definition.entity';
import { ProviderCareServiceClinicalTemplate } from '../providers/entities/provider-care-service-clinical-template.entity';
import { ProviderCareService } from '../providers/entities/provider-care-service.entity';
import { ClinicalDocumentationSnapshotSource, ClinicalTemplateFieldType, genericTemplate } from './clinical-documentation-template';
import { ClinicalRecordsService } from './clinical-records.service';
import { ClinicalConsultationDetail } from './entities/clinical-consultation-detail.entity';
import { ClinicalRecord } from './entities/clinical-record.entity';
import { ClinicalRecordStatus } from './enums/clinical-record-status.enum';
import { ClinicalRecordType } from './enums/clinical-record-type.enum';

describe('ClinicalRecordsService template snapshots and structured data', () => {
  const provider = { id: 'provider-id' };
  const user: any = { id: 'provider-user' };
  const appointment: any = { id: 'appointment-id', reference: 'SC-APT-ABC', patientId: 'patient-id', providerId: provider.id, providerCareServiceId: 'offering-id', scheduledDate: '2026-08-30', scheduledTimeFrom: '09:00', timezone: 'Africa/Lagos', careRequest: { id: 'care-id', assignedProviderId: provider.id, careServiceDefinitionId: 'definition-id' } };
  let record: any;
  let recordRepo: any;
  let templateRepo: any;
  let definitionRepo: any;
  let offeringRepo: any;
  let manager: any;
  let service: ClinicalRecordsService;

  beforeEach(() => {
    record = { id: 'record-id', reference: 'SC-CLR-ABC', patientId: appointment.patientId, providerId: provider.id, careAppointmentId: appointment.id, recordType: ClinicalRecordType.IMAGING_RESULT, status: ClinicalRecordStatus.DRAFT, documentationTemplateSnapshot: null, structuredData: null, finalizedAt: null };
    recordRepo = { findOne: jest.fn().mockResolvedValue(record), create: jest.fn((value) => ({ ...record, ...value })), save: jest.fn(async (value) => Object.assign(record, value)), exists: jest.fn().mockResolvedValue(false), createQueryBuilder: jest.fn() };
    templateRepo = { findOne: jest.fn().mockResolvedValue(null) };
    definitionRepo = { findOne: jest.fn().mockResolvedValue({ id: 'definition-id', name: 'Chest Imaging', clinicalRecordType: ClinicalRecordType.IMAGING_RESULT }) };
    offeringRepo = { findOne: jest.fn().mockImplementation(async () => ({ id: 'offering-id', providerId: provider.id, definition: await definitionRepo.findOne() })) };
    const appointmentRepo = { findOne: jest.fn().mockResolvedValue(appointment) };
    const consultationRepo = { create: jest.fn((value) => value), save: jest.fn(), findOne: jest.fn(), delete: jest.fn() };
    manager = { query: jest.fn().mockResolvedValue([{ occurred_at: new Date('2026-08-30T08:00:00Z') }]), transaction: jest.fn(async (work) => work(manager)), getRepository: jest.fn((entity) => entity === ClinicalRecord ? recordRepo : entity === CareAppointment ? appointmentRepo : entity === CareServiceDefinition ? definitionRepo : entity === ProviderCareService ? offeringRepo : entity === ProviderCareServiceClinicalTemplate ? templateRepo : entity === ClinicalConsultationDetail ? consultationRepo : {}) };
    service = new ClinicalRecordsService({ manager } as any, {} as any, { resolveOperational: jest.fn().mockResolvedValue(provider) } as any);
    jest.spyOn(service as any, 'lockedOwnedRecord').mockResolvedValue(record);
    jest.spyOn(service as any, 'getMapped').mockImplementation(async () => ({ reference: record.reference, documentation: record.documentationTemplateSnapshot, structuredData: record.structuredData, status: record.status }));
  });

  it.each([ClinicalRecordType.LAB_RESULT, ClinicalRecordType.IMAGING_RESULT, ClinicalRecordType.PROCEDURE, ClinicalRecordType.PHARMACY, ClinicalRecordType.FOLLOW_UP, ClinicalRecordType.OTHER])('snapshots the generic %s template when no custom template exists', async (type) => {
    definitionRepo.findOne.mockResolvedValue({ id: 'definition-id', name: type, clinicalRecordType: type });
    recordRepo.findOne.mockResolvedValueOnce(null);
    const created = await service.ensureDraftForStartedAppointment(manager, appointment, appointment.careRequest, user.id);
    expect(created!.documentationTemplateSnapshot).toMatchObject({ schemaVersion: 1, source: ClinicalDocumentationSnapshotSource.SYSTEM_DEFAULT, providerTemplateVersion: null });
    expect(created!.documentationTemplateSnapshot!.fields.map((field: any) => field.key)).toEqual(genericTemplate(type).map((field) => field.key));
    expect(created!.structuredData).toBeNull();
  });

  it('keeps record A on custom v1 while record B snapshots v2', async () => {
    const v1 = { version: 1, fields: genericTemplate(ClinicalRecordType.IMAGING_RESULT), recordType: ClinicalRecordType.IMAGING_RESULT };
    const v2 = { version: 2, fields: [...genericTemplate(ClinicalRecordType.IMAGING_RESULT), { key: 'contrastUsed', label: 'Contrast used', type: ClinicalTemplateFieldType.BOOLEAN, required: false, core: false, sortOrder: 20 }], recordType: ClinicalRecordType.IMAGING_RESULT };
    templateRepo.findOne.mockResolvedValueOnce(v1).mockResolvedValueOnce(v2);
    recordRepo.findOne.mockResolvedValue(null);
    const recordA = await service.ensureDraftForStartedAppointment(manager, { ...appointment, id: 'appointment-a' }, appointment.careRequest, user.id);
    record = { ...record, id: 'record-b', careAppointmentId: 'appointment-b', documentationTemplateSnapshot: null };
    const recordB = await service.ensureDraftForStartedAppointment(manager, { ...appointment, id: 'appointment-b' }, appointment.careRequest, user.id);
    expect(recordA!.documentationTemplateSnapshot!.providerTemplateVersion).toBe(1);
    expect(recordA!.documentationTemplateSnapshot!.fields).toHaveLength(5);
    expect(recordB!.documentationTemplateSnapshot!.providerTemplateVersion).toBe(2);
    expect(recordB!.documentationTemplateSnapshot!.fields).toHaveLength(6);
  });

  it('allows incomplete draft progress, rejects invalid keys/types, and validates completion', async () => {
    record.documentationTemplateSnapshot = { schemaVersion: 1, source: ClinicalDocumentationSnapshotSource.SYSTEM_DEFAULT, providerTemplateVersion: null, fields: genericTemplate(ClinicalRecordType.IMAGING_RESULT) };
    await service.updateForAppointment(user, appointment.reference, { structuredData: { study: 'Chest X-Ray', findings: 'Clear' } });
    expect(record.structuredData).toEqual({ study: 'Chest X-Ray', findings: 'Clear' });
    await expect(service.updateForAppointment(user, appointment.reference, { structuredData: { unknown: 'x' } })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateForAppointment(user, appointment.reference, { structuredData: { study: false } })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.finalizeForAppointment(user, appointment.reference)).rejects.toBeInstanceOf(ConflictException);
    record.structuredData.impression = 'No acute abnormality';
    await service.finalizeForAppointment(user, appointment.reference);
    expect(record.status).toBe(ClinicalRecordStatus.FINALIZED);
  });

  it('does not let attachments substitute for required structured documentation', async () => {
    record.documentationTemplateSnapshot = { schemaVersion: 1, source: ClinicalDocumentationSnapshotSource.SYSTEM_DEFAULT, providerTemplateVersion: null, fields: genericTemplate(ClinicalRecordType.IMAGING_RESULT) };
    record.attachments = [{ reference: 'SC-CLA-ATTACHMENT' }];
    record.structuredData = { study: 'Chest X-Ray' };
    await expect(service.finalizeForAppointment(user, appointment.reference)).rejects.toThrow('findings, impression');
  });

  it('attaches a snapshot to legacy DRAFT records but never invents one for FINALIZED history', async () => {
    await (service as any).attachSnapshotIfMissing(manager, record);
    expect(record.documentationTemplateSnapshot).toMatchObject({ source: ClinicalDocumentationSnapshotSource.SYSTEM_DEFAULT });
    record.documentationTemplateSnapshot = null;
    record.status = ClinicalRecordStatus.FINALIZED;
    await (service as any).attachSnapshotIfMissing(manager, record);
    expect(record.documentationTemplateSnapshot).toBeNull();
  });

  it('keeps consultation on the strongly typed detail contract', async () => {
    record.recordType = ClinicalRecordType.CONSULTATION;
    await expect(service.updateForAppointment(user, appointment.reference, { structuredData: { diagnosis: 'No' } })).rejects.toThrow('Structured data is only valid');
  });

  it('projects immutable documentation and values without internal template or patient identifiers', () => {
    record.documentationTemplateSnapshot = { schemaVersion: 1, source: ClinicalDocumentationSnapshotSource.PROVIDER_CUSTOM, providerTemplateVersion: 3, fields: genericTemplate(ClinicalRecordType.IMAGING_RESULT) };
    record.structuredData = { study: 'Chest X-Ray', findings: 'Clear', impression: 'Normal' };
    const projected = (service as any).map({ ...record, provider: { providerReference: 'SCPR-ABC', displayName: 'Imaging Centre', providerType: 'CLINIC' }, careRequest: null, careAppointment: null, careServiceDefinition: null, consultation: null, attachments: [], createdAt: new Date(), updatedAt: new Date() });
    expect(projected.documentation).toMatchObject({ source: ClinicalDocumentationSnapshotSource.PROVIDER_CUSTOM, providerTemplateVersion: 3 });
    expect(projected.structuredData).toEqual(record.structuredData);
    expect(projected).not.toHaveProperty('patientId');
    expect(projected.documentation).not.toHaveProperty('templateId');
    expect(JSON.stringify(projected)).not.toContain('offering-id');
  });
});
