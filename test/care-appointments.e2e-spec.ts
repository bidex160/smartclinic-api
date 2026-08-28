import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { MeCareAppointmentsController, ProviderCareAppointmentsController } from '../src/care-appointments/care-appointments.controller';
import { CareAppointmentsService } from '../src/care-appointments/care-appointments.service';
import { generateCareRequestReference } from '../src/care-requests/care-request-reference';
import { generateCareAppointmentReference } from '../src/care-appointments/care-appointment-reference';
import { UserRole } from '../src/users/enums/user-role.enum';

describe('Care Appointment API boundaries (e2e)', () => {
  let app: INestApplication;
  const careReference = generateCareRequestReference(); const appointmentReference = generateCareAppointmentReference();
  const scheduling = { scheduledDate: '2099-09-10', scheduledTimeFrom: '10:30', scheduledTimeTo: '11:00', timezone: 'Africa/Lagos', providerLocationReference: 'SCPL-ABCDEF0123456789' };
  const service = { schedule: jest.fn().mockResolvedValue({ appointmentReference }), listProvider: jest.fn().mockResolvedValue({ items: [] }), getProvider: jest.fn().mockResolvedValue({ appointmentReference }), updateMeetingLink: jest.fn().mockResolvedValue({ appointmentReference, meetingUrl: 'https://meet.google.com/abc-defg-hij' }), start: jest.fn(), complete: jest.fn(), cancelProvider: jest.fn(), noShow: jest.fn(), listMine: jest.fn().mockResolvedValue({ items: [] }), getMine: jest.fn().mockResolvedValue({ appointmentReference }), cancelMine: jest.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [ProviderCareAppointmentsController, MeCareAppointmentsController], providers: [RolesGuard, Reflector, { provide: CareAppointmentsService, useValue: service }] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: any) => { const req = context.switchToHttp().getRequest(); const token = req.headers.authorization?.replace('Bearer ', ''); if (!token) throw new UnauthorizedException(); const role = token === 'provider' ? UserRole.PROVIDER : UserRole.USER; req.user = { id: `${token}-user`, roles: [role] }; return true; } }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
  });

  it('validates the provider-owned external meeting-link command at the boundary', async () => {
    const url = 'https://meet.google.com/abc-defg-hij';
    await request(app.getHttpServer()).put(`/api/v1/provider/care-appointments/${appointmentReference}/meeting-link`).send({ meetingUrl: url }).expect(401);
    await request(app.getHttpServer()).put(`/api/v1/provider/care-appointments/${appointmentReference}/meeting-link`).set('Authorization', 'Bearer user').send({ meetingUrl: url }).expect(403);
    await request(app.getHttpServer()).put(`/api/v1/provider/care-appointments/${appointmentReference}/meeting-link`).set('Authorization', 'Bearer provider').send({ meetingUrl: 'http://example.test/room' }).expect(400);
    await request(app.getHttpServer()).put(`/api/v1/provider/care-appointments/${appointmentReference}/meeting-link`).set('Authorization', 'Bearer provider').send({ meetingUrl: 'not-a-url' }).expect(400);
    await request(app.getHttpServer()).put(`/api/v1/provider/care-appointments/${appointmentReference}/meeting-link`).set('Authorization', 'Bearer provider').send({ meetingUrl: url }).expect(200);
    expect(service.updateMeetingLink).toHaveBeenCalledWith(expect.objectContaining({ id: 'provider-user' }), appointmentReference, url);
  });
  afterAll(() => app.close());

  it('allows only PROVIDER to schedule and derives provider ownership from JWT', async () => {
    await request(app.getHttpServer()).post(`/api/v1/provider/care-requests/${careReference}/schedule`).send(scheduling).expect(401);
    await request(app.getHttpServer()).post(`/api/v1/provider/care-requests/${careReference}/schedule`).set('Authorization', 'Bearer user').send(scheduling).expect(403);
    await request(app.getHttpServer()).post(`/api/v1/provider/care-requests/${careReference}/schedule`).set('Authorization', 'Bearer provider').send({ ...scheduling, providerId: 'spoof' }).expect(400);
    await request(app.getHttpServer()).post(`/api/v1/provider/care-requests/${careReference}/schedule`).set('Authorization', 'Bearer provider').send(scheduling).expect(201);
    expect(service.schedule).toHaveBeenCalledWith(expect.objectContaining({ id: 'provider-user' }), careReference, scheduling);
  });

  it('validates time, timezone, location and public references at the boundary', async () => {
    await request(app.getHttpServer()).post(`/api/v1/provider/care-requests/${careReference}/schedule`).set('Authorization', 'Bearer provider').send({ ...scheduling, timezone: 'Lagos' }).expect(400);
    await request(app.getHttpServer()).post(`/api/v1/provider/care-requests/${careReference}/schedule`).set('Authorization', 'Bearer provider').send({ ...scheduling, providerLocationReference: 'bad' }).expect(400);
    await request(app.getHttpServer()).get('/api/v1/provider/care-appointments/not-valid').set('Authorization', 'Bearer provider').expect(400);
  });

  it('separates provider operational commands from patient-owned reads/cancellation', async () => {
    await request(app.getHttpServer()).post(`/api/v1/provider/care-appointments/${appointmentReference}/start`).set('Authorization', 'Bearer provider').expect(201);
    await request(app.getHttpServer()).get(`/api/v1/me/care-appointments/${appointmentReference}`).set('Authorization', 'Bearer user').expect(200);
    await request(app.getHttpServer()).get(`/api/v1/me/care-appointments/${appointmentReference}`).set('Authorization', 'Bearer provider').expect(403);
    await request(app.getHttpServer()).post(`/api/v1/me/care-appointments/${appointmentReference}/cancel`).set('Authorization', 'Bearer user').send({ reason: 'Unable to attend' }).expect(201);
    expect(service.getMine).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-user' }), appointmentReference);
  });
});
