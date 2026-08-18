import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { AdminProviderInvitationsController } from '../src/providers/admin-provider-invitations.controller';
import { ProviderInvitationsService } from '../src/providers/provider-invitations.service';
import { PublicProviderInvitationsController } from '../src/providers/public-provider-invitations.controller';
import { UserRole } from '../src/users/enums/user-role.enum';

describe('Provider invitation HTTP boundaries (e2e)', () => {
  let app: INestApplication;
  const providerId = '10000000-0000-4000-8000-000000000001'; const invitationId = '20000000-0000-4000-8000-000000000001'; const token = 'a'.repeat(43);
  const summary = { id: invitationId, provider: { displayName: 'SmartClinic Ikeja' }, email: 'provider@example.test', status: 'PENDING', expiresAt: new Date('2026-09-01T00:00:00Z'), acceptedAt: null, revokedAt: null, createdAt: new Date('2026-08-18T00:00:00Z'), createdBy: { id: '30000000-0000-4000-8000-000000000001', email: 'ops@example.test', displayName: 'Ops' } };
  beforeAll(async () => {
    const invitations = { create: jest.fn().mockResolvedValue({ ...summary, deliveryStatus: 'MANUAL_REQUIRED', manualInvitationLink: `https://app.example.test/provider/setup/${token}` }), list: jest.fn().mockResolvedValue([summary]), revoke: jest.fn().mockResolvedValue({ ...summary, status: 'REVOKED', revokedAt: new Date() }), inspect: jest.fn().mockResolvedValue({ providerDisplayName: 'SmartClinic Ikeja', invitedEmail: 'p******@example.test', expiresAt: summary.expiresAt }), accept: jest.fn().mockResolvedValue({ providerDisplayName: 'SmartClinic Ikeja', email: 'provider@example.test', status: 'ACCEPTED', loginRequired: true }) };
    const module = await Test.createTestingModule({ controllers: [AdminProviderInvitationsController, PublicProviderInvitationsController], providers: [RolesGuard, Reflector, { provide: ProviderInvitationsService, useValue: invitations }] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: any) => { const req = context.switchToHttp().getRequest(); const auth = req.headers.authorization; if (!auth) throw new UnauthorizedException(); req.user = { id: '30000000-0000-4000-8000-000000000001', roles: auth === 'Bearer admin' ? [UserRole.ADMIN] : auth === 'Bearer operations' ? [UserRole.OPERATIONS] : auth === 'Bearer provider' ? [UserRole.PROVIDER] : [UserRole.USER] }; return true; } }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })); await app.init();
  });
  afterAll(async () => app.close());
  const adminPath = `/api/v1/admin/providers/${providerId}/invitations`;
  it('denies unauthenticated, USER, and PROVIDER-only admin creation', async () => { await request(app.getHttpServer()).post(adminPath).send({ email: 'provider@example.test' }).expect(401); await request(app.getHttpServer()).post(adminPath).set('Authorization', 'Bearer user').send({ email: 'provider@example.test' }).expect(403); await request(app.getHttpServer()).post(adminPath).set('Authorization', 'Bearer provider').send({ email: 'provider@example.test' }).expect(403); });
  it('allows ADMIN creation and returns a manual link only when required', () => request(app.getHttpServer()).post(adminPath).set('Authorization', 'Bearer admin').send({ email: 'provider@example.test' }).expect(201).expect((response) => { expect(response.body).toMatchObject({ deliveryStatus: 'MANUAL_REQUIRED', manualInvitationLink: `https://app.example.test/provider/setup/${token}` }); expect(response.body).not.toHaveProperty('tokenHash'); }));
  it('allows OPERATIONS listing without token material', () => request(app.getHttpServer()).get(adminPath).set('Authorization', 'Bearer operations').expect(200).expect((response) => { expect(response.body[0]).not.toHaveProperty('invitationToken'); expect(response.body[0]).not.toHaveProperty('tokenHash'); }));
  it('allows an authorized revoke', () => request(app.getHttpServer()).post(`/api/v1/admin/provider-invitations/${invitationId}/revoke`).set('Authorization', 'Bearer operations').expect(200).expect((response) => expect(response.body.status).toBe('REVOKED')));
  it('publicly inspects only safe invitation context', () => request(app.getHttpServer()).get(`/api/v1/public/provider-invitations/${token}`).expect(200).expect({ providerDisplayName: 'SmartClinic Ikeja', invitedEmail: 'p******@example.test', expiresAt: '2026-09-01T00:00:00.000Z' }));
  it('accepts without issuing a session or leaking credentials', () => request(app.getHttpServer()).post(`/api/v1/public/provider-invitations/${token}/accept`).send({ displayName: 'Ada Provider', password: 'very-secure-password' }).expect(200).expect((response) => { expect(response.body).toEqual({ providerDisplayName: 'SmartClinic Ikeja', email: 'provider@example.test', status: 'ACCEPTED', loginRequired: true }); expect(response.body).not.toHaveProperty('accessToken'); expect(response.body).not.toHaveProperty('passwordHash'); }));
});
