import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { MeClinicalOrdersController, ProviderClinicalOrdersController } from '../src/clinical-orders/clinical-orders.controller';
import { ClinicalOrdersService } from '../src/clinical-orders/clinical-orders.service';
import { UserRole } from '../src/users/enums/user-role.enum';

describe('Direct clinical requests (e2e)', () => {
  let app: INestApplication;
  const service: any = {
    lookupDirectPatient: jest.fn().mockResolvedValue({ patientReference: 'SCP-ABCD-1234', displayName: 'Adaeze O.' }),
    createDirect: jest.fn().mockResolvedValue({ reference: 'SC-ORD-ABCDEF123456', origin: 'DIRECT' }),
    listDirect: jest.fn().mockResolvedValue({ items: [] }),
    respondMine: jest.fn().mockResolvedValue({ reference: 'SC-ORD-ABCDEF123456' }),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProviderClinicalOrdersController, MeClinicalOrdersController],
      providers: [RolesGuard, Reflector, { provide: ClinicalOrdersService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          const req = context.switchToHttp().getRequest();
          const token = req.headers.authorization?.replace('Bearer ', '');
          if (!token) throw new UnauthorizedException();
          req.user = { id: `${token}-user`, roles: token === 'provider' ? [UserRole.PROVIDER] : [UserRole.USER] };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });
  afterAll(() => app.close());

  it('lets providers look up a normalised SmartClinic ID, and nobody else', async () => {
    const url = '/api/v1/provider/direct-orders/patient-lookup?patientReference=%20scp-abcd-1234%20';
    await request(app.getHttpServer()).get(url).set('Authorization', 'Bearer patient').expect(403);
    await request(app.getHttpServer()).get(url).set('Authorization', 'Bearer provider').expect(200);
    expect(service.lookupDirectPatient).toHaveBeenCalledWith(expect.objectContaining({ id: 'provider-user' }), 'SCP-ABCD-1234');
    await request(app.getHttpServer()).get('/api/v1/provider/direct-orders/patient-lookup?patientReference=12345').set('Authorization', 'Bearer provider').expect(400);
  });

  it('validates the request body and strips unknown fields', async () => {
    const url = '/api/v1/provider/direct-orders';
    await request(app.getHttpServer())
      .post(url)
      .set('Authorization', 'Bearer provider')
      .send({ patientReference: 'SCP-ABCD-1234', type: 'PRESCRIPTION', diagnosticItems: [{ name: 'FBC' }] })
      .expect(400);
    await request(app.getHttpServer())
      .post(url)
      .set('Authorization', 'Bearer provider')
      .send({ patientReference: 'SCP-ABCD-1234', type: 'REFERRAL', diagnosticItems: [{ name: 'FBC' }] })
      .expect(400);
    await request(app.getHttpServer())
      .post(url)
      .set('Authorization', 'Bearer provider')
      .send({ patientReference: 'SCP-ABCD-1234', type: 'LABORATORY', diagnosticItems: [{ name: 'Full blood count' }], patientId: 'spoof' })
      .expect(201);
    expect(service.createDirect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'provider-user' }),
      expect.not.objectContaining({ patientId: 'spoof' }),
    );
    await request(app.getHttpServer()).post(url).set('Authorization', 'Bearer patient').send({}).expect(403);
  });

  it('lets only patients approve or decline', async () => {
    const approve = '/api/v1/me/clinical-orders/SC-ORD-ABCDEF123456/approve';
    await request(app.getHttpServer()).post(approve).set('Authorization', 'Bearer provider').expect(403);
    await request(app.getHttpServer()).post(approve).set('Authorization', 'Bearer patient').expect(201);
    await request(app.getHttpServer()).post('/api/v1/me/clinical-orders/SC-ORD-ABCDEF123456/decline').set('Authorization', 'Bearer patient').expect(201);
    expect(service.respondMine.mock.calls.map((call: any[]) => call[2])).toEqual(['APPROVED', 'DECLINED']);
  });
});
