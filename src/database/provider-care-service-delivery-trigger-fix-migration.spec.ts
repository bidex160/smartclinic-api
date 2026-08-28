import { FixProviderCareServiceDeliveryOptionTrigger1790524800000 } from './migrations/1790524800000-FixProviderCareServiceDeliveryOptionTrigger';

describe('FixProviderCareServiceDeliveryOptionTrigger migration', () => {
  it('uses table-specific row shapes for the deferred integrity checks', async () => {
    const sql: string[] = [];
    await new FixProviderCareServiceDeliveryOptionTrigger1790524800000().up({ query: jest.fn(async (statement: string) => { sql.push(statement); }) } as never);

    const serviceFunction = sql.find((statement) => statement.includes('CREATE FUNCTION enforce_provider_care_service_has_delivery_option'))!;
    const optionFunction = sql.find((statement) => statement.includes('CREATE FUNCTION prevent_empty_provider_care_service_delivery_options'))!;
    expect(serviceFunction).toContain('NEW.id');
    expect(serviceFunction).not.toContain('provider_care_service_id = OLD');
    expect(optionFunction).toContain('OLD.provider_care_service_id');
    expect(optionFunction).not.toContain('NEW.id');
    expect(sql).toContainEqual(expect.stringContaining('AFTER INSERT OR UPDATE ON "provider_care_services"'));
    expect(sql).toContainEqual(expect.stringContaining('AFTER DELETE ON "provider_care_service_delivery_options"'));
  });

  it('restores the prior trigger objects on rollback', async () => {
    const sql: string[] = [];
    await new FixProviderCareServiceDeliveryOptionTrigger1790524800000().down({ query: jest.fn(async (statement: string) => { sql.push(statement); }) } as never);
    expect(sql).toContainEqual(expect.stringContaining('CREATE FUNCTION enforce_provider_care_service_delivery_option()'));
    expect(sql).toContainEqual(expect.stringContaining('TRG_provider_care_services_require_delivery_option'));
    expect(sql).toContainEqual(expect.stringContaining('TRG_provider_care_delivery_options_prevent_empty'));
  });
});
