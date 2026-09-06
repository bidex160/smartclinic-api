import { PatientRelationshipType } from './enums/patient-relationship.enum';
import { DependantsService } from './dependants.service';
import { Patient } from './entities/patient.entity';
import { PatientRelationship } from './entities/patient-relationship.entity';
import { DependantRewardProvenance } from './entities/dependant-reward-provenance.entity';
import { User } from '../users/entities/user.entity';

describe('DependantsService', () => {
  const actor: any = { id: 'guardian-user', status: 'ACTIVE', roles: ['USER'], deletedAt: null };
  const dto = { firstName: 'Aisha', lastName: 'Okafor', dateOfBirth: '2015-06-12', relationshipType: PatientRelationshipType.MOTHER, countryCode: 'NG', stateOrRegion: 'Lagos', city: 'Ikeja' };
  let patientRows: any[]; let relationshipRows: any[]; let provenanceRows: any[]; let patients: any; let relationships: any; let provenanceRepository: any; let manager: any; let service: DependantsService;
  beforeEach(() => {
    patientRows = []; relationshipRows = []; provenanceRows = [];
    provenanceRepository = { create: (v: any) => v, save: jest.fn(async (v: any) => { const row = { id: `provenance-${provenanceRows.length + 1}`, ...v }; provenanceRows.push(row); return row; }) };
    const repo = (entity: any): any => {
      if (entity === User) return { findOne: jest.fn().mockResolvedValue(actor) };
      if (entity === Patient) return { create: (v: any) => v, save: jest.fn(async (v: any) => { const row = { id: `patient-${patientRows.length + 1}`, deletedAt: null, ...v }; patientRows.push(row); return row; }) };
      if (entity === PatientRelationship) return { create: (v: any) => v, save: jest.fn(async (v: any) => { const row = { id: `relationship-${relationshipRows.length + 1}`, ...v }; relationshipRows.push(row); return row; }) };
      if (entity === DependantRewardProvenance) return provenanceRepository;
      return {};
    };
    manager = { getRepository: jest.fn(repo), transaction: jest.fn(async (work: any) => { const lengths = [patientRows.length, relationshipRows.length, provenanceRows.length]; try { return await work(manager); } catch (error) { patientRows.length = lengths[0]; relationshipRows.length = lengths[1]; provenanceRows.length = lengths[2]; throw error; } }) };
    patients = { manager }; relationships = { findOne: jest.fn() };
    service = new DependantsService(patients, relationships, { listAccessiblePatients: jest.fn(), resolveAccessiblePatient: jest.fn() } as never);
  });

  it('atomically creates a real contactless Patient, guardian relationship, and explicit pending creator provenance with zero reward side effects', async () => {
    const result = await service.create(actor, dto);
    expect(patientRows[0]).toMatchObject({ userId: null, email: null, phone: null, givenName: 'Aisha', familyName: 'Okafor', patientReference: expect.stringMatching(/^SCP-[A-Z0-9]{4}-[A-Z0-9]{4}$/) });
    expect(relationshipRows[0]).toMatchObject({ relatedUserId: actor.id, patientId: patientRows[0].id, relationshipType: 'MOTHER', role: 'GUARDIAN', status: 'ACTIVE', isPrimary: true });
    expect(provenanceRows[0]).toMatchObject({ dependantPatientId: patientRows[0].id, createdByUserId: actor.id, status: 'PENDING', qualifiedAt: null, rewardCreditedAt: null });
    expect(result).not.toHaveProperty('id'); expect(JSON.stringify(result)).not.toContain('createdByUserId');
    expect(Object.keys(service)).not.toEqual(expect.arrayContaining(['referrals', 'ledger', 'credentials', 'sessions']));
  });

  it('supports multiple dependants for one guardian', async () => {
    await service.create(actor, dto); await service.create(actor, { ...dto, firstName: 'Zainab' });
    expect(patientRows).toHaveLength(2); expect(relationshipRows.map(row => row.relatedUserId)).toEqual([actor.id, actor.id]);
  });

  it('rolls the Patient and relationship back if provenance persistence fails', async () => {
    provenanceRepository.save.mockRejectedValueOnce(new Error('failed'));
    await expect(service.create(actor, dto)).rejects.toThrow('failed');
    expect(patientRows).toHaveLength(0); expect(relationshipRows).toHaveLength(0); expect(provenanceRows).toHaveLength(0);
  });

  it('lists and retrieves only access-service-authorized dependants without provenance', async () => {
    const access: any = (service as any).access;
    access.listAccessiblePatients.mockResolvedValue([{ patientReference: 'SCP-AB12-CD34', firstName: 'Aisha', lastName: 'Okafor', displayName: 'Aisha Okafor', dateOfBirth: '2015-06-12', countryCode: 'NG', stateOrRegion: 'Lagos', city: 'Ikeja', accessKind: 'DEPENDANT', relationship: { type: 'MOTHER', role: 'GUARDIAN', isPrimary: true } }, { patientReference: 'SCP-SELF-0001', accessKind: 'SELF' }]);
    await expect(service.list(actor)).resolves.toEqual({ items: [expect.objectContaining({ patientReference: 'SCP-AB12-CD34', countryCode: 'NG' })] });
    const patient: any = { id: 'child', patientReference: 'SCP-AB12-CD34', givenName: 'Aisha', familyName: 'Okafor', dateOfBirth: '2015-06-12', countryCode: 'NG', stateOrRegion: 'Lagos', city: 'Ikeja' };
    access.resolveAccessiblePatient.mockResolvedValue(patient); relationships.findOne.mockResolvedValue({ relatedUserId: actor.id, patientId: patient.id, relationshipType: 'MOTHER', role: 'GUARDIAN', status: 'ACTIVE', isPrimary: true, endedAt: null });
    const detail = await service.get(actor, patient.patientReference); expect(detail).toMatchObject({ patientReference: patient.patientReference, relationship: { type: 'MOTHER' } }); expect(JSON.stringify(detail)).not.toContain('createdByUserId');
  });
});
