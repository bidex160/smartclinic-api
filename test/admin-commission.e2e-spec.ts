import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { AdminCommissionService } from '../src/commissions/admin-commission.service';
import { AdminPlatformCommissionController, AdminProviderCommissionController } from '../src/commissions/admin-commission.controller';
import { UserRole } from '../src/users/enums/user-role.enum';

describe('Admin commission configuration authorization (e2e)', () => {
  let app: INestApplication;
  const providerId = '10000000-0000-4000-8000-000000000001';
  const service = { getPlatform: jest.fn().mockResolvedValue({ configured: false, commissionBasisPoints: null }), setPlatform: jest.fn().mockImplementation(async rate => ({ configured: true, commissionBasisPoints: rate })), getProvider: jest.fn().mockResolvedValue({ providerReference: 'SCPR-ABC', platformDefaultBasisPoints: 1000, providerOverrideBasisPoints: null, configured: true, effectiveBasisPoints: 1000, source: 'PLATFORM_DEFAULT' }), setProvider: jest.fn().mockImplementation(async (_id, rate) => ({ providerReference: 'SCPR-ABC', providerOverrideBasisPoints: rate })) };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [AdminPlatformCommissionController, AdminProviderCommissionController], providers: [RolesGuard, Reflector, { provide: AdminCommissionService, useValue: service }] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: any) => { const req = context.switchToHttp().getRequest(); const token = req.headers.authorization; if (!token) throw new UnauthorizedException(); req.user = { id: '20000000-0000-4000-8000-000000000001', roles: token === 'Bearer admin' ? [UserRole.ADMIN] : token === 'Bearer operations' ? [UserRole.OPERATIONS] : token === 'Bearer provider' ? [UserRole.PROVIDER] : [UserRole.USER] }; return true; } }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true })); await app.init();
  });
  afterAll(async () => app.close());
  const platformPath = '/api/v1/admin/commercial-settings/provider-commission';
  it('rejects anonymous, patient, and Provider access', async () => { await request(app.getHttpServer()).get(platformPath).expect(401); await request(app.getHttpServer()).patch(platformPath).set('Authorization', 'Bearer user').send({ commissionBasisPoints: 1000 }).expect(403); await request(app.getHttpServer()).patch(platformPath).set('Authorization', 'Bearer provider').send({ commissionBasisPoints: 1000 }).expect(403); });
  it('allows ADMIN and OPERATIONS and validates the rate range', async () => { await request(app.getHttpServer()).patch(platformPath).set('Authorization', 'Bearer admin').send({ commissionBasisPoints: 750 }).expect(200).expect(response => expect(response.body).toMatchObject({ commissionBasisPoints: 750 })); await request(app.getHttpServer()).get(platformPath).set('Authorization', 'Bearer operations').expect(200); await request(app.getHttpServer()).patch(platformPath).set('Authorization', 'Bearer admin').send({ commissionBasisPoints: -1 }).expect(400); await request(app.getHttpServer()).patch(platformPath).set('Authorization', 'Bearer admin').send({ commissionBasisPoints: 10001 }).expect(400); });
  it('prevents Provider self-service and supports explicit override clearing for admins', async () => { const path = `/api/v1/admin/providers/${providerId}/commission`; await request(app.getHttpServer()).patch(path).set('Authorization', 'Bearer provider').send({ commissionBasisPoints: 0 }).expect(403); await request(app.getHttpServer()).patch(path).set('Authorization', 'Bearer admin').send({ commissionBasisPoints: 0 }).expect(200); await request(app.getHttpServer()).delete(path).set('Authorization', 'Bearer operations').expect(200); });
});
