import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, Message } from 'firebase-admin/messaging';

import { appConfig } from '../../config/app.config';
import { PushDeliveryError, PushMessage, PushProvider, PushSendOutcome } from './push-provider';

@Injectable()
export class FirebasePushProvider implements PushProvider {
  private readonly messaging: ReturnType<typeof getMessaging> | null;

  constructor(
     @Inject(appConfig.KEY)
  config: ConfigType<typeof appConfig>,
  ) {
    if (config.notifications.push.provider !== 'firebase') {
      this.messaging = null;
      return;
    }
    const app = getApps()[0] ?? initializeApp({
      credential: cert({
        projectId: config.notifications.push.firebaseProjectId,
        clientEmail: config.notifications.push.firebaseClientEmail,
        privateKey: config.notifications.push.firebasePrivateKey?.replace(/\\n/g, '\n'),
      }),
    });
    this.messaging = getMessaging(app);
  }

  async send(message: PushMessage): Promise<PushSendOutcome> {
    if (!this.messaging) return PushSendOutcome.RETRYABLE_FAILURE;
    const request: Message = {
      token: message.token,
      notification: message.notification,
      data: message.data,
    };
    try {
      await this.messaging.send(request);
      return PushSendOutcome.SENT;
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
      if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
        throw new PushDeliveryError(PushSendOutcome.INVALID_TOKEN, 'Push token is no longer registered');
      }
      throw new PushDeliveryError(PushSendOutcome.RETRYABLE_FAILURE);
    }
  }
}
