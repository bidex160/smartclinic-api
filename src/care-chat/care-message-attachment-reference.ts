import { randomUUID } from 'node:crypto';
export const CARE_MESSAGE_ATTACHMENT_REFERENCE_PATTERN = /^SC-CMA-[A-F0-9]{12}$/;
export const CARE_MESSAGE_ATTACHMENT_REFERENCE_EXAMPLE = 'SC-CMA-A1B2C3D4E5F6';
export const generateCareMessageAttachmentReference = () => `SC-CMA-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
