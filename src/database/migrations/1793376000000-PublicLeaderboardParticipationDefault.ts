import { MigrationInterface, QueryRunner } from 'typeorm';

export class PublicLeaderboardParticipationDefault1793376000000
  implements MigrationInterface
{
  name = 'PublicLeaderboardParticipationDefault1793376000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // New users participate by default. Existing users keep their
    // current choice; false may represent an explicit opt-out.
    await queryRunner.query(
      'ALTER TABLE "users" ALTER COLUMN "public_leaderboard" SET DEFAULT true',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore only the schema default. Never rewrite user choices.
    await queryRunner.query(
      'ALTER TABLE "users" ALTER COLUMN "public_leaderboard" SET DEFAULT false',
    );
  }
}
