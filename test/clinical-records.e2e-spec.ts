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

describe('Clinical Records authorization (e2e)', () => {
  let app: INestApplication;
  const service = { createForAppointment: jest.fn().mockResolvedValue({ reference: 'SC-CLR-ABCDEF123456', status: ClinicalRecordStatus.DRAFT }), getForProvider: jest.fn(), updateForAppointment: jest.fn(), finalizeForAppointment: jest.fn(), listMine: jest.fn().mockResolvedValue({ items: [] }), getMine: jest.fn() };
  const attachments = { upload: jest.fn().mockResolvedValue({ reference: 'SC-CLA-ABCDEF123456', originalName: 'report.pdf', mimeType: 'application/pdf', sizeBytes: 8, resourceType: 'DOCUMENT' }), delete: jest.fn(), providerAccess: jest.fn().mockResolvedValue({ url: 'https://signed.example/private' }), patientAccess: jest.fn().mockResolvedValue({ url: 'https://signed.example/private' }) };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [ProviderClinicalRecordsController, MeClinicalRecordsController, ProviderClinicalRecordAttachmentsController, MeClinicalRecordAttachmentsController], providers: [RolesGuard, Reflector, { provide: ClinicalRecordsService, useValue: service }, { provide: ClinicalRecordAttachmentsService, useValue: attachments }] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: any) => { const req = context.switchToHttp().getRequest(); const token = req.headers.authorization?.replace('Bearer ', ''); if (!token) throw new UnauthorizedException(); req.user = { id: `${token}-user`, roles: token === 'provider' ? [UserRole.PROVIDER] : [UserRole.USER] }; return true; } }).compile();
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
});
