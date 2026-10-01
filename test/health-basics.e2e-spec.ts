import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { PatientHealthBasicsController } from '../src/patients/patient-health-basics.controller';
import { PatientHealthBasicsService } from '../src/patients/patient-health-basics.service';
import { UserRole } from '../src/users/enums/user-role.enum';

describe('Health basics routes (e2e)', () => {
  let app: INestApplication;
  const service = { get: jest.fn().mockResolvedValue({ source: 'SELF_REPORTED' }), update: jest.fn().mockResolvedValue({ source: 'SELF_REPORTED' }) };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PatientHealthBasicsController],
      providers: [RolesGuard, Reflector, { provide: PatientHealthBasicsService, useValue: service }],
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

  const route = '/api/v1/me/health-basics';

  it('is patient-only', async () => {
    await request(app.getHttpServer()).get(route).expect(401);
    await request(app.getHttpServer()).get(route).set('Authorization', 'Bearer provider').expect(403);
    await request(app.getHttpServer()).get(route).set('Authorization', 'Bearer patient').expect(200);
  });

  it('accepts valid basics, trims text and turns blanks into cleared fields', async () => {
    await request(app.getHttpServer())
      .put(route)
      .set('Authorization', 'Bearer patient')
      .send({ bloodGroup: 'AB-', genotype: 'SS', allergies: '  Penicillin  ', conditions: '   ', emergencyContactPhone: '+234 801 234 5678' })
      .expect(200);
    expect(service.update).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-id' }), {
      bloodGroup: 'AB-',
      genotype: 'SS',
      allergies: 'Penicillin',
      conditions: null,
      emergencyContactPhone: '+234 801 234 5678',
    });
  });

  it('rejects unknown values and fields', async () => {
    for (const body of [{ bloodGroup: 'Z+' }, { genotype: 'XY' }, { emergencyContactPhone: 'call me' }, { allergies: 'x'.repeat(501) }, { patientId: 'spoof' }]) {
      await request(app.getHttpServer()).put(route).set('Authorization', 'Bearer patient').send(body).expect(400);
    }
    expect(service.update).not.toHaveBeenCalled();
  });
});
