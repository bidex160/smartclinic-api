import { ForbiddenException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { WhatsAppController } from '../src/whatsapp/whatsapp.controller';
import { WhatsAppService } from '../src/whatsapp/whatsapp.service';

describe('WhatsApp webhook routes (e2e)', () => {
  let app: INestApplication; const service = { verifyChallenge: jest.fn(), verifySignature: jest.fn(), processWebhook: jest.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [WhatsAppController], providers: [{ provide: WhatsAppService, useValue: service }] }).compile();
    app = module.createNestApplication({ rawBody: true }); app.setGlobalPrefix('api/v1'); await app.init();
  });
  afterAll(async () => app.close());
  beforeEach(() => { jest.clearAllMocks(); service.verifySignature.mockReturnValue(true); service.processWebhook.mockResolvedValue(undefined); service.verifyChallenge.mockImplementation((_mode: string, token: string, challenge: string) => { if (token !== 'valid') throw new ForbiddenException(); return challenge; }); });

  it('serves Meta verification at the public global-prefix route', async () => {
    await request(app.getHttpServer()).get('/api/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=valid&hub.challenge=12345').expect(200).expect('12345');
    await request(app.getHttpServer()).get('/api/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345').expect(403);
  });

  it('accepts inbound webhook events without authentication', async () => {
    await request(app.getHttpServer()).post('/api/v1/webhooks/whatsapp').set('x-hub-signature-256', 'signature').send({ object: 'other' }).expect(200).expect({ received: true });
    expect(service.processWebhook).toHaveBeenCalledWith({ object: 'other' });
  });
});
