export enum PrivateAttachmentResourceType { IMAGE = 'IMAGE', DOCUMENT = 'DOCUMENT' }
export const PRIVATE_ATTACHMENT_STORAGE = Symbol('PRIVATE_ATTACHMENT_STORAGE');
export interface PrivateAttachmentUpload { buffer: Buffer; mimeType: string; resourceType: PrivateAttachmentResourceType; namespace: 'clinical-records' | 'care-chat' }
export interface StoredPrivateAttachment { publicId: string; storageResourceType: string; version: string | null; format: string | null }
export interface PrivateAttachmentStorage { upload(file: PrivateAttachmentUpload): Promise<StoredPrivateAttachment>; delete(file: StoredPrivateAttachment): Promise<void>; createAccessUrl(file: StoredPrivateAttachment, expiresAt: Date): Promise<string> }
