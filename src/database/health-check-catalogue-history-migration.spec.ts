import { HealthCheckCatalogueHistory1793721600000 } from './migrations/1793721600000-HealthCheckCatalogueHistory';

describe('HealthCheckCatalogueHistory migration', () => {
  it('creates an append-only target/actor history table with restrictive foreign keys', async () => {
    const query = jest.fn();
    await new HealthCheckCatalogueHistory1793721600000().up({ query } as any);
    const sql = query.mock.calls.flat().join(' ');
    expect(sql).toContain('health_check_catalogue_history');
    expect(sql).toContain('previous_state');
    expect(sql).toContain('resulting_state');
    expect(sql).toContain('ON DELETE RESTRICT');
    expect(sql).toContain('CHK_health_check_catalogue_history_target');
    expect(sql).toContain('TR_health_check_catalogue_history_append_only');
  });

  it('refuses to discard real catalogue history during rollback', async () => {
    const query = jest.fn(); await new HealthCheckCatalogueHistory1793721600000().down({ query } as any);
    expect(query.mock.calls[0][0]).toContain('Cannot remove non-empty Health Check catalogue history');
  });
});
