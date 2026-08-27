import { MigrationInterface, QueryRunner } from "typeorm";

export class HealthCheckRewardRedemptions1789401600000 implements MigrationInterface {
  name = "HealthCheckRewardRedemptions1789401600000";
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "reward_booking_redemption_status_enum" AS ENUM ('RESERVED', 'SETTLED', 'RELEASED', 'CANCELLED')`);
    await queryRunner.query(`CREATE TABLE "reward_booking_redemptions" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "booking_id" uuid NOT NULL, "user_id" uuid NOT NULL,
      "points_reserved" integer NOT NULL, "rate_points" integer NOT NULL, "rate_amount_minor" bigint NOT NULL,
      "amount_minor" bigint NOT NULL, "currency" varchar(3) NOT NULL, "status" "reward_booking_redemption_status_enum" NOT NULL,
      "settled_at" timestamptz, "released_at" timestamptz, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_reward_booking_redemptions" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_reward_booking_redemption_positive" CHECK ("points_reserved" > 0 AND "rate_points" > 0 AND "rate_amount_minor" > 0 AND "amount_minor" > 0),
      CONSTRAINT "FK_reward_booking_redemption_booking" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_reward_booking_redemption_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_reward_booking_redemption_active_booking" ON "reward_booking_redemptions" ("booking_id") WHERE "status" = 'RESERVED'`);
    await queryRunner.query(`CREATE INDEX "IDX_reward_booking_redemption_user_status" ON "reward_booking_redemptions" ("user_id", "status")`);
    await queryRunner.query(`CREATE INDEX "IDX_reward_booking_redemption_booking_created" ON "reward_booking_redemptions" ("booking_id", "created_at" DESC)`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "reward_booking_redemptions"`);
    await queryRunner.query(`DROP TYPE "reward_booking_redemption_status_enum"`);
  }
}
