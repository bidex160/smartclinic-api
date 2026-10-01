import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import * as webPush from 'web-push';

import { appConfig } from '../../config/app.config';
import { PushDeliveryError, PushMessage, PushProvider, PushSendOutcome } from './push-provider';

/** Push services browsers use today. Subscriptions elsewhere are refused so the API never posts to arbitrary hosts. */
const PUSH_SERVICE_HOSTS = ['fcm.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];

/** Lock screens are not private, so browser notifications never carry the message itself. */
export const WEB_PUSH_BODY = 'Open SmartClinic to see it.';

export interface WebPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

/** The stored device token for a browser: a stable JSON form of its subscription. */
export function webPushToken(subscription: WebPushSubscription): string {
  return JSON.stringify({ endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } });
}

export function parseWebPushToken(token: string): WebPushSubscription | null {
  if (!token.startsWith('{')) return null;
  try {
    const value = JSON.parse(token) as Partial<WebPushSubscription>;
    if (typeof value.endpoint !== 'string' || typeof value.keys?.p256dh !== 'string' || typeof value.keys?.auth !== 'string') return null;
    return { endpoint: value.endpoint, keys: { p256dh: value.keys.p256dh, auth: value.keys.auth } };
  } catch {
    return null;
  }
}

@Injectable()
export class WebPushProvider implements PushProvider {
  private readonly vapid: { subject: string; publicKey: string; privateKey: string } | null;

  constructor(@Inject(appConfig.KEY) config: ConfigType<typeof appConfig>) {
    const { publicKey, privateKey, subject } = config.notifications.push.webPush ?? {};
    this.vapid = publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
  }

  get enabled(): boolean {
    return this.vapid !== null;
  }

  get publicKey(): string | null {
    return this.vapid?.publicKey ?? null;
  }

  async send(message: PushMessage): Promise<PushSendOutcome> {
    if (!this.vapid) return PushSendOutcome.RETRYABLE_FAILURE;
    const subscription = parseWebPushToken(message.token);
    if (!subscription || !isAllowedPushEndpoint(subscription.endpoint)) {
      throw new PushDeliveryError(PushSendOutcome.INVALID_TOKEN, 'Web push subscription is not usable');
    }
    const reference = message.data.notificationReference;
    const payload = JSON.stringify({
      title: message.notification.title,
      body: WEB_PUSH_BODY,
      url: '/me/notifications',
      tag: reference ? `smartclinic-${reference}` : 'smartclinic',
    });
    try {
      await webPush.sendNotification(subscription, payload, { vapidDetails: this.vapid, TTL: 24 * 60 * 60, urgency: 'normal' });
      return PushSendOutcome.SENT;
    } catch (error) {
      const status = typeof error === 'object' && error !== null && 'statusCode' in error ? Number(error.statusCode) : 0;
      if (status === 404 || status === 410) {
        throw new PushDeliveryError(PushSendOutcome.INVALID_TOKEN, 'Web push subscription has expired');
      }
      throw new PushDeliveryError(PushSendOutcome.RETRYABLE_FAILURE);
    }
  }
}

/** Sends browser subscriptions through web push and everything else through the native (mobile) provider. */
export class RoutingPushProvider implements PushProvider {
  constructor(private readonly native: PushProvider, private readonly web: PushProvider) {}

  send(message: PushMessage): Promise<PushSendOutcome> {
    return parseWebPushToken(message.token) ? this.web.send(message) : this.native.send(message);
  }
}
