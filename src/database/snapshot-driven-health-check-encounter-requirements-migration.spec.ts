import { SnapshotDrivenHealthCheckEncounterRequirements1793808000000 } from './migrations/1793808000000-SnapshotDrivenHealthCheckEncounterRequirements';

describe('SnapshotDrivenHealthCheckEncounterRequirements migration', () => {
  it('widens measurement codes without rewriting historical measurements or booking snapshots', async () => {
    const sql: string[] = [];
    await new SnapshotDrivenHealthCheckEncounterRequirements1793808000000().up({ query: jest.fn(async (value) => sql.push(value)) } as never);
    const all = sql.join(' ');
    expect(all).toContain('ALTER COLUMN "code" TYPE varchar(80)');
    expect(all).toContain('DROP CONSTRAINT "CHK_health_check_measurements_shape"');
    expect(all).not.toContain('UPDATE');
    expect(all).not.toContain('commercial_configuration_snapshot');
  });
});
