import * as webPush from 'web-push';

import { PushDeliveryError, PushSendOutcome } from './push-provider';
import { isAllowedPushEndpoint, parseWebPushToken, RoutingPushProvider, WEB_PUSH_BODY, WebPushProvider, webPushToken } from './web-push.provider';

jest.mock('web-push', () => ({ sendNotification: jest.fn() }));

const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', keys: { p256dh: 'p-key', auth: 'a-key' } };
const configured = { notifications: { push: { webPush: { publicKey: 'public', privateKey: 'private', subject: 'mailto:support@example.com' } } } } as any;

describe('WebPushProvider', () => {
  const send = webPush.sendNotification as jest.Mock;
  beforeEach(() => send.mockReset());

  it('is disabled without VAPID keys and never sends', async () => {
    const provider = new WebPushProvider({ notifications: { push: { webPush: {} } } } as any);
    expect(provider.enabled).toBe(false);
    expect(provider.publicKey).toBeNull();
    await expect(provider.send({ token: webPushToken(subscription), notification: { title: 'T', body: 'B' }, data: {} })).resolves.toBe(PushSendOutcome.RETRYABLE_FAILURE);
    expect(send).not.toHaveBeenCalled();
  });

  it('sends the title with a generic body, never the message itself', async () => {
    send.mockResolvedValue({ statusCode: 201 });
    const provider = new WebPushProvider(configured);
    await expect(provider.send({
      token: webPushToken(subscription),
      notification: { title: 'Your results are ready', body: 'Your HbA1c result is 9.1%' },
      data: { notificationReference: 'NTF-1' },
    })).resolves.toBe(PushSendOutcome.SENT);

    const [target, payload, options] = send.mock.calls[0];
    expect(target).toEqual(subscription);
    expect(JSON.parse(payload)).toEqual({ title: 'Your results are ready', body: WEB_PUSH_BODY, url: '/me/notifications', tag: 'smartclinic-NTF-1' });
    expect(payload).not.toContain('HbA1c');
    expect(options.vapidDetails).toEqual({ publicKey: 'public', privateKey: 'private', subject: 'mailto:support@example.com' });
  });

  it('treats expired subscriptions as invalid tokens and other failures as retryable', async () => {
    const provider = new WebPushProvider(configured);
    const message = { token: webPushToken(subscription), notification: { title: 'T', body: 'B' }, data: {} };
    send.mockRejectedValueOnce({ statusCode: 410 });
    await expect(provider.send(message)).rejects.toMatchObject({ outcome: PushSendOutcome.INVALID_TOKEN });
    send.mockRejectedValueOnce({ statusCode: 500 });
    await expect(provider.send(message)).rejects.toMatchObject({ outcome: PushSendOutcome.RETRYABLE_FAILURE });
  });

  it('refuses stored subscriptions that point outside known push services', async () => {
    const provider = new WebPushProvider(configured);
    const token = webPushToken({ ...subscription, endpoint: 'https://internal.example.com/hook' });
    await expect(provider.send({ token, notification: { title: 'T', body: 'B' }, data: {} })).rejects.toBeInstanceOf(PushDeliveryError);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('web push helpers', () => {
  it('allows only https endpoints on browser push services', () => {
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/x')).toBe(true);
    expect(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
    expect(isAllowedPushEndpoint('https://web.push.apple.com/x')).toBe(true);
    expect(isAllowedPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x')).toBe(true);
    expect(isAllowedPushEndpoint('http://fcm.googleapis.com/fcm/send/x')).toBe(false);
    expect(isAllowedPushEndpoint('https://evilfcm.googleapis.com.attacker.io/x')).toBe(false);
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com:8443/x')).toBe(false);
    expect(isAllowedPushEndpoint('https://169.254.169.254/latest')).toBe(false);
    expect(isAllowedPushEndpoint('not a url')).toBe(false);
  });

  it('round-trips the stored token and ignores native tokens', () => {
    expect(parseWebPushToken(webPushToken(subscription))).toEqual(subscription);
    expect(parseWebPushToken('fcm-native-token')).toBeNull();
    expect(parseWebPushToken('{broken')).toBeNull();
  });

  it('routes browser subscriptions to web push and native tokens to the mobile provider', async () => {
    const native = { send: jest.fn().mockResolvedValue(PushSendOutcome.SENT) };
    const web = { send: jest.fn().mockResolvedValue(PushSendOutcome.SENT) };
    const router = new RoutingPushProvider(native, web);
    await router.send({ token: 'native-token', notification: { title: 'T', body: 'B' }, data: {} });
    await router.send({ token: webPushToken(subscription), notification: { title: 'T', body: 'B' }, data: {} });
    expect(native.send).toHaveBeenCalledTimes(1);
    expect(web.send).toHaveBeenCalledTimes(1);
  });
});
