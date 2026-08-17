import { ForbiddenException, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { ProviderOffersController } from '../src/providers/provider-offers.controller';
import { ProviderOffersService } from '../src/providers/provider-offers.service';
import { UserRole } from '../src/users/enums/user-role.enum';

describe('Provider offers authorization (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const offers = { list: jest.fn(async (user) => { if (user.id !== 'active-provider-user') throw new ForbiddenException('Active provider access is required'); return []; }), get: jest.fn(), accept: jest.fn(), decline: jest.fn() };
    const module = await Test.createTestingModule({ controllers: [ProviderOffersController], providers: [RolesGuard, Reflector, { provide: ProviderOffersService, useValue: offers }] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: any) => { const request = context.switchToHttp().getRequest(); const token = request.headers.authorization?.replace('Bearer ', ''); if (!token) throw new UnauthorizedException(); const role = token === 'user' ? UserRole.USER : token === 'admin' ? UserRole.ADMIN : token === 'operations' ? UserRole.OPERATIONS : UserRole.PROVIDER; request.user = { id: token === 'provider' ? 'active-provider-user' : token, roles: [role] }; return true; } }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1'); await app.init();
  });
  afterAll(async () => app.close());
  const path = '/api/v1/provider/offers';
  it('returns 401 when unauthenticated', () => request(app.getHttpServer()).get(path).expect(401));
  it.each(['user', 'admin', 'operations'])('returns 403 for %s without PROVIDER role', (token) => request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`).expect(403));
  it('allows a PROVIDER user linked to an active provider', () => request(app.getHttpServer()).get(path).set('Authorization', 'Bearer provider').expect(200).expect([]));
  it('denies PROVIDER role without a linked provider', () => request(app.getHttpServer()).get(path).set('Authorization', 'Bearer missing-provider').expect(403));
  it('denies a PROVIDER linked to an inactive provider', () => request(app.getHttpServer()).get(path).set('Authorization', 'Bearer inactive-provider').expect(403));
});
