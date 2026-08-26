import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { AdminDashboardController } from '../src/providers/admin-dashboard.controller';
import { AdminDashboardService } from '../src/providers/admin-dashboard.service';
import { ProviderDashboardController } from '../src/providers/provider-dashboard.controller';
import { ProviderDashboardService } from '../src/providers/provider-dashboard.service';
import { UserRole } from '../src/users/enums/user-role.enum';

describe('Dashboard summary authorization (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const providerSummary = { offers: { new: 1 }, appointments: { today: 2, upcoming: 3 }, healthChecks: { inProgress: 4, completed: 5 }, referrals: { availablePoints: 10, currentLevel: null, nextLevel: { code: 'LEVEL_1', name: 'Level 1' }, qualifiedPatients: 1, qualifiedClinics: 0, qualifiedLaboratories: 0, qualifiedPharmacies: 0 } };
    const adminSummary = { bookings: { awaitingFunding: 1, pendingProviderMatch: 2, scheduled: 3, inProgress: 4, completed: 5, needsAttention: 6 }, matching: { activeOffers: 7 }, providers: { pendingReview: 8, active: 9 }, referrals: { registered: 10, qualified: 4, level1Achieved: 1, pointsIssued: 220 }, withdrawals: { requested: 3, processing: 2, paid: 5, failed: 1, pointsReserved: 900 } };
    const module = await Test.createTestingModule({ controllers: [ProviderDashboardController, AdminDashboardController], providers: [RolesGuard, Reflector, { provide: ProviderDashboardService, useValue: { summary: jest.fn().mockResolvedValue(providerSummary) } }, { provide: AdminDashboardService, useValue: { summary: jest.fn().mockResolvedValue(adminSummary) } }] })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: (context: any) => { const req = context.switchToHttp().getRequest(); const token = req.headers.authorization?.replace('Bearer ', ''); if (!token) throw new UnauthorizedException(); const role = token === 'admin' ? UserRole.ADMIN : token === 'operations' ? UserRole.OPERATIONS : token === 'provider' ? UserRole.PROVIDER : UserRole.USER; req.user = { id: `${token}-user`, roles: [role] }; return true; } })
      .compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1'); await app.init();
  });
  afterAll(async () => app.close());

  it('allows PROVIDER and denies other roles from provider summary', async () => {
    await request(app.getHttpServer()).get('/api/v1/provider/dashboard/summary').expect(401);
    for (const token of ['user', 'admin', 'operations']) await request(app.getHttpServer()).get('/api/v1/provider/dashboard/summary').set('Authorization', `Bearer ${token}`).expect(403);
    await request(app.getHttpServer()).get('/api/v1/provider/dashboard/summary').set('Authorization', 'Bearer provider').expect(200).expect((response) => expect(response.body).not.toHaveProperty('earnings'));
  });

  it('allows ADMIN and OPERATIONS and denies USER/PROVIDER from admin summary', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/dashboard/summary').expect(401);
    for (const token of ['user', 'provider']) await request(app.getHttpServer()).get('/api/v1/admin/dashboard/summary').set('Authorization', `Bearer ${token}`).expect(403);
    for (const token of ['admin', 'operations']) await request(app.getHttpServer()).get('/api/v1/admin/dashboard/summary').set('Authorization', `Bearer ${token}`).expect(200);
  });
});
