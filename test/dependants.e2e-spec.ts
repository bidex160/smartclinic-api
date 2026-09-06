import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { MeDependantsController } from '../src/patients/dependants.controller';
import { DependantsService } from '../src/patients/dependants.service';
import { UserRole } from '../src/users/enums/user-role.enum';

describe('Dependants routes (e2e)', () => {
  let app: INestApplication; const dependants = { create: jest.fn(), list: jest.fn(), get: jest.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [MeDependantsController], providers: [RolesGuard, Reflector, { provide: DependantsService, useValue: dependants }] })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: any) => { const req = context.switchToHttp().getRequest(); if (!req.headers.authorization) throw new UnauthorizedException(); req.user = { id: 'user-id', roles: [UserRole.USER], status: 'ACTIVE', deletedAt: null }; return true; } }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
  });
  afterAll(async () => app.close()); beforeEach(() => jest.clearAllMocks());
  const body = { firstName: 'Aisha', lastName: 'Okafor', dateOfBirth: '2015-06-12', relationshipType: 'MOTHER', countryCode: 'NG', stateOrRegion: 'Lagos', city: 'Ikeja' };
  it('requires authentication and accepts the demographic-only contract', async () => {
    await request(app.getHttpServer()).post('/api/v1/me/dependants').send(body).expect(401);
    dependants.create.mockResolvedValue({ patientReference: 'SCP-AB12-CD34' });
    await request(app.getHttpServer()).post('/api/v1/me/dependants').set('Authorization', 'Bearer user').send(body).expect(201);
    expect(dependants.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-id' }), expect.objectContaining(body));
  });
  it('rejects attempts to select a guardian, creator, reward recipient, User, or credential', async () => {
    for (const field of ['guardianUserId', 'createdByUserId', 'rewardRecipientUserId', 'userId', 'email', 'phone', 'password']) {
      await request(app.getHttpServer()).post('/api/v1/me/dependants').set('Authorization', 'Bearer user').send({ ...body, [field]: 'spoof' }).expect(400);
    }
    expect(dependants.create).not.toHaveBeenCalled();
  });
});
