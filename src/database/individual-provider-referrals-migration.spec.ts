import { IndividualProviderReferrals1794844800000 } from './migrations/1794844800000-IndividualProviderReferrals';

describe('IndividualProviderReferrals migration', () => {
  it('only extends referral enum and idempotent reward/level configuration', async () => {
    const queries: string[] = [];
    const runner: any = { query: jest.fn(async (sql: string) => { queries.push(sql); }) };
    await new IndividualProviderReferrals1794844800000().up(runner);
    expect(queries).toHaveLength(3);
    expect(queries[0]).toContain("ADD VALUE IF NOT EXISTS 'INDIVIDUAL'");
    expect(queries[1]).toContain('INDIVIDUAL_PROVIDER_QUALIFIED');
    expect(queries[2]).toContain("'INDIVIDUAL'::\"referral_target_type_enum\"");
  });
});
