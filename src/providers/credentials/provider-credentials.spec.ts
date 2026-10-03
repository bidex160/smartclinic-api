import { BadRequestException, ConflictException } from '@nestjs/common';

import { ProviderOnboardingBlocker } from '../dto/provider-onboarding-readiness.dto';
import { Provider } from '../entities/provider.entity';
import { ProviderType } from '../enums/provider-type.enum';
import { CredentialStatus } from './credential.entities';
import { ProviderCredentialsService } from './provider-credentials.service';
import { normaliseLicence, regulatorsFor, specialtyRequired } from './regulators';

describe('regulators and licence numbers', () => {
  it('offers the right councils for a Nigerian doctor, a Rwandan pharmacy and a Lagos hospital', () => {
    expect(regulatorsFor('NG', ProviderType.INDIVIDUAL).map((r) => r.code)).toEqual(['MDCN', 'NMCN', 'PCN', 'MLSCN', 'RRBN', 'MRTB', 'OTHER']);
    expect(regulatorsFor('RW', ProviderType.PHARMACY).map((r) => r.code)).toEqual(['RFDA', 'OTHER']);
    expect(regulatorsFor('NG', ProviderType.HOSPITAL).map((r) => r.code)).toEqual(['HEFAMAA', 'NG_STATE_MOH', 'FMOH', 'OTHER']);
    expect(regulatorsFor('GH', ProviderType.INDIVIDUAL).map((r) => r.code)).toContain('GMDC');
  });

  it('tidies licence numbers and refuses junk', () => {
    expect(normaliseLicence('  mdcn/r/ 12345 ')).toBe('MDCN/R/ 12345');
    expect(normaliseLicence('ab')).toBeNull();
    expect(normaliseLicence('<script>')).toBeNull();
    expect(normaliseLicence('')).toBeNull();
  });

  it('needs a specialty only for doctors', () => {
    expect(specialtyRequired(ProviderType.INDIVIDUAL)).toBe(true);
    expect(specialtyRequired(ProviderType.HOSPITAL)).toBe(false);
  });
});

/** Tiny in-memory repositories, enough for the service's calls. */
function setup(providerType = ProviderType.INDIVIDUAL) {
  const catalogue = [
    { id: 's1', code: 'GENERAL_PRACTICE', name: 'General Practice / Family Medicine', groupName: 'Primary care', isActive: true, sortOrder: 10 },
    { id: 's2', code: 'CARDIOLOGY', name: 'Cardiology', groupName: 'Medicine', isActive: true, sortOrder: 30 },
    { id: 's3', code: 'PEDIATRICS', name: 'Pediatrics', groupName: 'Children', isActive: true, sortOrder: 150 },
    { id: 's4', code: 'DENTISTRY', name: 'Dentistry', groupName: 'Dental', isActive: true, sortOrder: 240 },
  ];
  let links: { providerId: string; specialtyId: string; isPrimary: boolean }[] = [];
  let creds: Record<string, unknown>[] = [];
  const provider = { id: 'p1', providerType, countryCode: 'NG', userId: 'u1', providerReference: 'SCPR-1', deletedAt: null } as unknown as Provider;
  const matches = (row: Record<string, unknown>, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => (v && typeof v === 'object' && '_value' in (v as object) ? ((v as { _value: unknown[] })._value).includes(row[k]) : row[k] === v));
  const specialtyRepo = {
    find: async ({ where }: { where: Record<string, unknown> }) => catalogue.filter((c) => matches(c, where)),
  };
  const linkRepo = {
    find: async ({ where }: { where: Record<string, unknown> }) => links.filter((l) => matches(l, where)).map((l) => ({ ...l, specialty: catalogue.find((c) => c.id === l.specialtyId) })),
    exists: async ({ where }: { where: Record<string, unknown> }) => links.some((l) => matches(l, where)),
    delete: async (where: Record<string, unknown>) => { links = links.filter((l) => !matches(l, where)); },
    insert: async (rows: typeof links) => { links.push(...rows); },
  };
  const credRepo = {
    findOne: async ({ where }: { where: Record<string, unknown> }) => creds.find((c) => matches(c, where)) ?? null,
    find: async ({ where }: { where: Record<string, unknown> }) => creds.filter((c) => matches(c, where)),
    save: async (row: Record<string, unknown>) => { creds = creds.filter((c) => c.providerId !== row.providerId); creds.push({ id: 'c1', ...row }); return row; },
    update: async ({ id }: { id: string }, patch: Record<string, unknown>) => { const c = creds.find((x) => x.id === id)!; Object.assign(c, patch); },
  };
  const providerRepo = { update: jest.fn(), findOne: async () => provider };
  const manager = {
    getRepository: (e: { name: string }) =>
      ({ ClinicalSpecialty: specialtyRepo, ProviderSpecialty: linkRepo, ProviderCredential: credRepo, Provider: providerRepo } as Record<string, unknown>)[e.name],
    transaction: async (fn: (m: unknown) => unknown) => fn(manager),
  };
  (providerRepo as unknown as { manager: unknown }).manager = manager;
  const current = { findActor: async () => ({ provider, isOwner: true, role: null, memberId: null }) };
  const sent: unknown[] = [];
  const notifications = { createTransactionalNotification: async (_m: unknown, n: unknown) => { sent.push(n); } };
  const svc = new ProviderCredentialsService(
    specialtyRepo as never, linkRepo as never, credRepo as never, providerRepo as never, current as never, undefined, notifications as never,
  );
  return { svc, provider, sent, user: { id: 'u1' } as never, admin: { id: 'admin1' } as never, getCreds: () => creds };
}

