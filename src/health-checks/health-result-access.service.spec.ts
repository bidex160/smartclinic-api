import { ConflictException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Booking } from '../bookings/entities/booking.entity';
import { Patient } from '../patients/entities/patient.entity';
import { PatientStatus } from '../patients/enums/patient-status.enum';
import { HealthCheckEncounter } from './entities/health-check-encounter.entity';
import { HealthResultAccessGrant } from './entities/health-result-access-grant.entity';
import { HealthCheckEncounterStatus } from './enums/health-check-encounter-status.enum';
import { HealthCheckMeasurementCode } from './enums/health-check-measurement-code.enum';
import { HealthResultAccessGrantStatus } from './enums/health-result-access-grant-status.enum';
import { HealthResultAccessService } from './health-result-access.service';

describe('HealthResultAccessService', () => {
  const user: any = { id: 'user-1' }; const actorId = 'admin-1';
  let patient: any, booking: any, encounter: any, resultEncounter: any, grantRows: any[], encounterRepository: any, grantRepository: any, patientRepository: any, bookingRepository: any, manager: any, subject: HealthResultAccessService;
  beforeEach(() => {
    patient = { id: 'patient-1', userId: user.id, status: PatientStatus.ACTIVE, deletedAt: null };
    booking = { id: 'booking-1', bookingReference: 'SC-2026-7F23B0C9D1E4', participantPatientId: patient.id };
    encounter = { id: 'encounter-1', bookingId: booking.id, providerId: 'provider-1', status: HealthCheckEncounterStatus.COMPLETED, completedAt: new Date('2026-08-18T11:00:00Z') };
    resultEncounter = { ...encounter, booking: { ...booking, healthCheckPackage: { code: 'ESSENTIAL', name: 'Essential' } }, provider: { displayName: 'SmartClinic Ikeja' }, measurements: [{ code: HealthCheckMeasurementCode.BLOOD_PRESSURE, valueNumeric: '120.0000', valueSecondaryNumeric: '80.0000', unit: 'mmHg', recordedAt: new Date('2026-08-18T10:50:00Z') }] };
    grantRows = [];
    const queryBuilder = () => { const builder: any = { innerJoinAndSelect: jest.fn().mockReturnThis(), leftJoinAndSelect: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(), getOne: jest.fn(async () => resultEncounter) }; return builder; };
    encounterRepository = { findOne: jest.fn(async () => encounter), createQueryBuilder: jest.fn(queryBuilder), manager: null };
    patientRepository = { findOne: jest.fn(async () => patient) };
    bookingRepository = { findOne: jest.fn(async () => booking) };
    grantRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => { const index = grantRows.findIndex((row) => row.id === value.id); const saved = { id: value.id ?? `grant-${grantRows.length + 1}`, createdAt: value.createdAt ?? new Date(), updatedAt: new Date(), ...value }; if (index >= 0) grantRows[index] = saved; else grantRows.push(saved); return saved; }),
      findOne: jest.fn(async ({ where }: any) => { if (where.accessTokenHash) return grantRows.find((row) => row.accessTokenHash === where.accessTokenHash) ?? null; if (where.encounterId) return grantRows.find((row) => row.encounterId === where.encounterId && row.status === where.status) ?? null; return grantRows.find((row) => row.id === where.id) ?? null; }),
      manager: null,
    };
    manager = { getRepository: jest.fn((entity) => entity === HealthCheckEncounter ? encounterRepository : entity === HealthResultAccessGrant ? grantRepository : entity === Patient ? patientRepository : entity === Booking ? bookingRepository : {}), transaction: jest.fn(async (work) => work(manager)) };
    encounterRepository.manager = manager; grantRepository.manager = manager;
    subject = new HealthResultAccessService(encounterRepository, grantRepository, patientRepository, { healthResults: { guestAccessTtlSeconds: 3600 } } as never);
  });

  it('allows a linked active User to read only their completed Patient result', async () => { const result = await subject.getRegisteredResult(user, booking.bookingReference); expect(result).toMatchObject({ bookingReference: booking.bookingReference, provider: { displayName: 'SmartClinic Ikeja' }, measurements: [{ value: 120, secondaryValue: 80 }] }); });
  it('denies a User without a linked Patient', async () => { patientRepository.findOne.mockResolvedValue(null); await expect(subject.getRegisteredResult(user, booking.bookingReference)).rejects.toBeInstanceOf(NotFoundException); });
  it('denies another Patient or an incomplete encounter safely', async () => { resultEncounter = null; await expect(subject.getRegisteredResult(user, booking.bookingReference)).rejects.toBeInstanceOf(NotFoundException); });

  it('issues a guest token once, stores only its hash, and scopes it to encounter and Patient', async () => {
    patient.userId = null; const issued = await subject.issueGuestResultAccess(encounter.id, actorId);
    expect(issued.resultAccessToken).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(grantRows[0]).toMatchObject({ encounterId: encounter.id, patientId: patient.id, userId: null, createdByUserId: actorId, status: HealthResultAccessGrantStatus.ACTIVE });
    expect(grantRows[0].accessTokenHash).toBe(createHash('sha256').update(issued.resultAccessToken).digest('hex')); expect(JSON.stringify(grantRows[0])).not.toContain(issued.resultAccessToken); expect(issued).not.toHaveProperty('accessTokenHash');
  });
  it('rejects issuing access for incomplete encounters and linked registered Patients', async () => { encounter.status = HealthCheckEncounterStatus.IN_PROGRESS; patient.userId = null; await expect(subject.issueGuestResultAccess(encounter.id, actorId)).rejects.toBeInstanceOf(ConflictException); encounter.status = HealthCheckEncounterStatus.COMPLETED; patient.userId = user.id; await expect(subject.issueGuestResultAccess(encounter.id, actorId)).rejects.toBeInstanceOf(ConflictException); });
  it('rejects duplicate active guest grants', async () => { patient.userId = null; await subject.issueGuestResultAccess(encounter.id, actorId); await expect(subject.issueGuestResultAccess(encounter.id, actorId)).rejects.toBeInstanceOf(ConflictException); });

  it('uses a valid guest token, updates last-used time, and returns minimized completed results', async () => {
    patient.userId = null; const issued = await subject.issueGuestResultAccess(encounter.id, actorId); const result: any = await subject.getGuestResult(issued.resultAccessToken);
    expect(grantRows[0].lastUsedAt).toEqual(expect.any(Date)); expect(result).toMatchObject({ bookingReference: booking.bookingReference, healthCheckPackage: { code: 'ESSENTIAL' } }); expect(result).not.toHaveProperty('funding'); expect(result).not.toHaveProperty('providerId'); expect(result).not.toHaveProperty('history'); expect(result.measurements[0]).not.toHaveProperty('history');
  });
  it('denies invalid, expired, and revoked guest tokens generically', async () => {
    await expect(subject.getGuestResult('x'.repeat(43))).rejects.toBeInstanceOf(NotFoundException);
    patient.userId = null; const expired = await subject.issueGuestResultAccess(encounter.id, actorId); grantRows[0].expiresAt = new Date(Date.now() - 1); await expect(subject.getGuestResult(expired.resultAccessToken)).rejects.toBeInstanceOf(NotFoundException); expect(grantRows[0].status).toBe(HealthResultAccessGrantStatus.EXPIRED);
    grantRows = []; const revoked = await subject.issueGuestResultAccess(encounter.id, actorId); grantRows[0].status = HealthResultAccessGrantStatus.REVOKED; grantRows[0].revokedAt = new Date(); await expect(subject.getGuestResult(revoked.resultAccessToken)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('cannot use a grant when its encounter is incomplete or outside the stored Patient scope', async () => { patient.userId = null; const issued = await subject.issueGuestResultAccess(encounter.id, actorId); resultEncounter = null; await expect(subject.getGuestResult(issued.resultAccessToken)).rejects.toBeInstanceOf(NotFoundException); });
  it('revokes an active grant without returning token material', async () => { patient.userId = null; const issued = await subject.issueGuestResultAccess(encounter.id, actorId); grantRows[0].encounter = { booking }; const revoked = await subject.revokeGuestResultAccess(issued.id); expect(revoked.status).toBe(HealthResultAccessGrantStatus.REVOKED); expect(revoked).not.toHaveProperty('resultAccessToken'); expect(grantRows[0].revokedAt).toEqual(expect.any(Date)); });
});
