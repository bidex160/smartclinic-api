import { getMetadataArgsStorage } from 'typeorm';
import { PublicLeaderboardParticipationDefault1793376000000 } from './migrations/1793376000000-PublicLeaderboardParticipationDefault';
import { User } from '../users/entities/user.entity';

describe('PublicLeaderboardParticipationDefault migration', () => {
  it('defaults new users to participation in both entity and database metadata', async () => {
    const column = getMetadataArgsStorage().columns.find(
      (candidate) => candidate.target === User && candidate.propertyName === 'publicLeaderboard',
    );
    expect(column?.options.default).toBe(true);

    const sql: string[] = [];
    await new PublicLeaderboardParticipationDefault1793376000000().up({
      query: jest.fn(async (statement: string) => { sql.push(statement); }),
    } as never);
    expect(sql).toEqual([
      'ALTER TABLE "users" ALTER COLUMN "public_leaderboard" SET DEFAULT true',
    ]);
  });

  it('preserves every existing participation choice instead of backfilling ambiguous false values', async () => {
    const sql: string[] = [];
    const migration = new PublicLeaderboardParticipationDefault1793376000000();
    const runner = { query: jest.fn(async (statement: string) => { sql.push(statement); }) } as never;

    await migration.up(runner);
    await migration.down(runner);

    expect(sql.join(' ')).not.toMatch(/\bUPDATE\b/i);
    expect(sql.at(-1)).toBe(
      'ALTER TABLE "users" ALTER COLUMN "public_leaderboard" SET DEFAULT false',
    );
  });
});
