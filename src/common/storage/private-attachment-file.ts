import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { basename } from 'node:path';
import { PrivateAttachmentResourceType } from './private-attachment-storage';

export const MAX_PRIVATE_ATTACHMENT_SIZE = 15 * 1024 * 1024;
export interface UploadedPrivateFile { originalname: string; mimetype: string; size: number; buffer: Buffer }
export function validatePrivateAttachmentFile(file?: UploadedPrivateFile) {
  if (!file?.buffer?.length) throw new BadRequestException('file is required');
  if (file.size > MAX_PRIVATE_ATTACHMENT_SIZE) throw new PayloadTooLargeException('Attachment must not exceed 15 MB');
  const bytes = file.buffer; const mime = file.mimetype;
  const signatures: Record<string, boolean> = {
    'application/pdf': bytes.subarray(0, 5).toString('ascii') === '%PDF-',
    'image/jpeg': bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    'image/png': bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    'image/webp': bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP',
  };
  if (!(mime in signatures) || !signatures[mime]) throw new BadRequestException('Unsupported or invalid attachment file type');
  const cleaned = basename(file.originalname || 'attachment').replace(/[\x00-\x1f\x7f]/g, '').replace(/[\\/]/g, '_').trim();
  return { buffer: file.buffer, size: file.size, mimeType: mime, resourceType: mime === 'application/pdf' ? PrivateAttachmentResourceType.DOCUMENT : PrivateAttachmentResourceType.IMAGE, originalName: (cleaned || 'attachment').slice(0, 255) };
}
