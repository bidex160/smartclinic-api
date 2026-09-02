import { MigrationInterface, QueryRunner } from 'typeorm';

export class PublicLeaderboardParticipationDefault1793376000000
  implements MigrationInterface
{
  name = 'PublicLeaderboardParticipationDefault1793376000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Existing users were created when leaderboard participation
    // defaulted to false. Enable participation for those users.
    await queryRunner.query(`
      UPDATE "users"
      SET "public_leaderboard" = true
      WHERE "public_leaderboard" = false
    `);

    // New users participate by default.
    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "public_leaderboard"
      SET DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Only restore the schema default.
    //
    // Do NOT mass-update users to false because after this migration
    // some users may have explicitly opted in/out.
    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "public_leaderboard"
      SET DEFAULT false
    `);
  }
}