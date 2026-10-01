import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { ProviderTeamController, PublicTeamInvitationsController, TeamInvitationsController } from '../src/providers/provider-team.controller';
import { ProviderTeamService } from '../src/providers/provider-team.service';
import { UserRole } from '../src/users/enums/user-role.enum';

describe('Provider team (e2e)', () => {
  let app: INestApplication;
  const token = 'A'.repeat(43);
  const service: any = {
    me: jest.fn().mockResolvedValue({ role: 'DOCTOR' }),
    list: jest.fn().mockResolvedValue({ items: [] }),
    invite: jest.fn().mockResolvedValue({ deliveryStatus: 'SENT' }),
    inspect: jest.fn().mockResolvedValue({ providerDisplayName: 'Lagoon Hospital' }),
    accept: jest.fn().mockResolvedValue({ role: 'DOCTOR' }),
    remove: jest.fn().mockResolvedValue({ removed: true }),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProviderTeamController, PublicTeamInvitationsController, TeamInvitationsController],
      providers: [RolesGuard, Reflector, { provide: ProviderTeamService, useValue: service }],
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

  it('keeps team management for provider accounts, with validated input', async () => {
    await request(app.getHttpServer()).get('/api/v1/provider/team/me').set('Authorization', 'Bearer patient').expect(403);
    await request(app.getHttpServer()).get('/api/v1/provider/team/me').set('Authorization', 'Bearer provider').expect(200);
    await request(app.getHttpServer()).post('/api/v1/provider/team/invitations').set('Authorization', 'Bearer provider').send({ email: 'not-an-email', role: 'DOCTOR' }).expect(400);
    await request(app.getHttpServer()).post('/api/v1/provider/team/invitations').set('Authorization', 'Bearer provider').send({ email: 'x@y.ng', role: 'SURGEON' }).expect(400);
    await request(app.getHttpServer()).post('/api/v1/provider/team/invitations').set('Authorization', 'Bearer provider').send({ email: ' Ngozi@Lagoon.NG ', role: 'LAB_SCIENTIST' }).expect(201);
    expect(service.invite).toHaveBeenCalledWith(expect.anything(), { email: 'ngozi@lagoon.ng', role: 'LAB_SCIENTIST' });
    await request(app.getHttpServer()).delete('/api/v1/provider/team/not-a-uuid').set('Authorization', 'Bearer provider').expect(400);
  });

  it('lets anyone preview an invitation but only signed-in people accept it', async () => {
    await request(app.getHttpServer()).get(`/api/v1/public/team-invitations/${token}`).expect(200);
    await request(app.getHttpServer()).get('/api/v1/public/team-invitations/short').expect(400);
    await request(app.getHttpServer()).post(`/api/v1/team-invitations/${token}/accept`).expect(401);
    await request(app.getHttpServer()).post(`/api/v1/team-invitations/${token}/accept`).set('Authorization', 'Bearer patient').expect(200);
    expect(service.accept).toHaveBeenCalledWith(expect.objectContaining({ id: 'patient-user' }), token);
  });
});
