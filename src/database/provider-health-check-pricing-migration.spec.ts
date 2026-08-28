import { ProviderHealthCheckPricing1790179200000 } from './migrations/1790179200000-ProviderHealthCheckPricing';

describe('ProviderHealthCheckPricing migration', () => {
  it('backfills each exact ProviderService from the legacy package/mode price without touching payment transactions', async () => {
    const sql: string[] = [];
    await new ProviderHealthCheckPricing1790179200000().up({ query: jest.fn(async (statement: string) => { sql.push(statement); }) } as never);
    const backfill = sql.find((statement) => statement.startsWith('UPDATE "provider_services"'))!;
    expect(backfill).toContain('price.health_check_package_id = service.health_check_package_id');
    expect(backfill).toContain('price.fulfilment_mode_id = service.fulfilment_mode_id');
    expect(backfill).toContain('ROUND(price.amount * 100)');
    expect(sql.join(' ')).not.toContain('payment_transactions');
  });

  it('fails closed when a legacy capability has no unambiguous commercial price', async () => {
    const sql: string[] = [];
    await new ProviderHealthCheckPricing1790179200000().up({ query: jest.fn(async (statement: string) => { sql.push(statement); }) } as never);
    expect(sql.some((statement) => statement.includes('provider_services WHERE price_minor IS NULL OR currency IS NULL') && statement.includes('RAISE EXCEPTION'))).toBe(true);
  });
});
