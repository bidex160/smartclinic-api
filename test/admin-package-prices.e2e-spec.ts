import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { AdminPackagePricesController } from '../src/health-checks/admin-package-prices.controller';
import { PackagePricesService } from '../src/health-checks/package-prices.service';
import { UserRole } from '../src/users/enums/user-role.enum';

describe('Admin package prices (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const service = { findAll: jest.fn().mockResolvedValue([]), findOne: jest.fn(), create: jest.fn(), schedule: jest.fn(), deactivate: jest.fn() };
    const module = await Test.createTestingModule({ controllers: [AdminPackagePricesController], providers: [RolesGuard, Reflector, { provide: PackagePricesService, useValue: service }] })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: any) => { const request = context.switchToHttp().getRequest(); const token = request.headers.authorization; if (!token) throw new UnauthorizedException(); request.user = { roles: token === 'Bearer admin' ? [UserRole.ADMIN] : token === 'Bearer operations' ? [UserRole.OPERATIONS] : [UserRole.USER] }; return true; } }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1'); await app.init();
  });
  afterAll(async () => app?.close());
  it('rejects unauthenticated requests', () => request(app.getHttpServer()).get('/api/v1/admin/package-prices').expect(401));
  it('rejects regular USER requests', () => request(app.getHttpServer()).get('/api/v1/admin/package-prices').set('Authorization', 'Bearer user').expect(403));
  it('allows ADMIN requests', () => request(app.getHttpServer()).get('/api/v1/admin/package-prices').set('Authorization', 'Bearer admin').expect(200).expect([]));
  it('allows OPERATIONS requests', () => request(app.getHttpServer()).get('/api/v1/admin/package-prices').set('Authorization', 'Bearer operations').expect(200).expect([]));
});
