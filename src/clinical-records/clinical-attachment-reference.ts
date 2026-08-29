import { randomUUID } from 'node:crypto';

export const CLINICAL_ATTACHMENT_REFERENCE_PATTERN = /^SC-CLA-[A-F0-9]{12}$/;
export const CLINICAL_ATTACHMENT_REFERENCE_EXAMPLE = 'SC-CLA-A1B2C3D4E5F6';
export const generateClinicalAttachmentReference = () => `SC-CLA-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
