import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { AdminHealthResultAccessController } from '../src/health-checks/admin-health-result-access.controller';
import { HealthResultAccessService } from '../src/health-checks/health-result-access.service';
import { MeHealthResultsController } from '../src/health-checks/me-health-results.controller';
import { PublicHealthResultsController } from '../src/health-checks/public-health-results.controller';
import { UserRole } from '../src/users/enums/user-role.enum';

describe('Health result access HTTP boundaries (e2e)', () => {
  let app: INestApplication;
  const reference = 'SC-2026-7F23B0C9D1E4'; const encounterId = '10000000-0000-4000-8000-000000000001'; const grantId = '20000000-0000-4000-8000-000000000001'; const token = 'a'.repeat(43);
  const result = { bookingReference: reference, completedAt: new Date('2026-08-18T11:00:00Z'), healthCheckPackage: { code: 'ESSENTIAL', name: 'Essential' }, provider: { displayName: 'SmartClinic Ikeja' }, measurements: [{ code: 'PULSE', value: 72, secondaryValue: null, unit: 'bpm', recordedAt: new Date('2026-08-18T10:50:00Z') }] };
  const grant = { id: grantId, bookingReference: reference, status: 'ACTIVE', expiresAt: new Date('2026-08-25T11:00:00Z'), revokedAt: null, createdAt: new Date('2026-08-18T11:00:00Z'), resultAccessToken: token };
  const service = { getRegisteredResult: jest.fn().mockResolvedValue(result), issueGuestResultAccess: jest.fn().mockResolvedValue(grant), revokeGuestResultAccess: jest.fn().mockResolvedValue({ ...grant, status: 'REVOKED', revokedAt: new Date(), resultAccessToken: undefined }), getGuestResult: jest.fn().mockResolvedValue(result) };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [MeHealthResultsController, AdminHealthResultAccessController, PublicHealthResultsController], providers: [RolesGuard, Reflector, { provide: HealthResultAccessService, useValue: service }] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: any) => { const requestValue = context.switchToHttp().getRequest(); const auth = requestValue.headers.authorization; if (!auth) throw new UnauthorizedException(); requestValue.user = { id: 'user-1', roles: auth === 'Bearer admin' ? [UserRole.ADMIN] : auth === 'Bearer operations' ? [UserRole.OPERATIONS] : auth === 'Bearer provider' ? [UserRole.PROVIDER] : [UserRole.USER] }; return true; } }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })); await app.init();
  });
  afterAll(async () => app.close());

  it('requires authentication for registered patient results and derives the User from JWT context', async () => { const path = `/api/v1/me/health-checks/${reference}/results`; await request(app.getHttpServer()).get(path).expect(401); await request(app.getHttpServer()).get(path).set('Authorization', 'Bearer user').expect(200); expect(service.getRegisteredResult).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }), reference); });
  it('returns a data-minimized patient result DTO', () => request(app.getHttpServer()).get(`/api/v1/me/health-checks/${reference}/results`).set('Authorization', 'Bearer user').expect(200).expect((response) => { expect(response.body.measurements[0]).toEqual(expect.objectContaining({ code: 'PULSE', value: 72, unit: 'bpm' })); for (const field of ['funding', 'payment', 'providerId', 'providerAssignmentId', 'history', 'booker']) expect(response.body).not.toHaveProperty(field); expect(response.body).not.toHaveProperty('interpretation'); }));
  it('restricts guest grant issuance to ADMIN and OPERATIONS', async () => { const path = `/api/v1/admin/health-check-encounters/${encounterId}/result-access`; await request(app.getHttpServer()).post(path).expect(401); await request(app.getHttpServer()).post(path).set('Authorization', 'Bearer user').expect(403); await request(app.getHttpServer()).post(path).set('Authorization', 'Bearer provider').expect(403); await request(app.getHttpServer()).post(path).set('Authorization', 'Bearer admin').expect(201); await request(app.getHttpServer()).post(path).set('Authorization', 'Bearer operations').expect(201); });
  it('returns the raw token only from issuance and never exposes its hash', () => request(app.getHttpServer()).post(`/api/v1/admin/health-check-encounters/${encounterId}/result-access`).set('Authorization', 'Bearer admin').expect(201).expect((response) => { expect(response.body.resultAccessToken).toBe(token); expect(response.body).not.toHaveProperty('accessTokenHash'); }));
  it('restricts revocation and returns no token material', () => request(app.getHttpServer()).post(`/api/v1/admin/health-result-access/${grantId}/revoke`).set('Authorization', 'Bearer operations').expect(200).expect((response) => { expect(response.body.status).toBe('REVOKED'); expect(response.body).not.toHaveProperty('resultAccessToken'); expect(response.body).not.toHaveProperty('accessTokenHash'); }));
  it('uses only the dedicated public token and does not accept booking reference or session-cookie authority', async () => { await request(app.getHttpServer()).get(`/api/v1/public/health-results/${token}`).set('Cookie', 'smartclinic_public_booking_session=irrelevant').expect(200); await request(app.getHttpServer()).get(`/api/v1/public/health-results/${reference}`).set('Cookie', 'smartclinic_public_booking_session=booking-authority-only').expect(400); expect(service.getGuestResult).toHaveBeenCalledWith(token); });
});
