import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { ProviderHealthCheckEncountersController } from '../src/health-checks/provider-health-check-encounters.controller';
import { ProviderHealthCheckEncountersService } from '../src/health-checks/provider-health-check-encounters.service';
import { UserRole } from '../src/users/enums/user-role.enum';

describe('Provider health-check encounter HTTP boundary (e2e)', () => {
  let app: INestApplication;
  const reference = 'SC-2026-7F23B0C9D1E4';
  const response = { bookingReference: reference, status: 'IN_PROGRESS', startedAt: new Date('2026-08-18T10:00:00Z'), completedAt: null, participant: { givenName: 'Ada', familyName: 'Okafor' }, healthCheckPackage: { code: 'ESSENTIAL', name: 'Essential' }, fulfilmentMode: { code: 'HOME_VISIT', name: 'Home Visit' }, measurements: [] };
  const service = { start: jest.fn().mockResolvedValue(response), get: jest.fn().mockResolvedValue(response), saveMeasurements: jest.fn().mockResolvedValue(response), complete: jest.fn().mockResolvedValue({ ...response, status: 'COMPLETED', completedAt: new Date('2026-08-18T10:30:00Z') }) };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [ProviderHealthCheckEncountersController], providers: [RolesGuard, Reflector, { provide: ProviderHealthCheckEncountersService, useValue: service }] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: any) => { const req = context.switchToHttp().getRequest(); const auth = req.headers.authorization; if (!auth) throw new UnauthorizedException(); req.user = { id: 'user-1', roles: auth === 'Bearer provider' ? [UserRole.PROVIDER] : auth === 'Bearer admin-provider' ? [UserRole.ADMIN, UserRole.PROVIDER] : auth === 'Bearer admin' ? [UserRole.ADMIN] : auth === 'Bearer operations' ? [UserRole.OPERATIONS] : [UserRole.USER] }; return true; } }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })); await app.init();
  });
  afterAll(async () => app.close());
  const path = `/api/v1/provider/bookings/${reference}/health-check`;
  it('denies unauthenticated, USER, ADMIN-only, and OPERATIONS-only callers', async () => { await request(app.getHttpServer()).post(`${path}/start`).expect(401); for (const role of ['user', 'admin', 'operations']) await request(app.getHttpServer()).post(`${path}/start`).set('Authorization', `Bearer ${role}`).expect(403); });
  it('allows a PROVIDER and derives provider identity from the authenticated user', () => request(app.getHttpServer()).post(`${path}/start`).set('Authorization', 'Bearer provider').expect(200).expect((result) => { expect(result.body.bookingReference).toBe(reference); expect(service.start).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }), reference); }));
  it('allows GET and returns only the safe encounter projection', () => request(app.getHttpServer()).get(path).set('Authorization', 'Bearer provider').expect(200).expect((result) => { expect(result.body.participant).toEqual({ givenName: 'Ada', familyName: 'Okafor' }); expect(result.body).not.toHaveProperty('funding'); expect(result.body).not.toHaveProperty('providerId'); expect(result.body).not.toHaveProperty('history'); }));
  it('validates and saves all six measurements', () => request(app.getHttpServer()).put(`${path}/measurements`).set('Authorization', 'Bearer provider').send({ bloodPressure: { systolic: 120, diastolic: 80 }, bloodGlucose: { value: 95 }, bmi: { value: 24.2 }, temperature: { value: 36.8 }, oxygenSaturation: { value: 98 }, pulse: { value: 72 } }).expect(200));
  it('rejects incomplete measurement payloads', () => request(app.getHttpServer()).put(`${path}/measurements`).set('Authorization', 'Bearer provider').send({ bloodPressure: { systolic: 120 } }).expect(400));
  it('completes through the provider-only boundary', () => request(app.getHttpServer()).post(`${path}/complete`).set('Authorization', 'Bearer provider').expect(200).expect((result) => expect(result.body.status).toBe('COMPLETED')));
});
