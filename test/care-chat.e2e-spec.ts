import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { MeCareChatController, ProviderCareChatController } from '../src/care-chat/care-chat.controller';
import { CareChatService } from '../src/care-chat/care-chat.service';
import { generateCareRequestReference } from '../src/care-requests/care-request-reference';
import { UserRole } from '../src/users/enums/user-role.enum';

describe('Care Chat API boundaries (e2e)', () => {
  let app: INestApplication;
  const reference = generateCareRequestReference();
  const chat = { conversationReference: 'SC-CHAT-ABCDEF123456', careRequestReference: reference, canSendMessages: true, unreadCount: 0 };
  const service = { openPatient: jest.fn().mockResolvedValue(chat), messagesPatient: jest.fn().mockResolvedValue({ items: [] }), sendPatient: jest.fn().mockResolvedValue({ reference: 'SC-MSG-ABCDEF123456' }), readPatient: jest.fn().mockResolvedValue({ markedRead: 1 }), openProvider: jest.fn().mockResolvedValue(chat), messagesProvider: jest.fn().mockResolvedValue({ items: [] }), sendProvider: jest.fn().mockResolvedValue({ reference: 'SC-MSG-ABCDEF123456' }), readProvider: jest.fn().mockResolvedValue({ markedRead: 1 }) };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [MeCareChatController, ProviderCareChatController], providers: [RolesGuard, Reflector, { provide: CareChatService, useValue: service }] })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: any) => { const req = context.switchToHttp().getRequest(); const token = req.headers.authorization?.replace('Bearer ', ''); if (!token) throw new UnauthorizedException(); req.user = { id: `${token}-user`, roles: [token === 'provider' ? UserRole.PROVIDER : UserRole.USER] }; return true; } }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
  });
  afterAll(() => app.close());

  it('requires JWT USER authority and derives patient/sender identity from auth', async () => {
    await request(app.getHttpServer()).get(`/api/v1/me/care-requests/${reference}/chat`).expect(401);
    await request(app.getHttpServer()).get(`/api/v1/me/care-requests/${reference}/chat`).set('Authorization', 'Bearer provider').expect(403);
    await request(app.getHttpServer()).post(`/api/v1/me/care-requests/${reference}/chat/messages`).set('Authorization', 'Bearer user').send({ body: '  Hello Provider  ' }).expect(201);
    expect(service.sendPatient).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-user' }), reference, 'Hello Provider');
  });

  it('requires PROVIDER authority and accepts no caller-controlled sender identity', async () => {
    await request(app.getHttpServer()).get(`/api/v1/provider/care-requests/${reference}/chat`).set('Authorization', 'Bearer user').expect(403);
    await request(app.getHttpServer()).post(`/api/v1/provider/care-requests/${reference}/chat/messages`).set('Authorization', 'Bearer provider').send({ body: 'Hello Patient', senderType: 'PATIENT', senderUserId: 'spoof' }).expect(400);
    await request(app.getHttpServer()).post(`/api/v1/provider/care-requests/${reference}/chat/messages`).set('Authorization', 'Bearer provider').send({ body: 'Hello Patient' }).expect(201);
    expect(service.sendProvider).toHaveBeenCalledWith(expect.objectContaining({ id: 'provider-user' }), reference, 'Hello Patient');
  });

  it('rejects empty, whitespace-only, over-length bodies and malformed Care Request references', async () => {
    for (const body of ['', '   ', 'x'.repeat(4001)]) await request(app.getHttpServer()).post(`/api/v1/me/care-requests/${reference}/chat/messages`).set('Authorization', 'Bearer user').send({ body }).expect(400);
    await request(app.getHttpServer()).get('/api/v1/me/care-requests/SC-CARE-BAD/chat').set('Authorization', 'Bearer user').expect(400);
  });

  it('provides bounded pagination and explicit read commands for each participant', async () => {
    await request(app.getHttpServer()).get(`/api/v1/me/care-requests/${reference}/chat/messages?page=1&limit=50`).set('Authorization', 'Bearer user').expect(200);
    await request(app.getHttpServer()).get(`/api/v1/me/care-requests/${reference}/chat/messages?limit=101`).set('Authorization', 'Bearer user').expect(400);
    await request(app.getHttpServer()).post(`/api/v1/me/care-requests/${reference}/chat/read`).set('Authorization', 'Bearer user').expect(201);
    await request(app.getHttpServer()).post(`/api/v1/provider/care-requests/${reference}/chat/read`).set('Authorization', 'Bearer provider').expect(201);
  });
});
