import { ForbiddenException } from '@nestjs/common';
import { WhatsAppController } from './whatsapp.controller';

describe('WhatsAppController', () => {
  it('returns the valid Meta challenge and rejects an invalid token', () => {
    const service = { verifyChallenge: jest.fn((mode, token, challenge) => { if (token !== 'valid') throw new ForbiddenException(); return challenge; }) };
    const controller = new WhatsAppController(service as never);
    expect(controller.verify('subscribe', 'valid', '12345')).toBe('12345');
    expect(() => controller.verify('subscribe', 'wrong', '12345')).toThrow(ForbiddenException);
  });

  it('acknowledges unsupported payloads and rejects invalid configured signatures', async () => {
    const service = { verifySignature: jest.fn().mockReturnValue(true), processWebhook: jest.fn().mockResolvedValue(undefined) };
    const controller = new WhatsAppController(service as never);
    await expect(controller.inbound({ rawBody: Buffer.from('{}'), body: { object: 'other' } } as never, 'signature')).resolves.toEqual({ received: true });
    service.verifySignature.mockReturnValueOnce(false);
    await expect(controller.inbound({ rawBody: Buffer.from('{}'), body: {} } as never, 'bad')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
