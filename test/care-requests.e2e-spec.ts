import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { AdminCareRequestsController, MeCareRequestsController, ProviderCareRequestsController } from '../src/care-requests/care-requests.controller';
import { CareRequestsService } from '../src/care-requests/care-requests.service';
import { UserRole } from '../src/users/enums/user-role.enum';
import { generateCareRequestReference } from '../src/care-requests/care-request-reference';
import { CareDeliveryMode } from '../src/providers/enums/care-delivery-mode.enum';

describe('Care Request API authorization (e2e)', () => {
  let app: INestApplication;
  const reference = generateCareRequestReference();
  const appointment = { reference: 'SC-APT-ABCDEF123456', status: 'SCHEDULED', scheduledDate: '2026-09-10', scheduledTimeFrom: '10:30:00', scheduledTimeTo: '11:00:00', timezone: 'Africa/Lagos', location: null };
  const requestBody = { serviceCode: 'GENERAL_CONSULTATION', countryCode: 'NG', stateOrRegion: 'Lagos', city: 'Ikeja', contactMethod: 'WHATSAPP' };
  const service = { create: jest.fn().mockResolvedValue({ reference, status: 'MATCHING' }), listMine: jest.fn().mockResolvedValue({ items: [] }), getMine: jest.fn().mockResolvedValue({ reference, appointment }), cancelMine: jest.fn().mockResolvedValue({ reference, status: 'CANCELLED' }), listForProvider: jest.fn().mockResolvedValue({ items: [] }), getForProvider: jest.fn().mockResolvedValue({ reference, appointment }), providerRespond: jest.fn().mockResolvedValue({ reference }), adminList: jest.fn().mockResolvedValue({ items: [] }), adminGet: jest.fn().mockResolvedValue({ reference }), assign: jest.fn().mockResolvedValue({ reference }), markUnfulfillable: jest.fn().mockResolvedValue({ reference }) };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [MeCareRequestsController, ProviderCareRequestsController, AdminCareRequestsController], providers: [RolesGuard, Reflector, { provide: CareRequestsService, useValue: service }] })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: any) => { const req = context.switchToHttp().getRequest(); const token = req.headers.authorization?.replace('Bearer ', ''); if (!token) throw new UnauthorizedException(); const role = token === 'admin' ? UserRole.ADMIN : token === 'operations' ? UserRole.OPERATIONS : token === 'provider' ? UserRole.PROVIDER : UserRole.USER; req.user = { id: `${token}-user`, roles: [role] }; return true; } }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true })); await app.init();
  });
  afterAll(() => app.close());

  it('requires USER and derives patient authority from JWT', async () => {
    await request(app.getHttpServer()).post('/api/v1/me/care-requests').send(requestBody).expect(401);
    await request(app.getHttpServer()).post('/api/v1/me/care-requests').set('Authorization', 'Bearer provider').send(requestBody).expect(403);
    await request(app.getHttpServer()).post('/api/v1/me/care-requests').set('Authorization', 'Bearer user').send({ ...requestBody, userId: 'spoof', patientId: 'spoof', assignedProviderId: 'spoof' }).expect(201);
    expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-user' }), requestBody);
  });

  it('accepts authoritative care delivery modes and rejects unknown modes', async () => {
    await request(app.getHttpServer()).post('/api/v1/me/care-requests').set('Authorization', 'Bearer user').send({ ...requestBody, deliveryMode: CareDeliveryMode.VIRTUAL }).expect(201);
    expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-user' }), expect.objectContaining({ deliveryMode: CareDeliveryMode.VIRTUAL }));
    await request(app.getHttpServer()).post('/api/v1/me/care-requests').set('Authorization', 'Bearer user').send({ ...requestBody, deliveryMode: 'REMOTE' }).expect(400);
  });

  it('limits provider response APIs to PROVIDER', async () => {
    await request(app.getHttpServer()).post(`/api/v1/provider/care-requests/${reference}/accept`).set('Authorization', 'Bearer user').expect(403);
    await request(app.getHttpServer()).post(`/api/v1/provider/care-requests/${reference}/accept`).set('Authorization', 'Bearer provider').expect(201);
    expect(service.providerRespond).toHaveBeenCalledWith(expect.objectContaining({ id: 'provider-user' }), reference, true, null);
  });

  it('accepts generated references across patient reads/cancellation and rejects malformed references', async () => {
    await request(app.getHttpServer()).get(`/api/v1/me/care-requests/${reference}`).set('Authorization', 'Bearer user').expect(200).expect(({ body }) => expect(body.appointment).toEqual(appointment));
    await request(app.getHttpServer()).post(`/api/v1/me/care-requests/${reference}/cancel`).set('Authorization', 'Bearer user').expect(201);
    await request(app.getHttpServer()).get('/api/v1/me/care-requests/SC-CARE-TOO-SHORT').set('Authorization', 'Bearer user').expect(400);
    expect(service.getMine).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-user' }), reference);
    expect(service.cancelMine).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-user' }), reference);
  });

  it('returns the same appointment link from the owning provider detail contract', async () => {
    await request(app.getHttpServer()).get(`/api/v1/provider/care-requests/${reference}`).set('Authorization', 'Bearer provider').expect(200).expect(({ body }) => expect(body.appointment).toEqual(appointment));
  });

  it('allows ADMIN/OPERATIONS assignment and filters but denies other roles', async () => {
    const body = { providerReference: 'SCPR-ABCDEF0123456789' };
    await request(app.getHttpServer()).post(`/api/v1/admin/care-requests/${reference}/assign`).set('Authorization', 'Bearer provider').send(body).expect(403);
    for (const token of ['admin', 'operations']) await request(app.getHttpServer()).post(`/api/v1/admin/care-requests/${reference}/assign`).set('Authorization', `Bearer ${token}`).send(body).expect(201);
    await request(app.getHttpServer()).get('/api/v1/admin/care-requests?status=MATCHING&serviceCode=GENERAL_CONSULTATION&city=Ikeja').set('Authorization', 'Bearer admin').expect(200);
  });
});
