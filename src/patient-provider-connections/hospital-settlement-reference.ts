import { createHash } from 'crypto';

export function hospitalSettlementReference(connectionReference: string, itemIds: string[]): string {
  const fingerprint = createHash('sha256').update([...itemIds].sort().join('|')).digest('hex').slice(0, 24);
  const reference = `HSP-${connectionReference}-${fingerprint}`;
  if (reference.length > 100) throw new Error('Hospital settlement reference is too long');
  return reference;
}
