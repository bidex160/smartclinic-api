import { ClinicalAttachmentResourceType } from '../enums/clinical-attachment-resource-type.enum';

export const CLINICAL_ATTACHMENT_STORAGE = Symbol('CLINICAL_ATTACHMENT_STORAGE');

export interface ClinicalAttachmentUpload {
  buffer: Buffer;
  mimeType: string;
  resourceType: ClinicalAttachmentResourceType;
}

export interface StoredClinicalAttachment {
  publicId: string;
  storageResourceType: string;
  version: string | null;
  format: string | null;
}

export interface ClinicalAttachmentStorage {
  upload(file: ClinicalAttachmentUpload): Promise<StoredClinicalAttachment>;
  delete(file: StoredClinicalAttachment): Promise<void>;
  createAccessUrl(file: StoredClinicalAttachment, expiresAt: Date): Promise<string>;
}
