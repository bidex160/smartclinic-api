import * as bcrypt from 'bcrypt';
import { DataSource, EntityManager } from 'typeorm';

import dataSource from '../data-source';
import { ProviderCatalogueOffering } from '../../clinical-orders/entities/provider-catalogue-offering.entity';
import { SmartClinicCatalogueCategory, SmartClinicServiceCatalogueItem } from '../../clinical-orders/entities/smartclinic-service-catalogue-item.entity';
import { Patient } from '../../patients/entities/patient.entity';
import { PatientStatus } from '../../patients/enums/patient-status.enum';
import { generatePatientReference } from '../../patients/patient-reference';
import { ProviderServiceUnit } from '../../provider-service-units/entities/provider-service-unit.entity';
import { ProviderServiceUnitStatus } from '../../provider-service-units/enums/provider-service-unit-status.enum';
import { ProviderServiceUnitType } from '../../provider-service-units/enums/provider-service-unit-type.enum';
import { generateProviderServiceUnitReference } from '../../provider-service-units/provider-service-unit-reference';
import { Provider } from '../../providers/entities/provider.entity';
import { ProviderLocation } from '../../providers/entities/provider-location.entity';
import { ProviderOnboardingStatus } from '../../providers/enums/provider-onboarding-status.enum';
import { ProviderStatus } from '../../providers/enums/provider-status.enum';
import { ProviderType } from '../../providers/enums/provider-type.enum';
import { generateProviderLocationReference } from '../../providers/provider-location-reference';
import { UserCredential } from '../../users/entities/user-credential.entity';
import { User } from '../../users/entities/user.entity';
import { UserRole } from '../../users/enums/user-role.enum';
import { UserStatus } from '../../users/enums/user-status.enum';

export const STAGING_ACCEPTANCE_SEED_CONFIRMATION = 'SMARTCLINIC_STAGING_ONLY';
const BCRYPT_ROUNDS = 12;

type AccountKey = 'PATIENT' | 'DOCTOR' | 'PHARMACY' | 'LAB' | 'RADIOLOGY';
type Account = { email: string; password: string };
type AcceptanceSeedOptions = {
  confirmation?: string;
  nodeEnv?: string;
  accounts?: Partial<Record<AccountKey, Account>>;
};
type ProviderFixture = {
  key: Exclude<AccountKey, 'PATIENT'>;
  displayName: string;
  providerType: ProviderType;
  unitType?: ProviderServiceUnitType;
  catalogueCategory?: SmartClinicCatalogueCategory;
};

const PROVIDER_FIXTURES: readonly ProviderFixture[] = [
  { key: 'DOCTOR', displayName: 'SmartClinic Staging Doctor', providerType: ProviderType.INDIVIDUAL },
  { key: 'PHARMACY', displayName: 'SmartClinic Staging Pharmacy', providerType: ProviderType.PHARMACY, unitType: ProviderServiceUnitType.PHARMACY, catalogueCategory: SmartClinicCatalogueCategory.MEDICATION },
  { key: 'LAB', displayName: 'SmartClinic Staging Laboratory', providerType: ProviderType.DIAGNOSTIC_CENTRE, unitType: ProviderServiceUnitType.LABORATORY, catalogueCategory: SmartClinicCatalogueCategory.LAB_TEST },
  { key: 'RADIOLOGY', displayName: 'SmartClinic Staging Radiology', providerType: ProviderType.DIAGNOSTIC_CENTRE, unitType: ProviderServiceUnitType.RADIOLOGY, catalogueCategory: SmartClinicCatalogueCategory.IMAGING_STUDY },
];

export interface StagingAcceptanceSeedResult {
  patientReference: string;
  providers: Array<{ key: string; providerReference: string; serviceUnitReference: string | null }>;
}

