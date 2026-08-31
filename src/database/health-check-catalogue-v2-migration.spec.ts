import { HealthCheckCatalogueV21792425600000 } from './migrations/1792425600000-HealthCheckCatalogueV2';

describe('HealthCheckCatalogueV2 migration', () => {
  it('creates explicit contents/add-on capability and immutable booking snapshot structures without seeding speculative add-ons', async () => {
    const queries: string[] = []; const runner = { query: jest.fn(async (sql: string) => queries.push(sql)) } as never;
    await new HealthCheckCatalogueV21792425600000().up(runner);
    const sql = queries.join('\n');
    expect(sql).toContain('health_check_package_contents');
    expect(sql).toContain('provider_service_addons');
    expect(sql).toContain('fulfilment_fee_minor');
    expect(sql).toContain('commercial_configuration_snapshot');
    expect(sql).not.toContain("INSERT INTO \"health_check_addons\"");
    expect(sql).toContain("('ESSENTIAL','BLOOD_PRESSURE'");
    expect(sql).toContain("('COMPLETE','BLOOD_PRESSURE'");
  });
});
