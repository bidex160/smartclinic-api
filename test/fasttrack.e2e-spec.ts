import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { AdminFastTrackController, MeFastTrackController, ProviderFastTrackController } from '../src/fasttrack/fasttrack.controller';
import { FastTrackService } from '../src/fasttrack/fasttrack.service';
import { PaymentFlowService } from '../src/payments/payment-flow.service';
import { UserRole } from '../src/users/enums/user-role.enum';
import { generateCareRequestReference, isCareRequestReference } from '../src/care-requests/care-request-reference';

describe('FastTrack API boundaries (e2e)', () => {
  let app: INestApplication;
  const reference = 'SC-FT-ABCDEF0123456789';
  const careReference = generateCareRequestReference();
  const fasttrack = { createForCareRequest: jest.fn().mockResolvedValue({ reference }), createExternal: jest.fn().mockResolvedValue({ reference, status: 'VERIFYING' }), listMine: jest.fn().mockResolvedValue({ items: [] }), getMine: jest.fn().mockResolvedValue({ reference }), cancelMine: jest.fn(), listProvider: jest.fn().mockResolvedValue({ items: [] }), getProvider: jest.fn().mockResolvedValue({ reference }), providerVerify: jest.fn(), providerReject: jest.fn(), adminList: jest.fn().mockResolvedValue({ items: [] }), adminGet: jest.fn().mockResolvedValue({ reference }), adminReject: jest.fn(), adminCancel: jest.fn(), adminExpire: jest.fn() };
  const payments = { initializeFastTrackPayment: jest.fn().mockResolvedValue({ fastTrackReference: reference, amount: '5000.00', currency: 'NGN' }), getFastTrackPaymentStatus: jest.fn(), verifyFastTrackPayment: jest.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [MeFastTrackController, ProviderFastTrackController, AdminFastTrackController], providers: [RolesGuard, Reflector, { provide: FastTrackService, useValue: fasttrack }, { provide: PaymentFlowService, useValue: payments }] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: any) => { const req = context.switchToHttp().getRequest(); const token = req.headers.authorization?.replace('Bearer ', ''); if (!token) throw new UnauthorizedException(); const role = token === 'admin' ? UserRole.ADMIN : token === 'operations' ? UserRole.OPERATIONS : token === 'provider' ? UserRole.PROVIDER : UserRole.USER; req.user = { id: `${token}-user`, roles: [role] }; return true; } }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
  });
  afterAll(() => app.close());

  it('requires USER authority and derives Care Request/provider/fee ownership server-side', async () => {
    expect(isCareRequestReference(careReference)).toBe(true);
    await request(app.getHttpServer()).post(`/api/v1/me/care-requests/${careReference}/fasttrack`).expect(401);
    await request(app.getHttpServer()).post(`/api/v1/me/care-requests/${careReference}/fasttrack`).set('Authorization', 'Bearer provider').expect(403);
    await request(app.getHttpServer()).post(`/api/v1/me/care-requests/${careReference}/fasttrack`).set('Authorization', 'Bearer user').send({ providerId: 'spoof', feeMinor: 1 }).expect(201);
    await request(app.getHttpServer()).post(`/api/v1/me/care-requests/${careReference}/fasttrack`).set('Authorization', 'Bearer user').expect(201);
    expect(fasttrack.createForCareRequest).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-user' }), careReference);
  });

  it('rejects malformed and obsolete 16-character Care Request references before service lookup', async () => {
    fasttrack.createForCareRequest.mockClear();
    await request(app.getHttpServer()).post('/api/v1/me/care-requests/SC-CARE-ABCDEF0123456789/fasttrack').set('Authorization', 'Bearer user').expect(400);
    await request(app.getHttpServer()).post('/api/v1/me/care-requests/not-a-reference/fasttrack').set('Authorization', 'Bearer user').expect(400);
    expect(fasttrack.createForCareRequest).not.toHaveBeenCalled();
  });

  it('validates external appointment input and starts through the patient service', async () => {
    const body = { providerReference: 'SCPR-ABCDEF0123456789', serviceCode: 'GENERAL_CONSULTATION', externalAppointmentReference: 'HOSP-123', appointmentDate: '2026-09-10', appointmentTime: '10:30' };
    await request(app.getHttpServer()).post('/api/v1/me/fasttrack-requests/external').set('Authorization', 'Bearer user').send({ ...body, feeMinor: 1 }).expect(400);
    await request(app.getHttpServer()).post('/api/v1/me/fasttrack-requests/external').set('Authorization', 'Bearer user').send(body).expect(201);
    expect(fasttrack.createExternal).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-user' }), body);
  });

  it('separates provider verification and admin operations roles', async () => {
    await request(app.getHttpServer()).post(`/api/v1/provider/fasttrack-requests/${reference}/verify`).set('Authorization', 'Bearer user').expect(403);
    await request(app.getHttpServer()).post(`/api/v1/provider/fasttrack-requests/${reference}/verify`).set('Authorization', 'Bearer provider').expect(201);
    await request(app.getHttpServer()).get('/api/v1/admin/fasttrack-requests').set('Authorization', 'Bearer provider').expect(403);
    await request(app.getHttpServer()).get('/api/v1/admin/fasttrack-requests').set('Authorization', 'Bearer operations').expect(200);
  });

  it('scopes payment initialization through authenticated USER context', async () => {
    await request(app.getHttpServer()).post(`/api/v1/me/fasttrack-requests/${reference}/funding/initialize`).set('Authorization', 'Bearer provider').expect(403);
    await request(app.getHttpServer()).post(`/api/v1/me/fasttrack-requests/${reference}/funding/initialize`).set('Authorization', 'Bearer user').expect(201).expect(({ body }) => expect(body).toMatchObject({ amount: '5000.00', currency: 'NGN' }));
    expect(payments.initializeFastTrackPayment).toHaveBeenCalledWith(reference, 'user-user');
  });
});