export async function seedStagingAcceptanceAccounts(
  connection: DataSource,
  options: AcceptanceSeedOptions = {},
): Promise<StagingAcceptanceSeedResult> {
  const confirmation = options.confirmation ?? process.env.CONFIRM_STAGING_ACCEPTANCE_SEED;
  if (confirmation !== STAGING_ACCEPTANCE_SEED_CONFIRMATION) {
    throw new Error('Refusing to seed acceptance accounts. Set CONFIRM_STAGING_ACCEPTANCE_SEED=SMARTCLINIC_STAGING_ONLY only on the staging server.');
  }
  if ((options.nodeEnv ?? process.env.NODE_ENV) === 'production') {
    throw new Error('Refusing to seed acceptance accounts while NODE_ENV=production.');
  }

  const accounts = accountConfiguration(options.accounts);
  return connection.transaction(async (manager) => {
    const patientUser = await upsertFixtureUser(manager, accounts.PATIENT, 'SmartClinic Staging Patient', UserRole.USER);
    const patient = await upsertPatient(manager, patientUser, accounts.PATIENT.email);
    const providers: StagingAcceptanceSeedResult['providers'] = [];
    for (const fixture of PROVIDER_FIXTURES) {
      const account = accounts[fixture.key];
      const user = await upsertFixtureUser(manager, account, fixture.displayName, UserRole.PROVIDER);
      const provider = await upsertProvider(manager, user, account.email, fixture);
      const location = await upsertLocation(manager, provider, fixture.displayName);
      const unit = fixture.unitType ? await upsertServiceUnit(manager, provider, location, fixture.unitType) : null;
      if (unit && fixture.catalogueCategory) await upsertCatalogueOfferings(manager, provider, unit, fixture.catalogueCategory);
      providers.push({ key: fixture.key, providerReference: provider.providerReference, serviceUnitReference: unit?.reference ?? null });
    }
    return { patientReference: patient.patientReference, providers };
  });
}

function accountConfiguration(supplied: AcceptanceSeedOptions['accounts']): Record<AccountKey, Account> {
  const result = {} as Record<AccountKey, Account>;
  for (const key of ['PATIENT', 'DOCTOR', 'PHARMACY', 'LAB', 'RADIOLOGY'] as const) {
    const email = (supplied?.[key]?.email ?? process.env[`STAGING_E2E_${key}_EMAIL`])?.trim().toLowerCase();
    const password = supplied?.[key]?.password ?? process.env[`STAGING_E2E_${key}_PASSWORD`];
    if (!email || !password) throw new Error(`STAGING_E2E_${key}_EMAIL and STAGING_E2E_${key}_PASSWORD are required.`);
    if (password.length < 12) throw new Error(`STAGING_E2E_${key}_PASSWORD must contain at least 12 characters.`);
    result[key] = { email, password };
  }
  if (new Set(Object.values(result).map((account) => account.email)).size !== 5) throw new Error('Every staging acceptance account must use a unique email address.');
  return result;
}

async function upsertFixtureUser(manager: EntityManager, account: Account, displayName: string, role: UserRole): Promise<User> {
  const users = manager.getRepository(User);
  const credentials = manager.getRepository(UserCredential);
  let user = await users.findOne({ where: { emailNormalized: account.email }, withDeleted: true });
  if (user && (user.displayName !== displayName || !user.roles.includes(role))) throw new Error(`Refusing to repurpose existing non-fixture account ${account.email}.`);
  if (!user) {
    user = await users.save(users.create({ email: account.email, emailNormalized: account.email, phoneNormalized: null, displayName, status: UserStatus.ACTIVE, roles: [role], networkRole: null, publicLeaderboard: false }));
  } else {
    user.email = account.email;
    user.emailNormalized = account.email;
    user.status = UserStatus.ACTIVE;
    user.deletedAt = null;
    await users.save(user);
  }
  const passwordHash = await bcrypt.hash(account.password, BCRYPT_ROUNDS);
  let credential = await credentials.findOne({ where: { userId: user.id } });
  if (!credential) credential = credentials.create({ userId: user.id, passwordHash });
  else credential.passwordHash = passwordHash;
  await credentials.save(credential);
  return user;
}

