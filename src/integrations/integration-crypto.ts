import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

/** API keys look like sck_<8 hex>_<43 base64url>. The prefix is public; the whole key is only ever hashed. */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const prefix = `sck_${randomBytes(4).toString('hex')}`;
  const key = `${prefix}_${randomBytes(32).toString('base64url')}`;
  return { key, prefix, hash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function apiKeyPrefix(key: string): string | null {
  const match = /^(sck_[0-9a-f]{8})_[A-Za-z0-9_-]{43}$/.exec(key);
  return match ? match[1] : null;
}

export function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString('base64url')}`;
}

/** Stripe-style signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">. */
export function signWebhook(secret: string, body: string, timestampSeconds: number): string {
  const signature = createHmac('sha256', secret).update(`${timestampSeconds}.${body}`).digest('hex');
  return `t=${timestampSeconds},v1=${signature}`;
}

const AAD = Buffer.from('provider-webhook-secret:v1');

function deriveKey(masterBase64: string): Buffer {
  const master = Buffer.from(masterBase64, 'base64');
  if (master.length !== 32) throw new Error('INTEGRATION_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
  return Buffer.from(hkdfSync('sha256', master, Buffer.from('smartclinic-integrations'), Buffer.from('webhook-secret-v1'), 32));
}

export function encryptSecret(masterBase64: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(masterBase64), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64') };
}

export function decryptSecret(masterBase64: string, ciphertext: string, iv: string, authTag: string): string {
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(masterBase64), Buffer.from(iv, 'base64'));
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

/**
 * Webhook targets must be public https endpoints. Blocks plain http, odd
 * ports, credentials in the URL, and literal localhost/private/link-local
 * addresses. (Names that resolve to private addresses are not checked here.)
 */
export function isAllowedWebhookUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  if (url.port && url.port !== '443') return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return false;
  }
  if (host.includes(':')) return false; // IPv6 literals: refuse rather than classify.
  return host.includes('.');
}
