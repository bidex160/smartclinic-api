import { CanonicalHealthCheckClinicalContent1793548800000 } from './migrations/1793548800000-CanonicalHealthCheckClinicalContent';

describe('CanonicalHealthCheckClinicalContent migration', () => {
  it('normalizes package contents and provider add-ons without rewriting historical snapshots', async () => {
    const queries: string[] = [];
    const runner = { query: jest.fn(async (sql: string) => queries.push(sql)) } as never;

    await new CanonicalHealthCheckClinicalContent1793548800000().up(runner);
    const sql = queries.join('\n');

    expect(sql).toContain('health_check_clinical_contents');
    expect(sql).toContain('clinical_content_id');
    expect(sql).toContain("WHEN code = 'BLOOD_PRESSURE' THEN 'BLOOD_PRESSURE'");
    expect(sql).toContain("WHEN code IN ('BLOOD_GLUCOSE', 'BMI', 'TEMPERATURE', 'OXYGEN_SATURATION', 'PULSE')");
    expect(sql).toContain('Conflicting Health Check clinical definitions share a code');
    expect(sql).toContain('Health Check clinical content code is immutable');
    expect(sql).not.toContain('health_check_configuration_quotes" SET');
    expect(sql).not.toContain('bookings" SET');
  });

  it('provides a reversible compatibility migration', async () => {
    const queries: string[] = [];
    const runner = { query: jest.fn(async (sql: string) => queries.push(sql)) } as never;

    await new CanonicalHealthCheckClinicalContent1793548800000().down(runner);
    const sql = queries.join('\n');

    expect(sql).toContain('CREATE TABLE "health_check_addons"');
    expect(sql).toContain('ADD "addon_id" uuid');
    expect(sql).toContain('ADD "code" varchar(80)');
    expect(sql).toContain('DROP TABLE "health_check_clinical_contents"');
  });
});
