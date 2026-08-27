import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { AdminReferralsController, MeReferralsController } from '../src/rewards/referrals.controller';
import { ReferralsService } from '../src/rewards/referrals.service';
import { UserRole } from '../src/users/enums/user-role.enum';
import { AdminRewardWithdrawalsController, MeRewardWithdrawalsController } from '../src/rewards/reward-withdrawals.controller';
import { RewardWithdrawalsService } from '../src/rewards/reward-withdrawals.service';

describe('Referral read authorization (e2e)', () => {
  let app: INestApplication;
  const referrals = {
    summary: jest.fn().mockResolvedValue({ referralCode: 'SC-AB12CD', links: { PATIENT: '/register?ref=SC-AB12CD' }, availablePoints: 10, reservedPoints: 0, lifetimeEarnedPoints: 10, lifetimeRedeemedPoints: 0, levelProgress: { currentLevel: null, nextLevel: { code: 'LEVEL_1', name: 'Level 1', ordinal: 1 }, highestLevelAchieved: 0, requirements: [{ targetType: 'PATIENT', qualified: 1, required: 10, remaining: 9, completed: false }], highestConfiguredLevelReached: false, qualifiedCounts: { PATIENT: 1, CLINIC: 0, LABORATORY: 0, PHARMACY: 0 } }, currentLevel: null, nextLevel: { code: 'LEVEL_1', name: 'Level 1' }, progress: { patients: { qualified: 1, required: 10 }, clinics: { qualified: 0, required: 2 }, laboratories: { qualified: 0, required: 2 }, pharmacies: { qualified: 0, required: 2 } }, completed: false, registeredDirectReferrals: 1, qualifiedDirectReferrals: 1 }),
    history: jest.fn().mockResolvedValue({ items: [], page: 1, limit: 20, total: 0, totalPages: 0 }),
    adminHistory: jest.fn().mockResolvedValue({ items: [], page: 1, limit: 20, total: 0, totalPages: 0 }),
  };
  const withdrawals = { listMine: jest.fn().mockResolvedValue({ items: [], page: 1, limit: 20, total: 0, totalPages: 0 }), getMine: jest.fn(), create: jest.fn().mockResolvedValue({ withdrawalReference: 'SCW-2026-ABCDEF12', status: 'REQUESTED' }), cancelMine: jest.fn(), adminList: jest.fn().mockResolvedValue({ items: [], page: 1, limit: 20, total: 0, totalPages: 0 }), adminDetail: jest.fn(), processing: jest.fn(), paid: jest.fn(), failed: jest.fn(), adminCancel: jest.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [MeReferralsController, AdminReferralsController, MeRewardWithdrawalsController, AdminRewardWithdrawalsController], providers: [RolesGuard, Reflector, { provide: ReferralsService, useValue: referrals }, { provide: RewardWithdrawalsService, useValue: withdrawals }] })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: any) => { const req = context.switchToHttp().getRequest(); const token = req.headers.authorization?.replace('Bearer ', ''); if (!token) throw new UnauthorizedException(); const role = token === 'admin' ? UserRole.ADMIN : token === 'operations' ? UserRole.OPERATIONS : token === 'provider' ? UserRole.PROVIDER : UserRole.USER; req.user = { id: `${token}-user`, roles: [role] }; return true; } }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true })); await app.init();
  });
  afterAll(() => app.close());

  it('allows USER to read only their own derived referral summary', async () => {
    await request(app.getHttpServer()).get('/api/v1/me/referrals').expect(401);
    await request(app.getHttpServer()).get('/api/v1/me/referrals').set('Authorization', 'Bearer provider').expect(403);
    await request(app.getHttpServer()).get('/api/v1/me/referrals').set('Authorization', 'Bearer user').expect(200).expect((response) => { expect(response.body.referralCode).toBe('SC-AB12CD'); expect(response.body.levelProgress.nextLevel).toMatchObject({ code: 'LEVEL_1', ordinal: 1 }); });
    expect(referrals.summary).toHaveBeenCalledWith('user-user');
  });

  it('allows ADMIN and OPERATIONS to use filtered operational reads', async () => {
    for (const token of ['admin', 'operations']) await request(app.getHttpServer()).get('/api/v1/admin/referrals?targetType=PATIENT&status=QUALIFIED').set('Authorization', `Bearer ${token}`).expect(200);
    await request(app.getHttpServer()).get('/api/v1/admin/referrals').set('Authorization', 'Bearer user').expect(403);
  });

  it('protects user withdrawal creation and derives the owner from JWT', async () => {
    const body = { points: 500, bankName: 'Example Bank', accountNumber: '0123456789', accountName: 'Ada Okafor' };
    await request(app.getHttpServer()).post('/api/v1/me/rewards/withdrawals').send(body).expect(401);
    await request(app.getHttpServer()).post('/api/v1/me/rewards/withdrawals').set('Authorization', 'Bearer provider').send(body).expect(403);
    await request(app.getHttpServer()).post('/api/v1/me/rewards/withdrawals').set('Authorization', 'Bearer user').send({ ...body, amount: '999999.00', userId: 'spoofed' }).expect(201);
    expect(withdrawals.create).toHaveBeenCalledWith('user-user', body);
  });

  it('limits withdrawal settlement commands to ADMIN and OPERATIONS', async () => {
    const body = { externalReference: 'BANK-123' };
    await request(app.getHttpServer()).post('/api/v1/admin/reward-withdrawals/SCW-2026-ABCDEF12/paid').set('Authorization', 'Bearer user').send(body).expect(403);
    for (const token of ['admin', 'operations']) await request(app.getHttpServer()).post('/api/v1/admin/reward-withdrawals/SCW-2026-ABCDEF12/paid').set('Authorization', `Bearer ${token}`).send(body).expect(201);
  });
});
