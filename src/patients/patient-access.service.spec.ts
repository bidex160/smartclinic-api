import { NotFoundException } from '@nestjs/common';
import { PatientAccessService } from './patient-access.service';

describe('PatientAccessService', () => {
  const actor = { id: 'actor-user', status: 'ACTIVE', roles: ['USER'], deletedAt: null };
  const self = { id: 'self-patient', patientReference: 'SCP-SELF-0001', userId: actor.id, givenName: 'Ada', familyName: 'Okafor', dateOfBirth: '1990-01-01', countryCode: 'NG', stateOrRegion: 'Lagos', city: 'Ikeja', status: 'ACTIVE', deletedAt: null };
  const child: any = { id: 'child-patient', patientReference: 'SCP-CHLD-0001', userId: null, givenName: 'Aisha', familyName: 'Okafor', dateOfBirth: '2015-01-01', countryCode: 'NG', stateOrRegion: 'Lagos', city: 'Ikeja', status: 'ACTIVE', deletedAt: null };
  let patients: any; let relationships: any; let users: any; let service: PatientAccessService; let relation: any;
  beforeEach(() => {
    relation = { id: 'relationship', relatedUserId: actor.id, patientId: child.id, role: 'GUARDIAN', status: 'ACTIVE', endedAt: null, relationshipType: 'MOTHER', isPrimary: true, patient: child, createdAt: new Date() };
    patients = { findOne: jest.fn(async ({ where }: any) => [self, child].find(row => Object.entries(where).every(([key, value]) => (row as any)[key] === value)) ?? null) };
    relationships = { findOne: jest.fn(async ({ where }: any) => relation && Object.entries(where).every(([key, value]) => relation[key] === value) ? relation : null), find: jest.fn().mockResolvedValue([relation]) };
    users = { findOne: jest.fn().mockResolvedValue(actor) };
    service = new PatientAccessService(patients, relationships, users);
  });

  it('allows self and an active guardian dependant but denies unrelated public references', async () => {
    await expect(service.resolveAccessiblePatient(actor.id, self.patientReference)).resolves.toBe(self);
    await expect(service.resolveAccessiblePatient(actor.id, child.patientReference)).resolves.toBe(child);
    relation = null;
    await expect(service.resolveAccessiblePatient(actor.id, child.patientReference)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('denies inactive/stale relationships, deleted patients, and deleted guardians', async () => {
    relation.status = 'INACTIVE'; expect(await service.canAccessPatient(actor.id, child.id)).toBe(false);
    relation.status = 'ACTIVE'; relation.endedAt = new Date(); expect(await service.canAccessPatient(actor.id, child.id)).toBe(false);
    relation.endedAt = null; child.deletedAt = new Date(); expect(await service.canAccessPatient(actor.id, child.id)).toBe(false);
    child.deletedAt = null; users.findOne.mockResolvedValue({ ...actor, deletedAt: new Date() }); expect(await service.canAccessPatient(actor.id, child.id)).toBe(false);
  });

  it('lists only self and authorized active dependants without internal IDs or reward provenance', async () => {
    const result = await service.listAccessiblePatients(actor.id);
    expect(result).toEqual([expect.objectContaining({ patientReference: self.patientReference, accessKind: 'SELF', relationship: null }), expect.objectContaining({ patientReference: child.patientReference, accessKind: 'DEPENDANT', relationship: { type: 'MOTHER', role: 'GUARDIAN', isPrimary: true } })]);
    expect(JSON.stringify(result)).not.toContain('child-patient'); expect(JSON.stringify(result)).not.toContain('createdByUserId');
  });
});
