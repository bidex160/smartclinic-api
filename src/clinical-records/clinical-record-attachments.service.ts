import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Patient } from '../patients/entities/patient.entity';
import { PatientStatus } from '../patients/enums/patient-status.enum';
import { CurrentProviderService } from '../providers/current-provider.service';
import { User } from '../users/entities/user.entity';
import { createAppConfiguration } from '../config/environment';
import { UploadedPrivateFile, validatePrivateAttachmentFile } from '../common/storage/private-attachment-file';
import { PRIVATE_ATTACHMENT_STORAGE, PrivateAttachmentStorage, StoredPrivateAttachment } from '../common/storage/private-attachment-storage';
import { generateClinicalAttachmentReference } from './clinical-attachment-reference';
import { ClinicalRecordAttachment } from './entities/clinical-record-attachment.entity';
import { ClinicalRecord } from './entities/clinical-record.entity';
import { ClinicalAttachmentResourceType } from './enums/clinical-attachment-resource-type.enum';
import { ClinicalAttachmentStorageProvider } from './enums/clinical-attachment-storage-provider.enum';
import { ClinicalRecordStatus } from './enums/clinical-record-status.enum';
export type UploadedClinicalFile = UploadedPrivateFile;
const MAX_ATTACHMENTS = 5;

@Injectable()
export class ClinicalRecordAttachmentsService {
  constructor(
    @InjectRepository(ClinicalRecordAttachment) private readonly attachments: Repository<ClinicalRecordAttachment>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    private readonly currentProvider: CurrentProviderService,
    @Inject(PRIVATE_ATTACHMENT_STORAGE) private readonly storage: PrivateAttachmentStorage,
  ) {}

  async upload(user: User, recordReference: string, file?: UploadedClinicalFile) {
    const provider = await this.currentProvider.resolveOperational(user);
    const checked = this.validateFile(file);
    let stored: StoredPrivateAttachment | null = null;
    try {
      return await this.attachments.manager.transaction(async (manager) => {
        const record = await this.providerRecord(manager, recordReference, provider.id, 'pessimistic_write');
        if (record.status !== ClinicalRecordStatus.DRAFT) throw new ConflictException('Finalized clinical records cannot receive attachments');
        const count = await manager.getRepository(ClinicalRecordAttachment).count({ where: { clinicalRecordId: record.id } });
        if (count >= MAX_ATTACHMENTS) throw new ConflictException(`Clinical records support at most ${MAX_ATTACHMENTS} attachments`);
        stored = await this.storage.upload({ buffer: checked.buffer, mimeType: checked.mimeType, resourceType: checked.resourceType, namespace: 'clinical-records' });
        const repository = manager.getRepository(ClinicalRecordAttachment);
        const attachment = await repository.save(repository.create({ reference: generateClinicalAttachmentReference(), clinicalRecordId: record.id, uploadedByUserId: user.id, originalName: checked.originalName, mimeType: checked.mimeType, sizeBytes: checked.size, resourceType: checked.resourceType as unknown as ClinicalAttachmentResourceType, storageProvider: ClinicalAttachmentStorageProvider.CLOUDINARY, storagePublicId: stored.publicId, storageResourceType: stored.storageResourceType, storageVersion: stored.version, storageFormat: stored.format }));
        return this.map(attachment);
      });
    } catch (error) {
      if (stored) await Promise.resolve(this.storage.delete(stored)).catch(() => undefined);
      throw error;
    }
  }

  async delete(user: User, recordReference: string, attachmentReference: string) {
    const provider = await this.currentProvider.resolveOperational(user);
    return this.attachments.manager.transaction(async (manager) => {
      const record = await this.providerRecord(manager, recordReference, provider.id, 'pessimistic_write');
      if (record.status !== ClinicalRecordStatus.DRAFT) throw new ConflictException('Finalized clinical record attachments are immutable');
      const repository = manager.getRepository(ClinicalRecordAttachment);
      const attachment = await repository.findOne({ where: { reference: attachmentReference, clinicalRecordId: record.id }, lock: { mode: 'pessimistic_write' } });
      if (!attachment) this.notFound();
      await this.storage.delete(this.stored(attachment));
      await repository.remove(attachment);
      return { deleted: true };
    });
  }

  async providerAccess(user: User, recordReference: string, attachmentReference: string) {
    const provider = await this.currentProvider.resolveOperational(user);
    return this.attachments.manager.transaction(async (manager) => {
      const record = await this.providerRecord(manager, recordReference, provider.id, 'pessimistic_read');
      return this.access(manager, record.id, attachmentReference);
    });
  }

  async patientAccess(user: User, recordReference: string, attachmentReference: string) {
    const patient = await this.patient(user.id);
    return this.attachments.manager.transaction(async (manager) => {
      const record = await manager.getRepository(ClinicalRecord).findOne({ where: { reference: recordReference, patientId: patient.id, status: ClinicalRecordStatus.FINALIZED }, lock: { mode: 'pessimistic_read' } });
      if (!record) this.notFound();
      return this.access(manager, record.id, attachmentReference);
    });
  }

  private async access(manager: EntityManager, clinicalRecordId: string, reference: string) {
    const attachment = await manager.getRepository(ClinicalRecordAttachment).findOne({ where: { reference, clinicalRecordId } });
    if (!attachment) this.notFound();
    const expiresAt = new Date(Date.now() + createAppConfiguration().clinicalAttachments.accessTtlSeconds * 1000);
    return { url: await this.storage.createAccessUrl(this.stored(attachment), expiresAt), expiresAt };
  }

  private async providerRecord(manager: EntityManager, reference: string, providerId: string, lock: 'pessimistic_read' | 'pessimistic_write') {
    const record = await manager.getRepository(ClinicalRecord).findOne({ where: { reference, providerId }, relations: { careRequest: true }, lock: { mode: lock, tables: ['clinical_records'] } });
    if (!record || (record.careRequest && record.careRequest.assignedProviderId !== providerId)) this.notFound();
    return record;
  }

  private validateFile(file?: UploadedClinicalFile) { return validatePrivateAttachmentFile(file); }
  private stored(row: ClinicalRecordAttachment): StoredPrivateAttachment { return { publicId: row.storagePublicId, storageResourceType: row.storageResourceType, version: row.storageVersion, format: row.storageFormat }; }
  private map(row: ClinicalRecordAttachment) { return { reference: row.reference, originalName: row.originalName, mimeType: row.mimeType, sizeBytes: row.sizeBytes, resourceType: row.resourceType, createdAt: row.createdAt }; }
  private async patient(userId: string) { const patient = await this.patients.findOne({ where: { userId }, withDeleted: true }); if (!patient || patient.deletedAt || patient.status !== PatientStatus.ACTIVE) throw new NotFoundException('Patient profile was not found'); return patient; }
  private notFound(): never { throw new NotFoundException('Clinical Record attachment was not found'); }
}
