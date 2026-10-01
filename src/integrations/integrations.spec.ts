import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';

import { ProviderOnboardingStatus } from '../providers/enums/provider-onboarding-status.enum';
import { ProviderStatus } from '../providers/enums/provider-status.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { ApiKeyGuard } from './api-key.guard';
import {
  apiKeyPrefix,
  decryptSecret,
  encryptSecret,
  generateApiKey,
  generateWebhookSecret,
  hashApiKey,
  isAllowedWebhookUrl,
  sameHash,
  signWebhook,
} from './integration-crypto';
import { ProviderApiKeysService } from './provider-api-keys.service';
import { WebhookDeliveryStatus } from './provider-webhook-delivery.entity';
import { ProviderWebhooksService } from './provider-webhooks.service';

const MASTER = randomBytes(32).toString('base64');

describe('integration crypto', () => {
  it('makes API keys whose prefix is public and whose hash matches', () => {
    const { key, prefix, hash } = generateApiKey();
    expect(key).toMatch(/^sck_[0-9a-f]{8}_[A-Za-z0-9_-]{43}$/);
    expect(apiKeyPrefix(key)).toBe(prefix);
    expect(sameHash(hash, hashApiKey(key))).toBe(true);
    expect(sameHash(hash, hashApiKey(`${key}x`))).toBe(false);
    expect(apiKeyPrefix('sck_nothex_abc')).toBeNull();
  });

  it('round-trips webhook secrets and refuses a different master key', () => {
    const secret = generateWebhookSecret();
    const sealed = encryptSecret(MASTER, secret);
    expect(sealed.ciphertext).not.toContain(secret);
    expect(decryptSecret(MASTER, sealed.ciphertext, sealed.iv, sealed.authTag)).toBe(secret);
    expect(() => decryptSecret(randomBytes(32).toString('base64'), sealed.ciphertext, sealed.iv, sealed.authTag)).toThrow();
    expect(() => encryptSecret(randomBytes(16).toString('base64'), secret)).toThrow(/32-byte/);
  });

  it('signs webhooks as t=<ts>,v1=<hmac of "t.body">', () => {
    const body = '{"type":"ping"}';
    const expected = createHmac('sha256', 'whsec_test').update(`1700000000.${body}`).digest('hex');
    expect(signWebhook('whsec_test', body, 1700000000)).toBe(`t=1700000000,v1=${expected}`);
  });

  it.each([
    ['https://emr.example.ng/hooks/smartclinic', true],
    ['https://emr.example.ng:443/x', true],
    ['http://emr.example.ng/x', false],
    ['https://emr.example.ng:8443/x', false],
    ['https://user:pw@emr.example.ng/x', false],
    ['https://localhost/x', false],
    ['https://127.0.0.1/x', false],
    ['https://10.1.2.3/x', false],
    ['https://192.168.0.5/x', false],
    ['https://172.20.0.1/x', false],
    ['https://169.254.169.254/latest', false],
    ['https://[::1]/x', false],
    ['https://intranet/x', false],
    ['not a url', false],
  ])('webhook URL %s allowed: %s', (url, allowed) => {
    expect(isAllowedWebhookUrl(url)).toBe(allowed);
  });
});

function keyRepo(row: any, owner: any) {
  return {
    findOne: jest.fn().mockResolvedValue(row),
    update: jest.fn().mockResolvedValue(undefined),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => ({ id: 'key-1', createdAt: new Date(), ...v })),
    manager: { getRepository: () => ({ findOne: jest.fn().mockResolvedValue(owner) }) },
  };
}

