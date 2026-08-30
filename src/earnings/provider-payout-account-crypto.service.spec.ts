import { ConfigService } from '@nestjs/config';
import { ProviderPayoutAccountCryptoService } from './provider-payout-account-crypto.service';
describe('ProviderPayoutAccountCryptoService', () => {
  const key = Buffer.alloc(32, 7).toString('base64'); const service = new ProviderPayoutAccountCryptoService({ get: jest.fn().mockReturnValue(key) } as unknown as ConfigService);
  it('uses randomized authenticated encryption and stable non-reversible fingerprints', () => { const first = service.protect('0123 456-789'); const second = service.protect('0123456789'); expect(first.encryptedAccountNumber).not.toBe('0123456789'); expect(first.encryptedAccountNumber).not.toBe(second.encryptedAccountNumber); expect(first.accountFingerprint).toBe(second.accountFingerprint); expect(first.accountFingerprint).not.toContain('0123456789'); expect(first.accountNumberLast4).toBe('6789'); expect(service.reveal(first.encryptedAccountNumber, first.encryptionIv, first.encryptionAuthTag)).toBe('0123456789'); });
});
