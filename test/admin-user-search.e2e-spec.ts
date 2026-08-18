import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { AdminUserSearchController } from '../src/users/admin-user-search.controller';
import { AdminUserSearchService } from '../src/users/admin-user-search.service';
import { UserRole } from '../src/users/enums/user-role.enum';

describe('Admin user search authorization (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const search = { search: jest.fn().mockResolvedValue({ items: [{ id: '10000000-0000-4000-8000-000000000001', email: 'ada@example.test', displayName: 'Ada', status: 'ACTIVE', roles: ['USER'], providerLink: null }], page: 1, limit: 20, total: 1, totalPages: 1 }) };
    const module = await Test.createTestingModule({ controllers: [AdminUserSearchController], providers: [RolesGuard, Reflector, { provide: AdminUserSearchService, useValue: search }] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: any) => { const request = context.switchToHttp().getRequest(); const token = request.headers.authorization; if (!token) throw new UnauthorizedException(); request.user = { roles: token === 'Bearer admin' ? [UserRole.ADMIN] : token === 'Bearer operations' ? [UserRole.OPERATIONS] : token === 'Bearer provider' ? [UserRole.PROVIDER] : [UserRole.USER] }; return true; } }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })); await app.init();
  });
  afterAll(async () => app.close());
  const path = '/api/v1/admin/users/search?q=ada';
  it('returns 401 when unauthenticated', () => request(app.getHttpServer()).get(path).expect(401));
  it('returns 403 for USER', () => request(app.getHttpServer()).get(path).set('Authorization', 'Bearer user').expect(403));
  it('returns 403 for PROVIDER-only', () => request(app.getHttpServer()).get(path).set('Authorization', 'Bearer provider').expect(403));
  it('allows ADMIN with a minimized response', () => request(app.getHttpServer()).get(path).set('Authorization', 'Bearer admin').expect(200).expect((response) => { expect(response.body.items[0]).toEqual({ id: expect.any(String), email: 'ada@example.test', displayName: 'Ada', status: 'ACTIVE', roles: ['USER'], providerLink: null }); expect(response.body.items[0]).not.toHaveProperty('credential'); expect(response.body.items[0]).not.toHaveProperty('sessions'); }));
  it('allows OPERATIONS', () => request(app.getHttpServer()).get(path).set('Authorization', 'Bearer operations').expect(200));
  it('rejects enumeration-style short queries', () => request(app.getHttpServer()).get('/api/v1/admin/users/search?q=a').set('Authorization', 'Bearer admin').expect(400));
});
