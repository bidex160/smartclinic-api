import { AddHospitalProviderType1793635200000 } from './migrations/1793635200000-AddHospitalProviderType';

describe('AddHospitalProviderType migration', () => {
  it('adds HOSPITAL without rewriting existing providers', async () => {
    const queries: string[] = [];
    const runner = { query: jest.fn(async (sql: string) => queries.push(sql)) } as never;

    await new AddHospitalProviderType1793635200000().up(runner);

    expect(queries).toEqual([expect.stringContaining(`ADD VALUE IF NOT EXISTS 'HOSPITAL'`)]);
    expect(queries.join('\n')).not.toContain('UPDATE "providers"');
  });

  it('refuses a destructive rollback when HOSPITAL providers exist', async () => {
    const queries: string[] = [];
    const runner = { query: jest.fn(async (sql: string) => queries.push(sql)) } as never;

    await new AddHospitalProviderType1793635200000().down(runner);
    const sql = queries.join('\n');

    expect(sql).toContain("provider_type::text = 'HOSPITAL'");
    expect(sql).toContain('Cannot remove HOSPITAL provider type while providers use it');
    expect(sql).not.toContain(`SET "provider_type" = 'OTHER'`);
  });
});
