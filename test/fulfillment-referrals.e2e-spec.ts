import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { ProviderOrderFulfillmentsController } from '../src/clinical-orders/clinical-order-fulfillments.controller';
import { ClinicalOrderFulfillmentsService } from '../src/clinical-orders/clinical-order-fulfillments.service';
import { UserRole } from '../src/users/enums/user-role.enum';

describe('Referring requests between providers (e2e)', () => {
  let app: INestApplication;
  const service: any = {
    referOnward: jest.fn().mockResolvedValue({ reference: 'SC-ORF-NEW' }),
    listReferredOut: jest.fn().mockResolvedValue({ items: [] }),
    getAssigned: jest.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProviderOrderFulfillmentsController],
      providers: [RolesGuard, Reflector, { provide: ClinicalOrderFulfillmentsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          const req = context.switchToHttp().getRequest();
          const auth = req.headers.authorization?.replace('Bearer ', '');
          if (!auth) throw new UnauthorizedException();
          req.user = { id: `${auth}-user`, roles: auth === 'provider' ? [UserRole.PROVIDER] : [UserRole.USER] };
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

  it('lets only providers refer a request on, with a valid destination', async () => {
    const url = '/api/v1/provider/order-fulfillments/SC-ORF-ABCDEF123456/refer-onward';
    await request(app.getHttpServer()).post(url).set('Authorization', 'Bearer patient').send({}).expect(403);
    await request(app.getHttpServer()).post(url).set('Authorization', 'Bearer provider').send({ providerServiceUnitReference: 'nope' }).expect(400);
    await request(app.getHttpServer()).post(url).set('Authorization', 'Bearer provider').send({ providerServiceUnitReference: 'nope', note: 'x'.repeat(501) }).expect(400);
  });

  it('lists what a provider referred out', async () => {
    await request(app.getHttpServer()).get('/api/v1/provider/referred-out-fulfillments?orderType=LABORATORY').set('Authorization', 'Bearer provider').expect(200);
    expect(service.listReferredOut).toHaveBeenCalledWith(expect.objectContaining({ id: 'provider-user' }), expect.objectContaining({ orderType: 'LABORATORY', page: 1, limit: 20 }));
  });
});
