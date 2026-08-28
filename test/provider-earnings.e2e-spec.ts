import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { AdminProviderEarningsController, ProviderEarningsController } from '../src/earnings/provider-earnings.controller';
import { ProviderEarningsService } from '../src/earnings/provider-earnings.service';
import { UserRole } from '../src/users/enums/user-role.enum';

describe('Provider earnings authorization (e2e)', () => {
  let app: INestApplication;
  const earning = { reference: 'SC-EARN-ABCDEF123456ABCDEF123456', sourceType: 'HEALTH_CHECK', sourceReference: 'SC-2026-ABCDEF123456', grossAmountMinor: 2000000, commissionBasisPoints: 1000, commissionSource: 'PLATFORM_DEFAULT', commissionAmountMinor: 200000, providerShareMinor: 1800000, currency: 'NGN', status: 'HELD' };
  const service = { balancesOwn: jest.fn().mockResolvedValue([{ currency: 'NGN', heldAmountMinor: 1800000, payableAmountMinor: 0, settledAmountMinor: 0 }]), listOwn: jest.fn().mockResolvedValue({ items: [earning], page: 1, limit: 25, total: 1, totalPages: 1 }), getOwn: jest.fn().mockResolvedValue(earning), balancesAdmin: jest.fn().mockResolvedValue([]), listAdmin: jest.fn().mockResolvedValue({ items: [earning], page: 1, limit: 25, total: 1, totalPages: 1 }), getAdmin: jest.fn().mockResolvedValue(earning) };
  beforeAll(async () => { const module = await Test.createTestingModule({ controllers: [ProviderEarningsController, AdminProviderEarningsController], providers: [RolesGuard, Reflector, { provide: ProviderEarningsService, useValue: service }] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: any) => { const req = context.switchToHttp().getRequest(); const token = req.headers.authorization; if (!token) throw new UnauthorizedException(); req.user = { id: 'user-1', roles: token === 'Bearer provider' ? [UserRole.PROVIDER] : token === 'Bearer admin' ? [UserRole.ADMIN] : token === 'Bearer operations' ? [UserRole.OPERATIONS] : [UserRole.USER] }; return true; } }).compile(); app = module.createNestApplication(); app.setGlobalPrefix('api/v1'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true })); await app.init(); });
  afterAll(async () => app.close());
  it('allows only authenticated Providers to read their own endpoint', async () => { await request(app.getHttpServer()).get('/api/v1/provider/earnings').expect(401); await request(app.getHttpServer()).get('/api/v1/provider/earnings').set('Authorization', 'Bearer user').expect(403); await request(app.getHttpServer()).get('/api/v1/provider/earnings').set('Authorization', 'Bearer provider').expect(200).expect(response => { expect(response.body.items[0]).toMatchObject({ reference: earning.reference, providerShareMinor: 1800000 }); expect(response.body.items[0]).not.toHaveProperty('providerId'); expect(response.body.items[0]).not.toHaveProperty('paymentTransactionId'); }); });
  it('does not let Provider or patient access cross-Provider admin reads', async () => { await request(app.getHttpServer()).get('/api/v1/admin/provider-earnings').set('Authorization', 'Bearer provider').expect(403); await request(app.getHttpServer()).get('/api/v1/admin/provider-earnings').set('Authorization', 'Bearer user').expect(403); });
  it('allows ADMIN and OPERATIONS read-only inspection', async () => { await request(app.getHttpServer()).get('/api/v1/admin/provider-earnings').set('Authorization', 'Bearer admin').expect(200); await request(app.getHttpServer()).get('/api/v1/admin/provider-earnings/summary').set('Authorization', 'Bearer operations').expect(200); });
});