describe('ProviderCredentialsService', () => {
  it('a new doctor is blocked until they add a specialty and a licence, and staff verify it', async () => {
    const { svc, provider, user, admin, sent } = setup();
    expect(await svc.blockers(provider)).toEqual([ProviderOnboardingBlocker.SPECIALTY_MISSING, ProviderOnboardingBlocker.LICENCE_MISSING]);

    const v1 = await svc.setMySpecialties(user, ['CARDIOLOGY', 'GENERAL_PRACTICE'], 'CARDIOLOGY');
    expect(v1.specialties).toEqual([{ code: 'CARDIOLOGY', name: 'Cardiology', isPrimary: true }, { code: 'GENERAL_PRACTICE', name: 'General Practice / Family Medicine', isPrimary: false }]);

    const v2 = await svc.setMyCredential(user, { regulator: 'mdcn', licenceNumber: 'mdcn/r/123456' });
    expect(v2.credential).toMatchObject({ regulator: 'MDCN', licenceNumber: 'MDCN/R/123456', status: CredentialStatus.SUBMITTED });
    expect(v2.blockers).toEqual([ProviderOnboardingBlocker.LICENCE_NOT_VERIFIED]);
    expect(v2.verified).toBe(false);

    await expect(svc.verify('p1', admin, { checkedVia: ' ' })).rejects.toBeInstanceOf(BadRequestException);
    const v3 = await svc.verify('p1', admin, { checkedVia: 'MDCN online register' });
    expect(v3).toMatchObject({ verified: true, blockers: [], checkedVia: 'MDCN online register', checkUrl: 'https://mdcn.gov.ng/page/services/primary-source-verification' });
    expect(sent[0]).toMatchObject({ userId: 'u1', type: 'PROVIDER_LICENCE_VERIFIED' });

    // Once verified, the number is locked; resending the same one is fine.
    await expect(svc.setMyCredential(user, { regulator: 'MDCN', licenceNumber: 'MDCN/R/999' })).rejects.toBeInstanceOf(ConflictException);
    await expect(svc.setMyCredential(user, { regulator: 'MDCN', licenceNumber: 'MDCN/R/123456' })).resolves.toMatchObject({ verified: true });
  });

  it('checks specialty choices', async () => {
    const { svc, user } = setup();
    await expect(svc.setMySpecialties(user, [])).rejects.toThrow('General Practice counts');
    await expect(svc.setMySpecialties(user, ['NOT_REAL'])).rejects.toThrow('Unknown specialty');
    await expect(svc.setMySpecialties(user, ['CARDIOLOGY', 'PEDIATRICS', 'DENTISTRY', 'GENERAL_PRACTICE'])).rejects.toThrow('up to 3');
    await expect(svc.setMySpecialties(user, ['CARDIOLOGY'], 'PEDIATRICS')).rejects.toThrow('main specialty');
  });

  it('a hospital needs a licence but no specialty, and can list many departments', async () => {
    const { svc, provider, user } = setup(ProviderType.HOSPITAL);
    expect(await svc.blockers(provider)).toEqual([ProviderOnboardingBlocker.LICENCE_MISSING]);
    await expect(svc.setMySpecialties(user, [])).resolves.toMatchObject({ specialties: [] });
    await expect(svc.setMySpecialties(user, ['CARDIOLOGY', 'PEDIATRICS', 'DENTISTRY', 'GENERAL_PRACTICE'])).resolves.toMatchObject({ maxSpecialties: 40 });
    await expect(svc.setMyCredential(user, { regulator: 'NOPE', licenceNumber: 'ABC123' })).rejects.toThrow('who issued');
  });

  it('sending a licence back tells the provider what to fix, and fixing it resubmits', async () => {
    const { svc, user, admin, sent } = setup();
    await svc.setMyCredential(user, { regulator: 'MDCN', licenceNumber: 'MDCN/R/1' });
    const r = await svc.reject('p1', admin, 'The name on the register does not match. Please upload your certificate.');
    expect(r.credential).toMatchObject({ status: CredentialStatus.REJECTED, message: 'The name on the register does not match. Please upload your certificate.' });
    expect(sent[0]).toMatchObject({ type: 'PROVIDER_LICENCE_NEEDS_ATTENTION' });
    const again = await svc.setMyCredential(user, { regulator: 'MDCN', licenceNumber: 'MDCN/R/12' });
    expect(again.credential).toMatchObject({ status: CredentialStatus.SUBMITTED, message: null });
  });

  it('search badges list the main specialty first and only show Verified when checked', async () => {
    const { svc, user, admin } = setup();
    await svc.setMySpecialties(user, ['GENERAL_PRACTICE', 'PEDIATRICS'], 'PEDIATRICS');
    await svc.setMyCredential(user, { regulator: 'MDCN', licenceNumber: 'MDCN/R/7' });
    expect((await svc.badges(['p1'])).get('p1')).toMatchObject({ verified: false, specialties: [{ code: 'PEDIATRICS', isPrimary: true }, { code: 'GENERAL_PRACTICE' }] });
    await svc.verify('p1', admin, { checkedVia: 'Called MDCN' });
    expect((await svc.badges(['p1', 'p2'])).get('p1')!.verified).toBe(true);
    expect((await svc.badges(['p1', 'p2'])).get('p2')).toEqual({ verified: false, specialties: [] });
  });

  it('documents need storage and a licence number first', async () => {
    const { svc, user } = setup();
    await expect(svc.uploadMyDocument(user, undefined)).rejects.toThrow('not available yet');
  });
});
