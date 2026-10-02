import { MigrationInterface, QueryRunner } from 'typeorm';

/** Refunded redemptions, staff point adjustments, and app settings (pause / rate / cap). */
export class WellnessPointsSafety1798560000000 implements MigrationInterface {
  name = 'WellnessPointsSafety1798560000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "reward_booking_redemption_status_enum" ADD VALUE IF NOT EXISTS 'REFUNDED'`);
    await queryRunner.query(`CREATE TABLE "wellness_point_adjustments" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "points" integer NOT NULL,
      "reason" varchar(300) NOT NULL, "admin_user_id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_wellness_point_adjustments" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_wellness_point_adjustment_nonzero" CHECK ("points" <> 0),
      CONSTRAINT "FK_wellness_point_adjustment_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_wellness_point_adjustment_admin" FOREIGN KEY ("admin_user_id") REFERENCES "users"("id") ON DELETE RESTRICT)`);
    await queryRunner.query(`CREATE INDEX "IDX_wellness_point_adjustment_user_created" ON "wellness_point_adjustments" ("user_id", "created_at")`);
    await queryRunner.query(`CREATE TABLE "app_settings" (
      "key" varchar(80) NOT NULL, "value" jsonb NOT NULL, "updated_by_user_id" uuid, "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_app_settings" PRIMARY KEY ("key"))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "app_settings"`);
    await queryRunner.query(`DROP TABLE "wellness_point_adjustments"`);
    // Postgres can't drop one enum value; turn any REFUNDED rows back into CANCELLED so older code still reads them.
    await queryRunner.query(`UPDATE "reward_booking_redemptions" SET "status" = 'CANCELLED' WHERE "status" = 'REFUNDED'`);
  }
}
