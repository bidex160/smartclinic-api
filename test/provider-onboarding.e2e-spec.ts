import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { AdminProvidersController } from '../src/providers/admin-providers.controller';
import { AdminProvidersService } from '../src/providers/admin-providers.service';
import { ProviderOnboardingController } from '../src/providers/provider-onboarding.controller';
import { ProviderOnboardingService } from '../src/providers/provider-onboarding.service';
import { ProviderInvitationsService } from '../src/providers/provider-invitations.service';
import { PublicProviderRegistrationController } from '../src/providers/public-provider-registration.controller';
import { ProviderOnboardingStatus } from '../src/providers/enums/provider-onboarding-status.enum';
import { ProviderStatus } from '../src/providers/enums/provider-status.enum';
import { ProviderType } from '../src/providers/enums/provider-type.enum';
import { UserRole } from '../src/users/enums/user-role.enum';

describe('Provider onboarding HTTP boundaries (e2e)', () => {
  let app: INestApplication;
  const id = '10000000-0000-4000-8000-000000000001';
  const profile = { displayName: 'Ada Clinic', email: 'ada@example.test', phone: '+2348000000000', professionalReference: null, providerType: ProviderType.CLINIC, countryCode: 'NG', stateOrRegion: 'Lagos', city: 'Ikeja', status: ProviderStatus.PENDING, onboardingStatus: ProviderOnboardingStatus.SUBMITTED, submittedAt: new Date(), reviewedAt: null, reviewNote: null };
  beforeAll(async () => {
    const providers = { list: jest.fn().mockResolvedValue({ items: [], page: 1, limit: 25, total: 0, totalPages: 0 }), get: jest.fn(), update: jest.fn(), activate: jest.fn(), suspend: jest.fn(), linkUser: jest.fn(), unlinkUser: jest.fn(), approve: jest.fn().mockResolvedValue({ id, ...profile, status: ProviderStatus.ACTIVE, onboardingStatus: ProviderOnboardingStatus.APPROVED }), reject: jest.fn().mockResolvedValue({ id, ...profile, onboardingStatus: ProviderOnboardingStatus.REJECTED }) };
    const invitations = { createProvider: jest.fn().mockResolvedValue({ provider: { id, ...profile, onboardingStatus: ProviderOnboardingStatus.INVITED, linkedUser: null, capabilityCount: 0, locationCount: 0 }, invitation: { id: '20000000-0000-4000-8000-000000000001', email: profile.email, status: 'PENDING', deliveryStatus: 'SENT' } }) };
    const onboarding = { register: jest.fn().mockResolvedValue(profile), get: jest.fn().mockResolvedValue(profile), update: jest.fn().mockResolvedValue(profile), submit: jest.fn().mockResolvedValue(profile) };
    const module = await Test.createTestingModule({ controllers: [AdminProvidersController, PublicProviderRegistrationController, ProviderOnboardingController], providers: [RolesGuard, Reflector, { provide: AdminProvidersService, useValue: providers }, { provide: ProviderInvitationsService, useValue: invitations }, { provide: ProviderOnboardingService, useValue: onboarding }] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: any) => { const req = context.switchToHttp().getRequest(); const token = req.headers.authorization?.replace('Bearer ', ''); if (!token) throw new UnauthorizedException(); req.user = { id: `${token}-id`, roles: [token === 'admin' ? UserRole.ADMIN : token === 'operations' ? UserRole.OPERATIONS : token === 'provider' ? UserRole.PROVIDER : UserRole.USER] }; return true; } }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })); await app.init();
  });
  afterAll(async () => app.close());
  const createBody = { displayName: 'Ada Clinic', email: 'ada@example.test', phone: '+2348000000000', providerType: 'CLINIC', countryCode: 'NG', stateOrRegion: 'Lagos', city: 'Ikeja' };

  it('allows ADMIN/OPERATIONS create+invite and denies USER/PROVIDER/unauthenticated', async () => { const path = '/api/v1/admin/providers'; await request(app.getHttpServer()).post(path).send(createBody).expect(401); for (const role of ['user', 'provider']) await request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${role}`).send(createBody).expect(403); for (const role of ['admin', 'operations']) await request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${role}`).send(createBody).expect(201).expect((response) => expect(response.body).toMatchObject({ provider: { status: 'PENDING', onboardingStatus: 'INVITED' }, invitation: { deliveryStatus: 'SENT' } })); });
  it('requires email and complete provider identity for admin creation', () => request(app.getHttpServer()).post('/api/v1/admin/providers').set('Authorization', 'Bearer admin').send({ displayName: 'Incomplete' }).expect(400));
  it('allows ADMIN and OPERATIONS review but not USER or PROVIDER', async () => { const path = `/api/v1/admin/providers/${id}/approve`; for (const role of ['user', 'provider']) await request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${role}`).expect(403); await request(app.getHttpServer()).post(path).set('Authorization', 'Bearer admin').expect(200); await request(app.getHttpServer()).post(path).set('Authorization', 'Bearer operations').expect(200); });
  it('supports public self-registration without returning credentials', () => request(app.getHttpServer()).post('/api/v1/public/providers/register').send({ ...createBody, password: 'very-secure-password' }).expect(201).expect((response) => { expect(response.body).toMatchObject({ status: 'PENDING', onboardingStatus: 'SUBMITTED' }); expect(response.body).not.toHaveProperty('password'); expect(response.body).not.toHaveProperty('passwordHash'); }));
  it('allows PROVIDER profile/submit access while denying other roles', async () => { const path = '/api/v1/provider/profile'; await request(app.getHttpServer()).get(path).expect(401); for (const role of ['user', 'admin', 'operations']) await request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${role}`).expect(403); await request(app.getHttpServer()).get(path).set('Authorization', 'Bearer provider').expect(200).expect((response) => expect(response.body.onboardingStatus).toBe('SUBMITTED')); await request(app.getHttpServer()).post('/api/v1/provider/onboarding/submit').set('Authorization', 'Bearer provider').expect(200); });
});
