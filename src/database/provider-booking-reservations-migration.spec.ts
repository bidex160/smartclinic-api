import { ProviderBookingReservations1787760000000 } from './migrations/1787760000000-ProviderBookingReservations';

describe('ProviderBookingReservations migration', () => {
  it('uses a concurrency-safe half-open exclusion for HELD and CONFIRMED only', async () => {
    const sql: string[] = [];
    await new ProviderBookingReservations1787760000000().up({ query: jest.fn(async (statement: string) => { sql.push(statement); }) } as never);
    const table = sql.find((statement) => statement.includes('CREATE TABLE "provider_booking_reservations"'))!;
    expect(table).toContain('EX_provider_booking_reservations_active_overlap');
    expect(table).toContain("'[)'");
    expect(table).toContain("WHERE (\"status\" IN ('HELD', 'CONFIRMED'))");
    expect(table).not.toContain("WHERE (\"status\" IN ('RELEASED', 'CANCELLED'))");
  });
});