async function upsertPatient(manager: EntityManager, user: User, email: string): Promise<Patient> {
  const patients = manager.getRepository(Patient);
  let patient = await patients.findOne({ where: { userId: user.id }, withDeleted: true });
  if (!patient) patient = patients.create({ patientReference: generatePatientReference(), userId: user.id, givenName: 'Staging', familyName: 'Patient', dateOfBirth: '1990-01-01', phone: null, email, status: PatientStatus.ACTIVE, countryCode: 'NG', stateOrRegion: 'Lagos', city: 'Epe' });
  patient.status = PatientStatus.ACTIVE;
  patient.deletedAt = null;
  return patients.save(patient);
}

async function upsertProvider(manager: EntityManager, user: User, email: string, fixture: ProviderFixture): Promise<Provider> {
  const providers = manager.getRepository(Provider);
  let provider = await providers.findOne({ where: { userId: user.id }, withDeleted: true });
  if (!provider) provider = providers.create({ userId: user.id });
  Object.assign(provider, { displayName: fixture.displayName, email, phone: '+2348000000000', professionalReference: `STAGING-${fixture.key}`, providerType: fixture.providerType, countryCode: 'NG', stateOrRegion: 'Lagos', city: 'Epe', status: ProviderStatus.ACTIVE, onboardingStatus: ProviderOnboardingStatus.APPROVED, reviewedByUserId: null, reviewNote: 'Synthetic staging acceptance fixture', deletedAt: null, isPlatformDefault: false, platformDefaultPriority: null });
  provider.submittedAt ??= new Date();
  provider.reviewedAt ??= new Date();
  return providers.save(provider);
}

async function upsertLocation(manager: EntityManager, provider: Provider, name: string): Promise<ProviderLocation> {
  const locations = manager.getRepository(ProviderLocation);
  let location = await locations.findOne({ where: { providerId: provider.id, name } });
  if (!location) location = locations.create({ locationReference: generateProviderLocationReference(), providerId: provider.id, name });
  Object.assign(location, { addressLine1: 'Synthetic staging facility — no real patients', addressLine2: null, city: 'Epe', state: 'Lagos', postalCode: null, countryCode: 'NG', latitude: null, longitude: null, isActive: true });
  return locations.save(location);
}

async function upsertServiceUnit(manager: EntityManager, provider: Provider, location: ProviderLocation, type: ProviderServiceUnitType): Promise<ProviderServiceUnit> {
  const units = manager.getRepository(ProviderServiceUnit);
  const code = `STAGING_${type}`;
  let unit = await units.findOne({ where: { providerId: provider.id, code }, withDeleted: true });
  if (!unit) unit = units.create({ reference: generateProviderServiceUnitReference(), providerId: provider.id, code });
  Object.assign(unit, { name: `Staging ${type.charAt(0)}${type.slice(1).toLowerCase()}`, type, description: 'Synthetic staging acceptance service unit', status: ProviderServiceUnitStatus.ACTIVE, providerLocationId: location.id, deletedAt: null });
  return units.save(unit);
}

async function upsertCatalogueOfferings(manager: EntityManager, provider: Provider, unit: ProviderServiceUnit, category: SmartClinicCatalogueCategory): Promise<void> {
  const items = await manager.getRepository(SmartClinicServiceCatalogueItem).find({ where: { category, isActive: true } });
  const offerings = manager.getRepository(ProviderCatalogueOffering);
  for (const item of items) {
    let offering = await offerings.findOne({ where: { providerServiceUnitId: unit.id, catalogueItemId: item.id } });
    if (!offering) offering = offerings.create({ providerId: provider.id, providerServiceUnitId: unit.id, catalogueItemId: item.id });
    offering.providerId = provider.id;
    offering.isActive = true;
    offering.priceOverrideMinor = null;
    await offerings.save(offering);
  }
}

async function run(): Promise<void> {
  await dataSource.initialize();
  try { console.log(JSON.stringify(await seedStagingAcceptanceAccounts(dataSource), null, 2)); }
  finally { await dataSource.destroy(); }
}

if (require.main === module) {
  void run().catch((error: unknown) => { console.error('Staging acceptance account seed failed.', error); process.exitCode = 1; });
}
