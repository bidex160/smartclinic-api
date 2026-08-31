import { randomBytes } from 'node:crypto';
export const generateGuidedSelfCheckReference=()=>`SC-GSC-${randomBytes(6).toString('hex').toUpperCase()}`;

