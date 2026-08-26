import { MigrationInterface, QueryRunner } from "typeorm";

export class ManualRewardWithdrawals1789228800000 implements MigrationInterface {
  name = "ManualRewardWithdrawals1789228800000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "reward_withdrawal_status_enum" AS ENUM ('REQUESTED', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED')`);
    await queryRunner.query(`CREATE TABLE "reward_withdrawal_requests" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "public_reference" varchar(32) NOT NULL, "user_id" uuid NOT NULL,
      "points_requested" integer NOT NULL, "rate_points" integer NOT NULL, "rate_amount_minor" bigint NOT NULL,
      "amount_minor" bigint NOT NULL, "currency" varchar(3) NOT NULL, "bank_name" varchar(120) NOT NULL,
      "bank_code" varchar(20), "account_number" varchar(20) NOT NULL, "account_name" varchar(160) NOT NULL,
      "status" "reward_withdrawal_status_enum" NOT NULL, "requested_at" timestamptz NOT NULL,
      "processing_at" timestamptz, "paid_at" timestamptz, "failed_at" timestamptz, "cancelled_at" timestamptz,
      "processed_by_user_id" uuid, "admin_note" varchar(1000), "external_reference" varchar(160),
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_reward_withdrawal_requests" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_reward_withdrawal_positive" CHECK ("points_requested" > 0 AND "rate_points" > 0 AND "rate_amount_minor" > 0 AND "amount_minor" > 0),
      CONSTRAINT "FK_reward_withdrawal_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_reward_withdrawal_processor" FOREIGN KEY ("processed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_reward_withdrawal_public_reference" ON "reward_withdrawal_requests" ("public_reference")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_reward_withdrawal_external_reference" ON "reward_withdrawal_requests" ("external_reference") WHERE "external_reference" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_reward_withdrawal_user_status" ON "reward_withdrawal_requests" ("user_id", "status")`);
    await queryRunner.query(`CREATE INDEX "IDX_reward_withdrawal_status_requested" ON "reward_withdrawal_requests" ("status", "requested_at")`);
    await queryRunner.query(`CREATE TABLE "reward_withdrawal_status_history" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "withdrawal_id" uuid NOT NULL,
      "from_status" "reward_withdrawal_status_enum", "to_status" "reward_withdrawal_status_enum" NOT NULL,
      "actor_user_id" uuid NOT NULL, "reason_code" varchar(80) NOT NULL, "reason_note" varchar(1000),
      "created_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_reward_withdrawal_status_history" PRIMARY KEY ("id"),
      CONSTRAINT "FK_reward_withdrawal_history_withdrawal" FOREIGN KEY ("withdrawal_id") REFERENCES "reward_withdrawal_requests"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_reward_withdrawal_history_actor" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_reward_withdrawal_history_withdrawal_created" ON "reward_withdrawal_status_history" ("withdrawal_id", "created_at")`);
    await queryRunner.query(`CREATE FUNCTION prevent_reward_withdrawal_history_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Reward withdrawal history is append-only'; END; $$ LANGUAGE plpgsql`);
    await queryRunner.query(`CREATE TRIGGER "TRG_reward_withdrawal_history_no_mutation" BEFORE UPDATE OR DELETE ON "reward_withdrawal_status_history" FOR EACH ROW EXECUTE FUNCTION prevent_reward_withdrawal_history_mutation()`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "reward_withdrawal_status_history"`);
    await queryRunner.query(`DROP FUNCTION prevent_reward_withdrawal_history_mutation()`);
    await queryRunner.query(`DROP TABLE "reward_withdrawal_requests"`);
    await queryRunner.query(`DROP TYPE "reward_withdrawal_status_enum"`);
  }
}
