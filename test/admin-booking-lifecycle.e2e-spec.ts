import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { AdminBookingLifecycleController } from '../src/bookings/admin-booking-lifecycle.controller';
import { BookingLifecycleService } from '../src/bookings/booking-lifecycle.service';
import { BookingStatus } from '../src/bookings/enums/booking-status.enum';
import { UserRole } from '../src/users/enums/user-role.enum';

describe('Admin booking lifecycle authorization (e2e)', () => {
  let app: INestApplication;
  const reference = 'SC-2026-ABCDEF123456';
  beforeAll(async () => {
    const lifecycle = {
      cancelBooking: jest.fn().mockResolvedValue({ bookingReference: reference, bookingStatus: BookingStatus.CANCELLED, preferredDate: '2026-08-20', preferredTimeFrom: '09:00', preferredTimeTo: '11:00', preferredTimezone: 'Africa/Lagos', cancelledAssignmentCount: 1, releasedReservationCount: 1 }),
      rescheduleBooking: jest.fn().mockResolvedValue({ bookingReference: reference, bookingStatus: BookingStatus.PENDING_PROVIDER_MATCH, preferredDate: '2026-08-28', preferredTimeFrom: '12:00', preferredTimeTo: '14:00', preferredTimezone: 'Africa/Lagos', cancelledAssignmentCount: 1, releasedReservationCount: 1 }),
    };
    const module = await Test.createTestingModule({ controllers: [AdminBookingLifecycleController], providers: [RolesGuard, Reflector, { provide: BookingLifecycleService, useValue: lifecycle }] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: any) => { const req = context.switchToHttp().getRequest(); const token = req.headers.authorization; if (!token) throw new UnauthorizedException(); req.user = { id: '40000000-0000-4000-8000-000000000001', roles: token === 'Bearer admin' ? [UserRole.ADMIN] : token === 'Bearer operations' ? [UserRole.OPERATIONS] : [UserRole.USER] }; return true; } }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true })); await app.init();
  });
  afterAll(async () => app.close());
  const cancel = `/api/v1/admin/bookings/${reference}/cancel`;
  const reschedule = `/api/v1/admin/bookings/${reference}/reschedule`;
  it('returns 401 without authentication', () => request(app.getHttpServer()).post(cancel).send({}).expect(401));
  it('returns 403 for USER', () => request(app.getHttpServer()).post(cancel).set('Authorization', 'Bearer user').send({}).expect(403));
  it('allows ADMIN cancellation', () => request(app.getHttpServer()).post(cancel).set('Authorization', 'Bearer admin').send({ reason: 'Requested' }).expect(200).expect((r) => expect(r.body.bookingStatus).toBe('CANCELLED')));
  it('allows OPERATIONS rescheduling', () => request(app.getHttpServer()).post(reschedule).set('Authorization', 'Bearer operations').send({ preferredDate: '2026-08-28', preferredTimeFrom: '12:00', preferredTimeTo: '14:00', preferredTimezone: 'Africa/Lagos' }).expect(200).expect((r) => expect(r.body.bookingStatus).toBe('PENDING_PROVIDER_MATCH')));
  it('validates reschedule input', () => request(app.getHttpServer()).post(reschedule).set('Authorization', 'Bearer admin').send({ preferredDate: '2026-08-28', preferredTimeFrom: '14:00', preferredTimeTo: '12:00', preferredTimezone: 'Lagos' }).expect(400));
});
