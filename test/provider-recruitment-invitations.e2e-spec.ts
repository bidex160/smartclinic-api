import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { ProviderRecruitmentInvitationsController } from '../src/provider-recruitment-invitations/provider-recruitment-invitations.controller';
import { ProviderRecruitmentInvitationsService } from '../src/provider-recruitment-invitations/provider-recruitment-invitations.service';
import { UserRole } from '../src/users/enums/user-role.enum';

describe('Patient provider recruitment invitations (e2e)', () => {
  let app: INestApplication;
  const response = { reference: 'SCPI-ABCDEF123456', organisationName: 'Eket General Hospital', email: 'contact@example.com', phone: null, source: 'HEALTH_CHECK_NO_PROVIDER', status: 'PENDING', context: { packageCode: 'COMPLETE', serviceCode: null, fulfilmentModeCode: 'PROVIDER_LOCATION', preferredDate: null, preferredTime: null, countryCode: 'NG', stateOrRegion: 'Akwa Ibom', city: 'Eket' }, createdAt: new Date() };
  const invitations = { create: jest.fn().mockResolvedValue(response) };
  const valid = { organisationName: 'Eket General Hospital', email: 'contact@example.com', source: 'HEALTH_CHECK_NO_PROVIDER', packageCode: 'COMPLETE', fulfilmentModeCode: 'PROVIDER_LOCATION', countryCode: 'NG', stateOrRegion: 'Akwa Ibom', city: 'Eket' };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [ProviderRecruitmentInvitationsController], providers: [RolesGuard, Reflector, { provide: ProviderRecruitmentInvitationsService, useValue: invitations }] })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: any) => { const req = context.switchToHttp().getRequest(); const token = req.headers.authorization?.replace('Bearer ', ''); if (!token) throw new UnauthorizedException(); req.user = { id: `${token}-user`, roles: token === 'provider' ? [UserRole.PROVIDER] : [UserRole.USER] }; return true; } }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => invitations.create.mockClear());

  it('allows an authenticated patient and returns only the public projection', async () => {
    const result = await request(app.getHttpServer()).post('/api/v1/me/provider-invitations').set('Authorization', 'Bearer patient').send(valid).expect(201);
    expect(invitations.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'patient-user' }), expect.objectContaining({ packageCode: 'COMPLETE' }));
    expect(result.body).toMatchObject({ reference: 'SCPI-ABCDEF123456', status: 'PENDING' });
    expect(result.body).not.toHaveProperty('id'); expect(result.body).not.toHaveProperty('emailNotificationFailureReason');
  });

  it('rejects unauthenticated and provider callers', async () => {
    await request(app.getHttpServer()).post('/api/v1/me/provider-invitations').send(valid).expect(401);
    await request(app.getHttpServer()).post('/api/v1/me/provider-invitations').set('Authorization', 'Bearer provider').send(valid).expect(403);
    expect(invitations.create).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...valid, email: undefined }, 400],
    [{ ...valid, email: 'bad-email' }, 400],
    [{ ...valid, source: 'UNSUPPORTED' }, 400],
    [{ ...valid, packageCode: undefined }, 400],
  ])('rejects invalid payload %#', async (payload, status) => {
    await request(app.getHttpServer()).post('/api/v1/me/provider-invitations').set('Authorization', 'Bearer patient').send(payload).expect(status);
    expect(invitations.create).not.toHaveBeenCalled();
  });
});
