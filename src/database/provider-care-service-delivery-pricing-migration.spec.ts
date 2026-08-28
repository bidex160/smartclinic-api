import { ProviderCareServiceDeliveryPricing1790092800000 } from './migrations/1790092800000-ProviderCareServiceDeliveryPricing';

describe('ProviderCareServiceDeliveryPricing migration', () => {
  it('backfills every legacy supported mode from the offering-wide price and snapshots assigned Care Requests', async () => {
    const sql: string[] = [];
    await new ProviderCareServiceDeliveryPricing1790092800000().up({ query: jest.fn(async (statement: string) => { sql.push(statement); }) } as never);
    const optionBackfill = sql.find((statement) => statement.includes('INSERT INTO "provider_care_service_delivery_options"'))!;
    expect(optionBackfill).toContain('unnest(service.delivery_modes)');
    expect(optionBackfill).toContain('service.price_minor');
    expect(optionBackfill).toContain('service.currency');
    const requestBackfill = sql.find((statement) => statement.includes('UPDATE "care_requests" request'))!;
    expect(requestBackfill).toContain('option.provider_care_service_id = request.assigned_provider_care_service_id');
    expect(requestBackfill).toContain('option.delivery_mode = request.delivery_mode');
  });

  it('fails closed rather than fabricating free prices for legacy price-on-request offerings', async () => {
    const sql: string[] = [];
    await new ProviderCareServiceDeliveryPricing1790092800000().up({ query: jest.fn(async (statement: string) => { sql.push(statement); }) } as never);
    expect(sql[0]).toContain('price_minor IS NULL OR currency IS NULL');
    expect(sql[0]).toContain('RAISE EXCEPTION');
  });
});