describe('ProviderApiKeysService', () => {
  const provider = { id: 'prov-1', userId: 'owner-1', status: ProviderStatus.ACTIVE, onboardingStatus: ProviderOnboardingStatus.APPROVED, deletedAt: null };
  const owner = { id: 'owner-1', status: UserStatus.ACTIVE, deletedAt: null };

  it('returns the full key once and stores only its hash', async () => {
    const repo = keyRepo(null, owner);
    const created = await new ProviderApiKeysService(repo as any).create('prov-1', 'user-1', ' Hospital EMR ');
    expect(created.key).toMatch(/^sck_/);
    const saved = repo.save.mock.calls[0][0];
    expect(saved.name).toBe('Hospital EMR');
    expect(saved.keyHash).toBe(hashApiKey(created.key));
    expect(JSON.stringify(saved)).not.toContain(created.key);
  });

  it('refuses an eleventh active key', async () => {
    const repo = keyRepo(null, owner);
    repo.count.mockResolvedValue(10);
    await expect(new ProviderApiKeysService(repo as any).create('prov-1', 'user-1', 'x')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('authenticates a valid key as the facility owner', async () => {
    const { key, prefix, hash } = generateApiKey();
    const repo = keyRepo({ id: 'key-1', keyPrefix: prefix, keyHash: hash, revokedAt: null, lastUsedAt: null, provider }, owner);
    const result = await new ProviderApiKeysService(repo as any).authenticate(key);
    expect(result).toEqual({ provider, owner, keyId: 'key-1' });
    expect(repo.update).toHaveBeenCalled();
  });

  it('rejects revoked, wrong and malformed keys', async () => {
    const { key, prefix, hash } = generateApiKey();
    const revoked = keyRepo({ id: 'k', keyPrefix: prefix, keyHash: hash, revokedAt: new Date(), provider }, owner);
    await expect(new ProviderApiKeysService(revoked as any).authenticate(key)).rejects.toBeInstanceOf(UnauthorizedException);
    const other = generateApiKey();
    const wrong = keyRepo({ id: 'k', keyPrefix: prefix, keyHash: other.hash, revokedAt: null, provider }, owner);
    await expect(new ProviderApiKeysService(wrong as any).authenticate(key)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(new ProviderApiKeysService(wrong as any).authenticate('hello')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects keys for a facility that is suspended or not approved', async () => {
    const { key, prefix, hash } = generateApiKey();
    for (const bad of [{ status: ProviderStatus.SUSPENDED }, { onboardingStatus: ProviderOnboardingStatus.SUBMITTED }]) {
      const repo = keyRepo({ id: 'k', keyPrefix: prefix, keyHash: hash, revokedAt: null, provider: { ...provider, ...bad } }, owner);
      await expect(new ProviderApiKeysService(repo as any).authenticate(key)).rejects.toBeInstanceOf(ForbiddenException);
    }
  });
});

describe('ApiKeyGuard', () => {
  function context(headers: Record<string, string>) {
    const request: any = { headers };
    return { request, ctx: { switchToHttp: () => ({ getRequest: () => request }) } as any };
  }

  it('accepts a Bearer key and acts as the owner', async () => {
    const keys = { authenticate: jest.fn().mockResolvedValue({ provider: { id: 'p' }, owner: { id: 'o' }, keyId: 'k' }) };
    const { request, ctx } = context({ authorization: 'Bearer sck_x' });
    await expect(new ApiKeyGuard(keys as any).canActivate(ctx)).resolves.toBe(true);
    expect(keys.authenticate).toHaveBeenCalledWith('sck_x');
    expect(request.user).toEqual({ id: 'o' });
    expect(request.integration).toEqual({ providerId: 'p', keyId: 'k' });
  });

  it('requires a key', async () => {
    const { ctx } = context({});
    await expect(new ApiKeyGuard({ authenticate: jest.fn() } as any).canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('ProviderWebhooksService', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function service(master: string | null, hook: any, delivery?: any) {
    const webhooks = {
      findOne: jest.fn().mockResolvedValue(hook),
      create: jest.fn((v) => v),
      merge: jest.fn((a, b) => Object.assign(a, b)),
      save: jest.fn(async (v) => v),
      manager: {},
    };
    const deliveries = {
      findOne: jest.fn().mockResolvedValue(delivery),
      save: jest.fn(async (v) => v),
      query: jest.fn().mockResolvedValue(delivery ? [{ id: delivery.id }] : []),
    };
    const config = { get: jest.fn().mockReturnValue(master) };
    return { svc: new ProviderWebhooksService(webhooks as any, deliveries as any, config as any), webhooks, deliveries };
  }

  it('stays off without an encryption key', async () => {
    const { svc } = service(null, null);
    expect(svc.available).toBe(false);
    await expect(svc.set('p', 'u', 'https://emr.example.ng/h')).rejects.toThrow(/not available/);
  });

  it('shows a new signing secret once and stores it encrypted', async () => {
    const { svc, webhooks } = service(MASTER, null);
    const result = await svc.set('p', 'u', 'https://emr.example.ng/h');
    expect(result.signingSecret).toMatch(/^whsec_/);
    const saved = webhooks.save.mock.calls[0][0];
    expect(JSON.stringify(saved)).not.toContain(result.signingSecret);
    expect(decryptSecret(MASTER, saved.secretCiphertext, saved.secretIv, saved.secretAuthTag)).toBe(result.signingSecret);
  });

  it('refuses private webhook URLs', async () => {
    const { svc } = service(MASTER, null);
    await expect(svc.set('p', 'u', 'https://192.168.1.10/h')).rejects.toThrow(/public https/);
  });

  it('queues events only for facilities with an active webhook', async () => {
    const { svc } = service(MASTER, null);
    const save = jest.fn();
    const manager: any = { getRepository: () => ({ findOne: jest.fn().mockResolvedValue(null), save }) };
    await svc.emit(manager, 'p', 'request.updated', { requestReference: 'CO-1' });
    expect(save).not.toHaveBeenCalled();
    const withHook: any = { getRepository: () => ({ findOne: jest.fn().mockResolvedValue({ id: 'wh-1' }), save }) };
    await svc.emit(withHook, 'p', 'request.updated', { requestReference: 'CO-1' });
    expect(save.mock.calls[0][0]).toMatchObject({ webhookId: 'wh-1', eventType: 'request.updated', status: WebhookDeliveryStatus.PENDING });
    expect(save.mock.calls[0][0].payload).toMatchObject({ type: 'request.updated', data: { requestReference: 'CO-1' } });
  });

  it('never throws from notify', async () => {
    const { svc } = service(MASTER, null);
    jest.spyOn(svc, 'emit').mockRejectedValue(new Error('relation does not exist'));
    expect(() => svc.notify('p', 'request.updated', {})).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('delivers a signed event and retries with backoff on failure', async () => {
    const secret = 'whsec_known';
    const sealed = encryptSecret(MASTER, secret);
    const hook = { isActive: true, url: 'https://emr.example.ng/h', secretCiphertext: sealed.ciphertext, secretIv: sealed.iv, secretAuthTag: sealed.authTag };
    const delivery: any = { id: 'd-1', status: WebhookDeliveryStatus.PENDING, eventType: 'ping', payload: { type: 'ping' }, attemptCount: 0, webhook: hook };
    const { svc, deliveries } = service(MASTER, hook, delivery);

    global.fetch = jest.fn().mockResolvedValue({ status: 500 }) as any;
    await svc.dispatchDue();
    expect(delivery.status).toBe(WebhookDeliveryStatus.PENDING);
    expect(delivery.attemptCount).toBe(1);
    expect(delivery.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    global.fetch = jest.fn().mockResolvedValue({ status: 204 }) as any;
    await svc.dispatchDue();
    expect(delivery.status).toBe(WebhookDeliveryStatus.DELIVERED);
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = init.body as string;
    const [t, v1] = init.headers['x-smartclinic-signature'].split(',').map((part: string) => part.split('=')[1]);
    expect(v1).toBe(createHmac('sha256', secret).update(`${t}.${body}`).digest('hex'));
    expect(init.redirect).toBe('manual');
    expect(deliveries.save).toHaveBeenCalled();
  });

  it('gives up after the last attempt', async () => {
    const sealed = encryptSecret(MASTER, 'whsec_x');
    const hook = { isActive: true, url: 'https://emr.example.ng/h', secretCiphertext: sealed.ciphertext, secretIv: sealed.iv, secretAuthTag: sealed.authTag };
    const delivery: any = { id: 'd-1', status: WebhookDeliveryStatus.PENDING, eventType: 'ping', payload: {}, attemptCount: 7, webhook: hook };
    const { svc } = service(MASTER, hook, delivery);
    global.fetch = jest.fn().mockRejectedValue(new Error('timeout')) as any;
    await svc.dispatchDue();
    expect(delivery.status).toBe(WebhookDeliveryStatus.FAILED);
    expect(delivery.nextAttemptAt).toBeNull();
  });
});
