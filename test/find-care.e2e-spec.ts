import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { AdminCareServicesController, ProviderCareServicesController, PublicFindCareController } from '../src/providers/provider-care-services.controller';
import { ProviderCareServicesService } from '../src/providers/provider-care-services.service';
import { FindCareService } from '../src/providers/find-care.service';
import { UserRole } from '../src/users/enums/user-role.enum';
import { CareDeliveryMode } from '../src/providers/enums/care-delivery-mode.enum';

describe('Find Care API authorization (e2e)', () => {
  let app: INestApplication;
  const definitionId = '20000000-0000-4000-8000-000000000001';
  const serviceId = '30000000-0000-4000-8000-000000000001';
  const providerId = '10000000-0000-4000-8000-000000000001';
  const findCare = { catalogue: jest.fn().mockResolvedValue([]), providersList: jest.fn().mockResolvedValue({ items: [], page: 1, limit: 20, total: 0, totalPages: 0 }), providerDetail: jest.fn().mockResolvedValue({ providerReference: 'SCPR-ABCDEF0123456789' }) };
  const services = { listDefinitions: jest.fn().mockResolvedValue([]), listMine: jest.fn().mockResolvedValue([]), createMine: jest.fn().mockResolvedValue({ id: serviceId }), updateMine: jest.fn(), activateMine: jest.fn(), deactivateMine: jest.fn(), createDefinition: jest.fn().mockResolvedValue({ id: definitionId }), updateDefinition: jest.fn(), listForProvider: jest.fn().mockResolvedValue([]), createForProvider: jest.fn().mockResolvedValue({ id: serviceId }), updateForProvider: jest.fn(), setActive: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [PublicFindCareController, ProviderCareServicesController, AdminCareServicesController], providers: [RolesGuard, Reflector, { provide: FindCareService, useValue: findCare }, { provide: ProviderCareServicesService, useValue: services }] })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: any) => { const req = context.switchToHttp().getRequest(); const token = req.headers.authorization?.replace('Bearer ', ''); if (!token) throw new UnauthorizedException(); const role = token === 'admin' ? UserRole.ADMIN : token === 'operations' ? UserRole.OPERATIONS : token === 'provider' ? UserRole.PROVIDER : UserRole.USER; req.user = { id: `${token}-user`, roles: [role] }; return true; } }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true })); await app.init();
  });
  afterAll(() => app.close());

  it('allows anonymous discovery with validated filters', async () => {
    await request(app.getHttpServer()).get('/api/v1/public/find-care/services').expect(200);
    await request(app.getHttpServer()).get('/api/v1/public/find-care/providers?serviceCode=GENERAL_CONSULTATION&deliveryMode=VIRTUAL&limit=50').expect(200);
    expect(findCare.providersList).toHaveBeenCalledWith(expect.objectContaining({ deliveryMode: CareDeliveryMode.VIRTUAL }));
    await request(app.getHttpServer()).get('/api/v1/public/find-care/providers/SCPR-ABCDEF0123456789').expect(200);
    await request(app.getHttpServer()).get('/api/v1/public/find-care/providers?countryCode=NIGERIA').expect(400);
    await request(app.getHttpServer()).get('/api/v1/public/find-care/providers?deliveryMode=REMOTE').expect(400);
  });

  it('requires PROVIDER and derives service ownership from JWT context', async () => {
    const body = { careServiceDefinitionId: definitionId, deliveryOptions: [{ deliveryMode: CareDeliveryMode.IN_PERSON, priceMinor: 250000, currency: 'NGN' }, { deliveryMode: CareDeliveryMode.VIRTUAL, priceMinor: 180000, currency: 'NGN' }] };
    await request(app.getHttpServer()).post('/api/v1/provider/care-services').send(body).expect(401);
    await request(app.getHttpServer()).post('/api/v1/provider/care-services').set('Authorization', 'Bearer user').send(body).expect(403);
    await request(app.getHttpServer()).post('/api/v1/provider/care-services').set('Authorization', 'Bearer provider').send({ ...body, providerId: 'spoofed', isActive: false }).expect(201);
    expect(services.createMine).toHaveBeenCalledWith(expect.objectContaining({ id: 'provider-user' }), body);
    await request(app.getHttpServer()).post('/api/v1/provider/care-services').set('Authorization', 'Bearer provider').send({ ...body, deliveryOptions: [] }).expect(400);
    await request(app.getHttpServer()).post('/api/v1/provider/care-services').set('Authorization', 'Bearer provider').send({ ...body, deliveryOptions: [{ deliveryMode: 'VIRTUAL', priceMinor: -1, currency: 'NGN' }] }).expect(400);
    await request(app.getHttpServer()).post('/api/v1/provider/care-services').set('Authorization', 'Bearer provider').send({ ...body, deliveryOptions: [body.deliveryOptions[0], body.deliveryOptions[0]] }).expect(400);
  });

  it('keeps provider-owned update and activation commands on the same offering contract', async () => {
    const deliveryOptions = [{ deliveryMode: CareDeliveryMode.VIRTUAL, priceMinor: 2000000, currency: 'NGN' }];
    await request(app.getHttpServer()).patch(`/api/v1/provider/care-services/${serviceId}`).set('Authorization', 'Bearer provider').send({ deliveryOptions }).expect(200);
    await request(app.getHttpServer()).patch(`/api/v1/provider/care-services/${serviceId}/deactivate`).set('Authorization', 'Bearer provider').expect(200);
    await request(app.getHttpServer()).patch(`/api/v1/provider/care-services/${serviceId}/activate`).set('Authorization', 'Bearer provider').expect(200);
    expect(services.updateMine).toHaveBeenCalledWith(expect.objectContaining({ id: 'provider-user' }), serviceId, { deliveryOptions });
    expect(services.deactivateMine).toHaveBeenCalledWith(expect.objectContaining({ id: 'provider-user' }), serviceId);
    expect(services.activateMine).toHaveBeenCalledWith(expect.objectContaining({ id: 'provider-user' }), serviceId);
  });

  it('allows ADMIN/OPERATIONS catalogue and support management only', async () => {
    const definition = { code: 'GENERAL_CONSULTATION', name: 'General consultation' };
    await request(app.getHttpServer()).post('/api/v1/admin/care-service-definitions').set('Authorization', 'Bearer provider').send(definition).expect(403);
    for (const token of ['admin', 'operations']) await request(app.getHttpServer()).post('/api/v1/admin/care-service-definitions').set('Authorization', `Bearer ${token}`).send(definition).expect(201);
    const deliveryOptions = [{ deliveryMode: CareDeliveryMode.IN_PERSON, priceMinor: 250000, currency: 'NGN' }];
    await request(app.getHttpServer()).post(`/api/v1/admin/providers/${providerId}/care-services`).set('Authorization', 'Bearer admin').send({ careServiceDefinitionId: definitionId, deliveryOptions }).expect(201);
    expect(services.createForProvider).toHaveBeenCalledWith(providerId, { careServiceDefinitionId: definitionId, deliveryOptions });
  });
});
