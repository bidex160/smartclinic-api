import { CareRequestStatus } from '../care-requests/enums/care-request-status.enum';

const WRITABLE = new Set([CareRequestStatus.PROVIDER_ACCEPTED, CareRequestStatus.SCHEDULED, CareRequestStatus.IN_PROGRESS]);
const READABLE_EXISTING = new Set([...WRITABLE, CareRequestStatus.COMPLETED, CareRequestStatus.CANCELLED, CareRequestStatus.DECLINED, CareRequestStatus.UNFULFILLABLE]);

export const careChatPolicy = {
  canCreate: (status: CareRequestStatus) => WRITABLE.has(status),
  canSend: (status: CareRequestStatus) => WRITABLE.has(status),
  canReadExisting: (status: CareRequestStatus) => READABLE_EXISTING.has(status),
};
