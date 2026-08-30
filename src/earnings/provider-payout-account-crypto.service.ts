import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

@Injectable()
export class ProviderPayoutAccountCryptoService {
  constructor(private readonly config: ConfigService) {}
  protect(accountNumber: string) {
    const normalized = accountNumber.replace(/[\s-]/g, '').toUpperCase(); const master = this.masterKey();
    const encryptionKey = Buffer.from(hkdfSync('sha256', master, Buffer.from('smartclinic-payout-account'), Buffer.from('encryption-v1'), 32));
    const fingerprintKey = Buffer.from(hkdfSync('sha256', master, Buffer.from('smartclinic-payout-account'), Buffer.from('fingerprint-v1'), 32));
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv); cipher.setAAD(Buffer.from('provider-payout-account:v1'));
    const ciphertext = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
    return { encryptedAccountNumber: ciphertext.toString('base64'), encryptionIv: iv.toString('base64'), encryptionAuthTag: cipher.getAuthTag().toString('base64'), accountFingerprint: createHmac('sha256', fingerprintKey).update(normalized).digest('hex'), accountNumberLast4: normalized.slice(-4) };
  }
  reveal(encrypted: string, iv: string, authTag: string) {
    const key = Buffer.from(hkdfSync('sha256', this.masterKey(), Buffer.from('smartclinic-payout-account'), Buffer.from('encryption-v1'), 32));
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64')); decipher.setAAD(Buffer.from('provider-payout-account:v1')); decipher.setAuthTag(Buffer.from(authTag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8');
  }
  private masterKey() { const encoded = this.config.get<string>('PAYOUT_ACCOUNT_ENCRYPTION_KEY'); if (!encoded) throw new ServiceUnavailableException('Provider payout account encryption is not configured'); const key = Buffer.from(encoded, 'base64'); if (key.length !== 32) throw new ServiceUnavailableException('Provider payout account encryption is not configured correctly'); return key; }
}
