import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { MeClinicalRecordsController, ProviderClinicalRecordsController } from '../src/clinical-records/clinical-records.controller';
import { ClinicalRecordsService } from '../src/clinical-records/clinical-records.service';
import { ClinicalRecordStatus } from '../src/clinical-records/enums/clinical-record-status.enum';
import { ClinicalRecordType } from '../src/clinical-records/enums/clinical-record-type.enum';
import { UserRole } from '../src/users/enums/user-role.enum';
import { MeClinicalRecordAttachmentsController, ProviderClinicalRecordAttachmentsController } from '../src/clinical-records/clinical-record-attachments.controller';
import { ClinicalRecordAttachmentsService } from '../src/clinical-records/clinical-record-attachments.service';
import { MeClinicalRecordAccessController, ProviderClinicalRecordAccessRequestsController, ProviderSharedClinicalRecordsController } from '../src/clinical-records/clinical-record-access.controller';
import { ClinicalRecordAccessService } from '../src/clinical-records/clinical-record-access.service';

describe('Clinical Records authorization (e2e)', () => {
  let app: INestApplication;
  const service = { createForAppointment: jest.fn().mockResolvedValue({ reference: 'SC-CLR-ABCDEF123456', status: ClinicalRecordStatus.DRAFT }), getForProvider: jest.fn(), updateForAppointment: jest.fn(), finalizeForAppointment: jest.fn(), listMine: jest.fn().mockResolvedValue({ items: [] }), getMine: jest.fn() };
  const attachments = { upload: jest.fn().mockResolvedValue({ reference: 'SC-CLA-ABCDEF123456', originalName: 'report.pdf', mimeType: 'application/pdf', sizeBytes: 8, resourceType: 'DOCUMENT' }), delete: jest.fn(), providerAccess: jest.fn().mockResolvedValue({ url: 'https://signed.example/private' }), patientAccess: jest.fn().mockResolvedValue({ url: 'https://signed.example/private' }) };
  const access = { listEligibleProviders: jest.fn().mockResolvedValue({ items: [], page: 1, limit: 20, total: 0, totalPages: 0 }), createGrant: jest.fn().mockResolvedValue({ reference: 'SC-CRG-ABCDEF123456' }), listGrants: jest.fn().mockResolvedValue({ items: [] }), getGrant: jest.fn(), revokeGrant: jest.fn(), listAudit: jest.fn().mockResolvedValue({ items: [] }), listShared: jest.fn().mockResolvedValue({ items: [] }), getShared: jest.fn().mockResolvedValue({ reference: 'SC-CLR-ABCDEF123456' }), sharedAttachmentAccess: jest.fn().mockResolvedValue({ url: 'https://signed.example/private' }), createAccessRequest: jest.fn().mockResolvedValue({ reference: 'SC-CRR-ABCDEF123456', status: 'PENDING' }), listPatientRequests: jest.fn().mockResolvedValue({ items: [] }), listProviderRequests: jest.fn().mockResolvedValue({ items: [] }), approveAccessRequest: jest.fn(), declineAccessRequest: jest.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [ProviderClinicalRecordsController, MeClinicalRecordsController, ProviderClinicalRecordAttachmentsController, MeClinicalRecordAttachmentsController, MeClinicalRecordAccessController, ProviderSharedClinicalRecordsController, ProviderClinicalRecordAccessRequestsController], providers: [RolesGuard, Reflector, { provide: ClinicalRecordsService, useValue: service }, { provide: ClinicalRecordAttachmentsService, useValue: attachments }, { provide: ClinicalRecordAccessService, useValue: access }] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: any) => { const req = context.switchToHttp().getRequest(); const token = req.headers.authorization?.replace('Bearer ', ''); if (!token) throw new UnauthorizedException(); req.user = { id: `${token}-user`, roles: token === 'provider' ? [UserRole.PROVIDER] : [UserRole.USER] }; return true; } }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true })); await app.init();
  });
  afterAll(() => app.close());

  it('allows only Provider authority to create records and derives ownership from auth/appointment', async () => {
    const path = '/api/v1/provider/care-appointments/SC-APT-ABCDEF123456/clinical-record';
    const body = { recordType: ClinicalRecordType.CONSULTATION, title: 'Consultation outcome', consultation: { diagnosis: 'Assessment' }, patientId: 'spoofed', providerId: 'spoofed' };
    await request(app.getHttpServer()).post(path).send(body).expect(401);
    await request(app.getHttpServer()).post(path).set('Authorization', 'Bearer patient').send(body).expect(403);
    await request(app.getHttpServer()).post(path).set('Authorization', 'Bearer provider').send(body).expect(201);
    expect(service.createForAppointment).toHaveBeenCalledWith(expect.objectContaining({ id: 'provider-user' }), 'SC-APT-ABCDEF123456', { recordType: ClinicalRecordType.CONSULTATION, title: 'Consultation outcome', consultation: { diagnosis: 'Assessment' } });
  });

  it('keeps patient reads under USER authority', async () => {
    await request(app.getHttpServer()).get('/api/v1/me/clinical-records').set('Authorization', 'Bearer provider').expect(403);
    await request(app.getHttpServer()).get('/api/v1/me/clinical-records').set('Authorization', 'Bearer patient').expect(200);
  });

  it('keeps multipart mutation provider-only and attachment access role-scoped', async () => {
    const upload = '/api/v1/provider/clinical-records/SC-CLR-ABCDEF123456/attachments';
    await request(app.getHttpServer()).post(upload).attach('file', Buffer.from('%PDF-1.7'), { filename: 'report.pdf', contentType: 'application/pdf' }).expect(401);
    await request(app.getHttpServer()).post(upload).set('Authorization', 'Bearer patient').attach('file', Buffer.from('%PDF-1.7'), { filename: 'report.pdf', contentType: 'application/pdf' }).expect(403);
    await request(app.getHttpServer()).post(upload).set('Authorization', 'Bearer provider').attach('file', Buffer.from('%PDF-1.7'), { filename: 'report.pdf', contentType: 'application/pdf' }).expect(201);
    expect(attachments.upload).toHaveBeenCalledWith(expect.objectContaining({ id: 'provider-user' }), 'SC-CLR-ABCDEF123456', expect.objectContaining({ mimetype: 'application/pdf' }));
    await request(app.getHttpServer()).get('/api/v1/me/clinical-records/SC-CLR-ABCDEF123456/attachments/SC-CLA-ABCDEF123456/access').set('Authorization', 'Bearer patient').expect(200);
  });

  it('keeps consent patient-controlled and shared reads provider-only', async () => {
    const grant = '/api/v1/me/clinical-record-access-grants';
    const body = { providerReference: 'SCPR-74A176AB04848BE2D3977F8493D29CE5', scope: 'ALL_RECORDS' };
    await request(app.getHttpServer()).post(grant).set('Authorization', 'Bearer provider').send(body).expect(403);
    await request(app.getHttpServer()).post(grant).set('Authorization', 'Bearer patient').send(body).expect(201);
    await request(app.getHttpServer()).get('/api/v1/provider/shared-clinical-records').set('Authorization', 'Bearer patient').expect(403);
    await request(app.getHttpServer()).get('/api/v1/provider/shared-clinical-records').set('Authorization', 'Bearer provider').expect(200);
    await request(app.getHttpServer()).get('/api/v1/me/clinical-record-access-audit').set('Authorization', 'Bearer patient').expect(200);
  });
  it('keeps the Clinical Record Provider selector patient-authenticated', async () => {
    const route = '/api/v1/me/clinical-record-access-providers?q=prime&page=1&limit=20';
    await request(app.getHttpServer()).get(route).expect(401);
    await request(app.getHttpServer()).get(route).set('Authorization', 'Bearer provider').expect(403);
    await request(app.getHttpServer()).get(route).set('Authorization', 'Bearer patient').expect(200);
    expect(access.listEligibleProviders).toHaveBeenCalledWith(expect.objectContaining({ id: 'patient-user' }), expect.objectContaining({ q: 'prime', page: 1, limit: 20 }));
  });
  it('keeps access requests provider-created and patient-decided', async () => {
    const create = '/api/v1/provider/clinical-record-access-requests';
    const body = { patientReference: 'SCP-AB12-CD34', scope: 'ALL_RECORDS', reason: 'Coordinate ongoing care' };
    await request(app.getHttpServer()).post(create).set('Authorization', 'Bearer patient').send(body).expect(403);
    await request(app.getHttpServer()).post(create).set('Authorization', 'Bearer provider').send(body).expect(201);
    await request(app.getHttpServer()).get('/api/v1/me/clinical-record-access-requests').set('Authorization', 'Bearer provider').expect(403);
    await request(app.getHttpServer()).get('/api/v1/me/clinical-record-access-requests').set('Authorization', 'Bearer patient').expect(200);
    await request(app.getHttpServer()).post('/api/v1/me/clinical-record-access-requests/SC-CRR-ABCDEF123456/approve').set('Authorization', 'Bearer provider').expect(403);
  });
});
