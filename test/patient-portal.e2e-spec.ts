import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { MeHealthCheckBookingsController } from '../src/bookings/me-health-check-bookings.controller';
import { BookingsService } from '../src/bookings/bookings.service';
import { HealthResultAccessService } from '../src/health-checks/health-result-access.service';
import { MeHealthResultsController } from '../src/health-checks/me-health-results.controller';
import { MePatientProfileController } from '../src/health-checks/me-patient-profile.controller';
import { PatientHealthCheckHistoryService } from '../src/health-checks/patient-health-check-history.service';
import { PatientPortalProfileService } from '../src/health-checks/patient-portal-profile.service';
import { UserRole } from '../src/users/enums/user-role.enum';

describe('Patient portal HTTP boundary (e2e)', () => {
  let app: INestApplication;
  const reference = 'SC-2026-ABCDEF123456';
  const profile = { get: jest.fn().mockResolvedValue({ user: { displayName: 'Ada Okafor', email: 'ada@example.test' }, patient: { patientReference: 'SCP-8K4M-27QD', givenName: 'Ada', familyName: 'Okafor', phone: null } }) };
  const history = { list: jest.fn().mockResolvedValue({ items: [], page: 1, limit: 20, total: 0, totalPages: 0 }), get: jest.fn().mockResolvedValue({ bookingReference: reference, portalCategory: 'AWAITING_PAYMENT', fundingStatus: 'PENDING' }) };
  const bookings = { createSelf: jest.fn().mockResolvedValue({ bookingReference: reference, status: 'DRAFT' }) };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [MePatientProfileController, MeHealthResultsController, MeHealthCheckBookingsController], providers: [RolesGuard, Reflector, { provide: PatientPortalProfileService, useValue: profile }, { provide: PatientHealthCheckHistoryService, useValue: history }, { provide: HealthResultAccessService, useValue: { getRegisteredResult: jest.fn() } }, { provide: BookingsService, useValue: bookings }] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: any) => { const req = context.switchToHttp().getRequest(); const token = req.headers.authorization?.replace('Bearer ', ''); if (!token) throw new UnauthorizedException(); req.user = { id: 'user-a', roles: token === 'user' ? [UserRole.USER] : token === 'multi' ? [UserRole.USER, UserRole.ADMIN] : token === 'provider' ? [UserRole.PROVIDER] : [UserRole.ADMIN] }; return true; } }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
  });
  afterAll(() => app.close());
  it('returns the SELF Patient profile only to authenticated USER authority', async () => { await request(app.getHttpServer()).get('/api/v1/me/profile').expect(401); await request(app.getHttpServer()).get('/api/v1/me/profile').set('Authorization', 'Bearer provider').expect(403); await request(app.getHttpServer()).get('/api/v1/me/profile').set('Authorization', 'Bearer user').expect(200).expect((response) => expect(response.body.patient.patientReference).toBe('SCP-8K4M-27QD')); });
  it('gets detail through authenticated identity without accepting Patient/User IDs', async () => { await request(app.getHttpServer()).get(`/api/v1/me/health-checks/${reference}`).set('Authorization', 'Bearer user').expect(200); expect(history.get).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-a' }), reference); });
  it('creates self bookings without client-controlled ownership identifiers', async () => { const body = { healthCheckPackageId: '10000000-0000-4000-8000-000000000001', fulfilmentModeId: '20000000-0000-4000-8000-000000000001', preferredDate: '2026-09-01', preferredTimeWindowStart: '09:00', preferredTimezone: 'Africa/Lagos' }; await request(app.getHttpServer()).post('/api/v1/me/health-checks').set('Authorization', 'Bearer user').send({ ...body, participantPatientId: '30000000-0000-4000-8000-000000000001' }).expect(400); await request(app.getHttpServer()).post('/api/v1/me/health-checks').set('Authorization', 'Bearer user').send(body).expect(201); expect(bookings.createSelf).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-a' }), expect.not.objectContaining({ participantPatientId: expect.anything(), bookerUserId: expect.anything() })); });
});
