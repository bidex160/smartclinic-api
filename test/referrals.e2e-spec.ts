import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { AdminReferralsController, MeReferralsController } from '../src/rewards/referrals.controller';
import { ReferralsService } from '../src/rewards/referrals.service';
import { UserRole } from '../src/users/enums/user-role.enum';

describe('Referral read authorization (e2e)', () => {
  let app: INestApplication;
  const referrals = {
    summary: jest.fn().mockResolvedValue({ referralCode: 'SC-AB12CD', links: { PATIENT: '/register?ref=SC-AB12CD' }, availablePoints: 10, lifetimeEarnedPoints: 10, currentLevel: null, nextLevel: { code: 'LEVEL_1', name: 'Level 1' }, progress: { patients: { qualified: 1, required: 10 }, clinics: { qualified: 0, required: 2 }, laboratories: { qualified: 0, required: 2 }, pharmacies: { qualified: 0, required: 2 } }, completed: false, registeredDirectReferrals: 1, qualifiedDirectReferrals: 1 }),
    history: jest.fn().mockResolvedValue({ items: [], page: 1, limit: 20, total: 0, totalPages: 0 }),
    adminHistory: jest.fn().mockResolvedValue({ items: [], page: 1, limit: 20, total: 0, totalPages: 0 }),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [MeReferralsController, AdminReferralsController], providers: [RolesGuard, Reflector, { provide: ReferralsService, useValue: referrals }] })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: any) => { const req = context.switchToHttp().getRequest(); const token = req.headers.authorization?.replace('Bearer ', ''); if (!token) throw new UnauthorizedException(); const role = token === 'admin' ? UserRole.ADMIN : token === 'operations' ? UserRole.OPERATIONS : token === 'provider' ? UserRole.PROVIDER : UserRole.USER; req.user = { id: `${token}-user`, roles: [role] }; return true; } }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true })); await app.init();
  });
  afterAll(() => app.close());

  it('allows USER to read only their own derived referral summary', async () => {
    await request(app.getHttpServer()).get('/api/v1/me/referrals').expect(401);
    await request(app.getHttpServer()).get('/api/v1/me/referrals').set('Authorization', 'Bearer provider').expect(403);
    await request(app.getHttpServer()).get('/api/v1/me/referrals').set('Authorization', 'Bearer user').expect(200).expect((response) => expect(response.body.referralCode).toBe('SC-AB12CD'));
    expect(referrals.summary).toHaveBeenCalledWith('user-user');
  });

  it('allows ADMIN and OPERATIONS to use filtered operational reads', async () => {
    for (const token of ['admin', 'operations']) await request(app.getHttpServer()).get('/api/v1/admin/referrals?targetType=PATIENT&status=QUALIFIED').set('Authorization', `Bearer ${token}`).expect(200);
    await request(app.getHttpServer()).get('/api/v1/admin/referrals').set('Authorization', 'Bearer user').expect(403);
  });
});
