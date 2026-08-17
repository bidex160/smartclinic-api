import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { AdminProviderCapabilitiesController } from '../src/providers/admin-provider-capabilities.controller';
import { AdminProviderLocationsController } from '../src/providers/admin-provider-locations.controller';
import { ProviderCapabilitiesService } from '../src/providers/provider-capabilities.service';
import { UserRole } from '../src/users/enums/user-role.enum';

describe('Admin provider capabilities (e2e)', () => {
  let app: INestApplication;
  const providerId = '10000000-0000-4000-8000-000000000001';
  beforeAll(async () => {
    const service = { listServices: jest.fn().mockResolvedValue([]), listLocations: jest.fn().mockResolvedValue([]), getService: jest.fn(), createService: jest.fn(), activateService: jest.fn(), deactivateService: jest.fn(), linkLocation: jest.fn(), unlinkLocation: jest.fn(), getLocation: jest.fn(), createLocation: jest.fn(), updateLocation: jest.fn(), activateLocation: jest.fn(), deactivateLocation: jest.fn() };
    const module = await Test.createTestingModule({ controllers: [AdminProviderCapabilitiesController, AdminProviderLocationsController], providers: [RolesGuard, Reflector, { provide: ProviderCapabilitiesService, useValue: service }] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: any) => { const req = context.switchToHttp().getRequest(); const token = req.headers.authorization; if (!token) throw new UnauthorizedException(); req.user = { roles: token === 'Bearer admin' ? [UserRole.ADMIN] : token === 'Bearer operations' ? [UserRole.OPERATIONS] : [UserRole.USER] }; return true; } }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true })); await app.init();
  });
  afterAll(async () => app.close());
  const path = `/api/v1/admin/providers/${providerId}/services`;
  it('returns 401 without authentication', () => request(app.getHttpServer()).get(path).expect(401));
  it('returns 403 for USER', () => request(app.getHttpServer()).get(path).set('Authorization', 'Bearer user').expect(403));
  it('allows ADMIN', () => request(app.getHttpServer()).get(path).set('Authorization', 'Bearer admin').expect(200).expect([]));
  it('allows OPERATIONS', () => request(app.getHttpServer()).get(path).set('Authorization', 'Bearer operations').expect(200).expect([]));
});
