import { Injectable } from '@nestjs/common';

import { PushMessage, PushProvider, PushSendOutcome } from './push-provider';

@Injectable()
export class UnavailablePushProvider implements PushProvider {
  send(_message: PushMessage): Promise<PushSendOutcome> {
    return Promise.resolve(PushSendOutcome.RETRYABLE_FAILURE);
  }
}
