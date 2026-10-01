import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { PatientDailyCheckInsController } from '../src/patients/patient-daily-check-ins.controller';
import { PatientDailyCheckInsService } from '../src/patients/patient-daily-check-ins.service';
import { UserRole } from '../src/users/enums/user-role.enum';

describe('Daily check-in routes (e2e)', () => {
  let app: INestApplication;
  const service = { upsertToday: jest.fn().mockResolvedValue({ streakDays: 1 }), list: jest.fn().mockResolvedValue({ items: [] }) };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PatientDailyCheckInsController],
      providers: [RolesGuard, Reflector, { provide: PatientDailyCheckInsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          const req = context.switchToHttp().getRequest();
          if (!req.headers.authorization) throw new UnauthorizedException();
          const provider = req.headers.authorization === 'Bearer provider';
          req.user = { id: 'user-id', roles: [provider ? UserRole.PROVIDER : UserRole.USER], status: 'ACTIVE', deletedAt: null };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => app.close());
  beforeEach(() => jest.clearAllMocks());

  const route = '/api/v1/me/daily-care/check-ins/today';

  it('is patient-only', async () => {
    await request(app.getHttpServer()).put(route).send({ mood: 3, timezone: 'Africa/Lagos' }).expect(401);
    await request(app.getHttpServer()).put(route).set('Authorization', 'Bearer provider').send({ mood: 3, timezone: 'Africa/Lagos' }).expect(403);
    await request(app.getHttpServer()).put(route).set('Authorization', 'Bearer patient').send({ mood: 3, timezone: 'Africa/Lagos' }).expect(200);
    expect(service.upsertToday).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-id' }), { mood: 3, timezone: 'Africa/Lagos' });
  });

  it('validates scores and rejects unknown fields', async () => {
    for (const body of [
      { mood: 0, timezone: 'Africa/Lagos' },
      { mood: 6, timezone: 'Africa/Lagos' },
      { mood: 3, energy: 9, timezone: 'Africa/Lagos' },
      { mood: 3, timezone: 'Not/AZone' },
      { mood: 3, timezone: 'Africa/Lagos', patientId: 'spoof' },
    ]) {
      await request(app.getHttpServer()).put(route).set('Authorization', 'Bearer patient').send(body).expect(400);
    }
    expect(service.upsertToday).not.toHaveBeenCalled();
  });

  it('lists recent check-ins with a validated timezone', async () => {
    await request(app.getHttpServer()).get('/api/v1/me/daily-care/check-ins?days=14&timezone=Africa/Lagos').set('Authorization', 'Bearer patient').expect(200);
    expect(service.list).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-id' }), 14, 'Africa/Lagos');
    await request(app.getHttpServer()).get('/api/v1/me/daily-care/check-ins?timezone=Nowhere').set('Authorization', 'Bearer patient').expect(400);
  });
});
