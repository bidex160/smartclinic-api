import { MigrationInterface, QueryRunner } from 'typeorm';

export class PublicReferralLeaderboardConsent1789488000000 implements MigrationInterface {
  name = 'PublicReferralLeaderboardConsent1789488000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "public_leaderboard" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`CREATE INDEX "IDX_users_public_leaderboard_opted_in" ON "users" ("id") WHERE "public_leaderboard" = true AND "deleted_at" IS NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_users_public_leaderboard_opted_in"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "public_leaderboard"`);
  }
}
