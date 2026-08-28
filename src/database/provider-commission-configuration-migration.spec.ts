import { ProviderCommissionConfiguration1790265600000 } from './migrations/1790265600000-ProviderCommissionConfiguration';

describe('ProviderCommissionConfiguration migration', () => {
  it('bootstraps an explicitly unconfigured default and no Provider overrides', async () => {
    const sql: string[] = [];
    await new ProviderCommissionConfiguration1790265600000().up({ query: jest.fn(async statement => { sql.push(statement); }) } as never);
    expect(sql).toContain('INSERT INTO "platform_commission_settings" ("id", "default_provider_commission_bps", "updated_by_user_id") VALUES (1, NULL, NULL)');
    expect(sql.join(' ')).not.toMatch(/UPDATE "providers" SET "commission_override_bps"/);
    expect(sql.join(' ')).toContain('"commission_override_bps" IS NULL OR');
  });
  it('reverts all commission schema objects', async () => {
    const sql: string[] = [];
    await new ProviderCommissionConfiguration1790265600000().down({ query: jest.fn(async statement => { sql.push(statement); }) } as never);
    expect(sql).toContain('ALTER TABLE "providers" DROP COLUMN "commission_override_bps"');
    expect(sql).toContain('DROP TYPE "commission_config_target_enum"');
  });
});
