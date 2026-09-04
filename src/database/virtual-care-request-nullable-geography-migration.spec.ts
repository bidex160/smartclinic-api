import { VirtualCareRequestNullableGeography1793894400000 } from './migrations/1793894400000-VirtualCareRequestNullableGeography';

describe('VirtualCareRequestNullableGeography migration', () => {
  it('allows null geography only through a delivery-aware database constraint without rewriting history', async () => {
    const sql: string[] = [];
    await new VirtualCareRequestNullableGeography1793894400000().up({ query: jest.fn(async (value) => sql.push(value)) } as never);
    const all = sql.join(' ');
    expect(all).toContain('ALTER COLUMN "country_code" DROP NOT NULL');
    expect(all).toContain('CHK_care_requests_delivery_geography');
    expect(all).toContain(`"delivery_mode" = 'VIRTUAL'`);
    expect(all).not.toContain('UPDATE "care_requests"');
  });
});
