import { readFile } from 'node:fs/promises';
import { DataSource } from 'typeorm';
import dataSource from '../data-source';
import { PartnerFacilityListing, PartnerFacilityReadiness, PartnerFacilityType } from '../../patient-provider-connections/entities/partner-facility-listing.entity';

export const STAGING_FACILITY_DIRECTORY_CONFIRMATION = 'SMARTCLINIC_STAGING_ONLY';

export interface FacilityDirectoryImportRow {
  sourceReference?: string;
  displayName: string;
  facilityType: PartnerFacilityType;
  countryCode: string;
  stateOrRegion?: string | null;
  city?: string | null;
  sourceVerifiedAt?: string | null;
}

export async function seedStagingPartnerFacilityDirectory(connection: DataSource, options: {
  confirmation?: string;
  source?: string;
  importPath?: string;
} = {}) {
  if ((options.confirmation ?? process.env.STAGING_FACILITY_DIRECTORY_CONFIRMATION) !== STAGING_FACILITY_DIRECTORY_CONFIRMATION) {
    throw new Error('Refusing to import facility records. Set STAGING_FACILITY_DIRECTORY_CONFIRMATION=SMARTCLINIC_STAGING_ONLY only on staging.');
  }
  const importPath = options.importPath ?? process.env.STAGING_FACILITY_DIRECTORY_IMPORT_PATH;
  if (!importPath) throw new Error('STAGING_FACILITY_DIRECTORY_IMPORT_PATH is required.');
  const source = (options.source ?? process.env.STAGING_FACILITY_DIRECTORY_SOURCE ?? 'NHFR').trim().toUpperCase();
  const rows = JSON.parse(await readFile(importPath, 'utf8')) as FacilityDirectoryImportRow[];
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('The facility import file must contain a non-empty JSON array.');
  const repo = connection.getRepository(PartnerFacilityListing);
  let imported = 0;
  for (const row of rows) {
    if (!row.displayName?.trim() || !Object.values(PartnerFacilityType).includes(row.facilityType) || !/^[A-Z]{2}$/.test(row.countryCode)) {
      throw new Error(`Invalid facility directory row: ${JSON.stringify(row)}`);
    }
    // Ministry list pages do not publish registry IDs. Use a stable key derived
    // from the official display name until an NHFR code is available.
    const sourceReference = (row.sourceReference?.trim() || `${source}-${row.displayName.trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-')}`).replace(/^-|-$/g, '');
    if (!sourceReference || sourceReference.length > 100) throw new Error(`Invalid facility source reference: ${sourceReference}`);
    const current = await repo.findOneBy({ source, sourceReference });
    const values = {
      sourceReference,
      displayName: row.displayName.trim(),
      facilityType: row.facilityType,
      countryCode: row.countryCode,
      stateOrRegion: row.stateOrRegion?.trim() || null,
      city: row.city?.trim() || null,
      sourceVerifiedAt: row.sourceVerifiedAt ? new Date(row.sourceVerifiedAt) : new Date(),
      active: true,
    };
    await repo.save(current
      ? Object.assign(current, values)
      : repo.create({ ...values, source, readiness: PartnerFacilityReadiness.AVAILABLE_TO_JOIN, providerId: null }));
    imported++;
  }
  return { source, imported };
}

async function run() {
  await dataSource.initialize();
  try {
    const result = await seedStagingPartnerFacilityDirectory(dataSource);
    console.log(`Imported ${result.imported} ${result.source} facilities into the staging directory.`);
  } finally { await dataSource.destroy(); }
}

if (require.main === module) void run().catch((error: unknown) => { console.error('Staging facility directory import failed.', error); process.exitCode = 1; });
