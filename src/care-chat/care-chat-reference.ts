import { randomUUID } from 'node:crypto';

export const CARE_CONVERSATION_REFERENCE_PATTERN = /^SC-CHAT-[A-F0-9]{12}$/;
export const CARE_CONVERSATION_REFERENCE_EXAMPLE = 'SC-CHAT-ABCDEF123456';
export const CARE_MESSAGE_REFERENCE_PATTERN = /^SC-MSG-[A-F0-9]{12}$/;
export const CARE_MESSAGE_REFERENCE_EXAMPLE = 'SC-MSG-ABCDEF123456';
export const generateCareConversationReference = () => `SC-CHAT-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
export const generateCareMessageReference = () => `SC-MSG-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
