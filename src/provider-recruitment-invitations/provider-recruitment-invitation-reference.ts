import { randomBytes } from 'node:crypto';

export const PROVIDER_RECRUITMENT_INVITATION_REFERENCE_PATTERN = /^SCPI-[A-F0-9]{12}$/;
export const generateProviderRecruitmentInvitationReference = (): string =>
  `SCPI-${randomBytes(6).toString('hex').toUpperCase()}`;
