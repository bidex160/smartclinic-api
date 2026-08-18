import { ConflictException, NotFoundException } from '@nestjs/common';
import { HealthResultAccessGrant } from '../health-checks/entities/health-result-access-grant.entity';
import { HealthResultAccessGrantStatus } from '../health-checks/enums/health-result-access-grant-status.enum';
import { Patient } from '../patients/entities/patient.entity';
import { PatientStatus } from '../patients/enums/patient-status.enum';
import { User } from '../users/entities/user.entity';
import { UserStatus } from '../users/enums/user-status.enum';
import { PatientAccountLinkingService } from './patient-account-linking.service';

describe('PatientAccountLinkingService', () => {
  const user: any = { id: 'user-1', status: UserStatus.ACTIVE, deletedAt: null };
  let patient: any; let patientRows: any[]; let grants: any[]; let manager: any; let subject: PatientAccountLinkingService; let bookingSessions: any; let resultAccess: any;
  beforeEach(() => {
    patient = { id: 'patient-1', userId: null, givenName: 'Ada', familyName: 'Okafor', status: PatientStatus.ACTIVE, deletedAt: null, bookings: [{ id: 'booking-1' }], encounters: [{ id: 'encounter-1', measurements: [{ id: 'measurement-1' }] }] };
    patientRows = [patient]; grants = [{ id: 'grant-1', patientId: patient.id, status: HealthResultAccessGrantStatus.ACTIVE, revokedAt: null }];
    const patientRepository = { findOne: jest.fn(async ({ where }: any) => where.id ? patientRows.find((row) => row.id === where.id) ?? null : patientRows.find((row) => row.userId === where.userId) ?? null), save: jest.fn(async (value) => value) };
    const userRepository = { findOne: jest.fn(async ({ where }: any) => where.id === user.id ? user : null) };
    const grantRepository = { update: jest.fn(async (criteria: any, changes: any) => { grants.filter((row) => row.patientId === criteria.patientId && row.status === criteria.status).forEach((row) => Object.assign(row, changes)); return { affected: 1 }; }) };
    manager = { getRepository: jest.fn((entity) => entity === Patient ? patientRepository : entity === User ? userRepository : entity === HealthResultAccessGrant ? grantRepository : {}), transaction: jest.fn(async (work) => work(manager)) };
    bookingSessions = { resolvePatientOwnershipProof: jest.fn().mockResolvedValue(patient.id) }; resultAccess = { resolveGuestOwnershipProof: jest.fn().mockResolvedValue(patient.id) };
    subject = new PatientAccountLinkingService({ manager } as any, bookingSessions, resultAccess);
  });

  it('links from a booking-bound session without copying historical records and revokes guest result grants', async () => {
    const originalBookings = patient.bookings; const originalEncounters = patient.encounters;
    await expect(subject.linkFromBooking(user, 'SC-2026-7F23B0C9D1E4', 'session-token')).resolves.toEqual({ linked: true, patient: { givenName: 'Ada', familyName: 'Okafor' } });
    expect(bookingSessions.resolvePatientOwnershipProof).toHaveBeenCalledWith('session-token', 'SC-2026-7F23B0C9D1E4'); expect(patient.userId).toBe(user.id); expect(patientRows).toHaveLength(1); expect(patient.bookings).toBe(originalBookings); expect(patient.encounters).toBe(originalEncounters); expect(grants[0]).toMatchObject({ status: HealthResultAccessGrantStatus.REVOKED, revokedAt: expect.any(Date) });
  });
  it('links only from a valid result grant resolved by the result-access boundary', async () => { await subject.linkFromResult(user, 'a'.repeat(43)); expect(resultAccess.resolveGuestOwnershipProof).toHaveBeenCalledWith('a'.repeat(43)); expect(patient.userId).toBe(user.id); });
  it('is idempotent when the same account and Patient are already linked', async () => { patient.userId = user.id; await expect(subject.linkFromBooking(user, 'SC-2026-7F23B0C9D1E4', 'token')).resolves.toMatchObject({ linked: true }); });
  it('rejects an account already linked to a different Patient', async () => { patientRows.push({ ...patient, id: 'patient-2', userId: user.id }); await expect(subject.linkFromBooking(user, 'SC-2026-7F23B0C9D1E4', 'token')).rejects.toBeInstanceOf(ConflictException); });
  it('rejects a Patient claimed by another account without exposing that account', async () => { patient.userId = 'other-user'; await expect(subject.linkFromBooking(user, 'SC-2026-7F23B0C9D1E4', 'token')).rejects.toMatchObject({ message: 'The Patient is already linked to another account' }); });
  it('rejects inactive/deleted Patients', async () => { patient.status = PatientStatus.INACTIVE; await expect(subject.linkFromBooking(user, 'SC-2026-7F23B0C9D1E4', 'token')).rejects.toBeInstanceOf(NotFoundException); });
});
