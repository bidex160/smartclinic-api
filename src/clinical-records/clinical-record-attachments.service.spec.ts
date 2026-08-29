import { BadRequestException, ConflictException, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { ClinicalRecordAttachmentsService } from './clinical-record-attachments.service';
import { ClinicalRecordAttachment } from './entities/clinical-record-attachment.entity';
import { ClinicalRecord } from './entities/clinical-record.entity';
import { ClinicalAttachmentResourceType } from './enums/clinical-attachment-resource-type.enum';
import { ClinicalRecordStatus } from './enums/clinical-record-status.enum';

describe('ClinicalRecordAttachmentsService', () => {
  const user: any = { id: 'provider-user' };
  const provider: any = { id: 'provider-id' };
  const patient: any = { id: 'patient-id', status: 'ACTIVE', deletedAt: null };
  let record: any; let attachment: any; let recordRepo: any; let attachmentRepo: any; let manager: any; let storage: any; let subject: ClinicalRecordAttachmentsService;
  const file = (mime = 'application/pdf', buffer = Buffer.from('%PDF-1.7')): any => ({ originalname: '../report.pdf', mimetype: mime, size: buffer.length, buffer });

  beforeEach(() => {
    record = { id: 'record-id', reference: 'SC-CLR-ABCDEF123456', providerId: provider.id, patientId: patient.id, status: ClinicalRecordStatus.DRAFT, careRequest: { assignedProviderId: provider.id } };
    attachment = { id: 'attachment-id', reference: 'SC-CLA-ABCDEF123456', clinicalRecordId: record.id, originalName: 'report.pdf', mimeType: 'application/pdf', sizeBytes: 8, resourceType: ClinicalAttachmentResourceType.DOCUMENT, storagePublicId: 'smartclinic/clinical-records/opaque', storageResourceType: 'raw', storageVersion: '1', storageFormat: 'pdf', createdAt: new Date() };
    recordRepo = { findOne: jest.fn().mockResolvedValue(record) };
    attachmentRepo = { count: jest.fn().mockResolvedValue(0), create: jest.fn((value) => ({ ...attachment, ...value })), save: jest.fn(async value => value), findOne: jest.fn().mockResolvedValue(attachment), remove: jest.fn() };
    manager = { transaction: jest.fn(async work => work(manager)), getRepository: jest.fn(entity => entity === ClinicalRecord ? recordRepo : entity === ClinicalRecordAttachment ? attachmentRepo : {}) };
    storage = { upload: jest.fn().mockResolvedValue({ publicId: attachment.storagePublicId, storageResourceType: 'raw', version: '1', format: 'pdf' }), delete: jest.fn(), createAccessUrl: jest.fn().mockResolvedValue('https://signed.example/private') };
    subject = new ClinicalRecordAttachmentsService({ manager } as any, { findOne: jest.fn().mockResolvedValue(patient) } as any, { resolveOperational: jest.fn().mockResolvedValue(provider) } as any, storage);
  });

  it('uploads an authenticated PDF to an owned DRAFT record with safe metadata', async () => {
    const result = await subject.upload(user, record.reference, file());
    expect(storage.upload).toHaveBeenCalledWith(expect.objectContaining({ mimeType: 'application/pdf', resourceType: ClinicalAttachmentResourceType.DOCUMENT }));
    expect(attachmentRepo.save).toHaveBeenCalledWith(expect.objectContaining({ clinicalRecordId: record.id, uploadedByUserId: user.id, originalName: 'report.pdf' }));
    expect(result).toEqual(expect.objectContaining({ reference: expect.stringMatching(/^SC-CLA-[A-F0-9]{12}$/), originalName: 'report.pdf' }));
    expect(result).not.toHaveProperty('storagePublicId'); expect(result).not.toHaveProperty('id');
  });

  it.each([
    ['image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0x01])],
    ['image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ['image/webp', Buffer.concat([Buffer.from('RIFF0000WEBP'), Buffer.from([1])])],
  ])('accepts supported image %s', async (mime, bytes) => {
    await subject.upload(user, record.reference, file(mime, bytes));
    expect(storage.upload).toHaveBeenCalledWith(expect.objectContaining({ resourceType: ClinicalAttachmentResourceType.IMAGE }));
  });

  it('rejects unsupported, signature-mismatched, oversized, and sixth files', async () => {
    await expect(subject.upload(user, record.reference, file('text/plain', Buffer.from('hello')))).rejects.toBeInstanceOf(BadRequestException);
    await expect(subject.upload(user, record.reference, file('application/pdf', Buffer.from('not pdf')))).rejects.toBeInstanceOf(BadRequestException);
    await expect(subject.upload(user, record.reference, { ...file(), size: 15 * 1024 * 1024 + 1 })).rejects.toBeInstanceOf(PayloadTooLargeException);
    attachmentRepo.count.mockResolvedValue(5);
    await expect(subject.upload(user, record.reference, file())).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects other-provider and FINALIZED mutation while allowing DRAFT deletion', async () => {
    recordRepo.findOne.mockResolvedValueOnce(null);
    await expect(subject.upload(user, record.reference, file())).rejects.toBeInstanceOf(NotFoundException);
    record.status = ClinicalRecordStatus.FINALIZED;
    await expect(subject.upload(user, record.reference, file())).rejects.toBeInstanceOf(ConflictException);
    await expect(subject.delete(user, record.reference, attachment.reference)).rejects.toBeInstanceOf(ConflictException);
    record.status = ClinicalRecordStatus.DRAFT;
    await expect(subject.delete(user, record.reference, attachment.reference)).resolves.toEqual({ deleted: true });
    expect(storage.delete).toHaveBeenCalled(); expect(attachmentRepo.remove).toHaveBeenCalledWith(attachment);
  });

  it('authorizes provider and finalized owning patient access only', async () => {
    await expect(subject.providerAccess(user, record.reference, attachment.reference)).resolves.toEqual(expect.objectContaining({ url: 'https://signed.example/private', expiresAt: expect.any(Date) }));
    record.status = ClinicalRecordStatus.FINALIZED;
    await expect(subject.patientAccess({ id: 'patient-user' } as any, record.reference, attachment.reference)).resolves.toEqual(expect.objectContaining({ url: 'https://signed.example/private' }));
    recordRepo.findOne.mockResolvedValueOnce(null);
    await expect(subject.patientAccess({ id: 'patient-user' } as any, record.reference, attachment.reference)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not persist on upload failure and cleans storage after database failure', async () => {
    storage.upload.mockRejectedValueOnce(new Error('storage down'));
    await expect(subject.upload(user, record.reference, file())).rejects.toThrow('storage down');
    expect(attachmentRepo.save).not.toHaveBeenCalled();
    attachmentRepo.save.mockRejectedValueOnce(new Error('database down'));
    await expect(subject.upload(user, record.reference, file())).rejects.toThrow('database down');
    expect(storage.delete).toHaveBeenCalledWith(expect.objectContaining({ publicId: attachment.storagePublicId }));
  });
});
