import { ProviderPayoutsFoundation1791561600000 } from './migrations/1791561600000-ProviderPayoutsFoundation';

describe('ProviderPayoutsFoundation migration', () => {
  it('preserves historical membership while enforcing one unreleased reservation per earning', async () => {
    const sql: string[] = []; await new ProviderPayoutsFoundation1791561600000().up({ query: jest.fn(async value => { sql.push(value); }) } as never);
    expect(sql.join(' ')).toContain('UQ_provider_payout_earning_active_reservation');
    expect(sql.join(' ')).toContain('WHERE "released_at" IS NULL');
    expect(sql.join(' ')).toContain('"provider_share_minor" bigint NOT NULL');
  });
});
