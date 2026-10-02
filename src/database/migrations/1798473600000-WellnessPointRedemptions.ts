import { MigrationInterface, QueryRunner } from 'typeorm';

/** Health Check redemptions can now be paid with wellness points as well as referral points. */
export class WellnessPointRedemptions1798473600000 implements MigrationInterface {
  name = 'WellnessPointRedemptions1798473600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "reward_point_source_enum" AS ENUM ('REFERRAL', 'WELLNESS')`);
    await queryRunner.query(`ALTER TABLE "reward_booking_redemptions" ADD "point_source" "reward_point_source_enum" NOT NULL DEFAULT 'REFERRAL'`);
    await queryRunner.query(`CREATE INDEX "IDX_reward_booking_redemption_user_source_status" ON "reward_booking_redemptions" ("user_id", "point_source", "status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_reward_booking_redemption_user_source_status"`);
    await queryRunner.query(`ALTER TABLE "reward_booking_redemptions" DROP COLUMN "point_source"`);
    await queryRunner.query(`DROP TYPE "reward_point_source_enum"`);
  }
}
