import { resolve } from 'node:path';
import { seedStagingPartnerFacilityDirectory } from './staging-partner-facility-directory.seed';
import { PartnerFacilityReadiness } from '../../patient-provider-connections/entities/partner-facility-listing.entity';

describe('staging tertiary facility snapshot', () => {
  it('imports all 79 official federal tertiary listings as available to join with stable references', async () => {
    const saved: any[] = [];
    const repository: any = {
      findOneBy: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => { saved.push(value); return value; }),
    };
    const connection: any = { getRepository: jest.fn(() => repository) };

    const result = await seedStagingPartnerFacilityDirectory(connection, {
      confirmation: 'SMARTCLINIC_STAGING_ONLY',
      source: 'FMOH-TERTIARY',
      importPath: resolve(__dirname, 'data/fmoh-tertiary-facilities-2026-09-30.json'),
    });

    expect(result).toEqual({ source: 'FMOH-TERTIARY', imported: 79 });
    expect(new Set(saved.map((row) => row.sourceReference)).size).toBe(79);
    expect(saved.every((row) => row.readiness === PartnerFacilityReadiness.AVAILABLE_TO_JOIN)).toBe(true);
    expect(saved.filter((row) => row.stateOrRegion === 'Lagos State')).toHaveLength(5);
    expect(saved.filter((row) => row.stateOrRegion === 'Kano State')).toHaveLength(3);
    expect(saved.every((row) => row.providerId === null)).toBe(true);
  });
});
