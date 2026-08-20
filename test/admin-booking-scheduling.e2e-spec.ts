import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { BookingStatus } from '../src/bookings/enums/booking-status.enum';
import { AdminBookingSchedulingController } from '../src/providers/admin-booking-scheduling.controller';
import { AdminBookingSchedulingService } from '../src/providers/admin-booking-scheduling.service';
import { ProviderAssignmentStatus } from '../src/providers/enums/provider-assignment-status.enum';
import { UserRole } from '../src/users/enums/user-role.enum';

describe('Admin booking scheduling authorization (e2e)', () => {
  let app: INestApplication;
  const reference = 'SC-2026-ABCDEF123456';
  const scheduling = {
    schedule: jest.fn().mockResolvedValue({
      bookingReference: reference,
      bookingStatus: BookingStatus.SCHEDULED,
      scheduledDate: '2026-08-25',
      scheduledTimeFrom: '09:00',
      scheduledTimeTo: '10:00',
      scheduledTimezone: 'Africa/Lagos',
      provider: { displayName: 'SmartClinic Ikeja' },
      providerLocation: null,
      assignmentStatus: ProviderAssignmentStatus.CONFIRMED,
    }),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AdminBookingSchedulingController],
      providers: [
        RolesGuard,
        Reflector,
        { provide: AdminBookingSchedulingService, useValue: scheduling },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          const req = context.switchToHttp().getRequest();
          const token = req.headers.authorization;
          if (!token) throw new UnauthorizedException();
          req.user = {
            id: '40000000-0000-4000-8000-000000000001',
            roles:
              token === 'Bearer admin'
                ? [UserRole.ADMIN]
                : token === 'Bearer operations'
                  ? [UserRole.OPERATIONS]
                  : token === 'Bearer provider'
                    ? [UserRole.PROVIDER]
                    : [UserRole.USER],
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => app.close());

  const path = `/api/v1/admin/bookings/${reference}/schedule`;
  const body = {
    date: '2026-08-25',
    timeFrom: '09:00',
    timeTo: '10:00',
    timezone: 'Africa/Lagos',
  };

  it('returns 401 without authentication', () =>
    request(app.getHttpServer()).post(path).send(body).expect(401));

  it.each(['user', 'provider'])('returns 403 for %s', (role) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${role}`)
      .send(body)
      .expect(403));

  it.each(['admin', 'operations'])('allows %s', (role) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${role}`)
      .send(body)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          bookingReference: reference,
          bookingStatus: BookingStatus.SCHEDULED,
        });
      }));

  it('validates confirmed schedule input', () =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', 'Bearer admin')
      .send({ ...body, timezone: 'Lagos' })
      .expect(400));
});
