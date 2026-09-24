import { MigrationInterface, QueryRunner } from 'typeorm';

export class WalletTopUpPaymentFlow1795708800000 implements MigrationInterface {
  name = 'WalletTopUpPaymentFlow1795708800000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE "wallet_top_up_status_enum" AS ENUM ('PENDING','PAID','FAILED')`);
    await q.query(`CREATE TABLE "wallet_top_ups" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "reference" varchar(64) NOT NULL,
      "user_id" uuid NOT NULL,
      "amount_minor" bigint NOT NULL,
      "currency" char(3) NOT NULL DEFAULT 'NGN',
      "status" "wallet_top_up_status_enum" NOT NULL DEFAULT 'PENDING',
      "connection_reference" varchar(64),
      "paid_at" TIMESTAMPTZ,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "CHK_wallet_top_ups_amount_positive" CHECK ("amount_minor" > 0),
      CONSTRAINT "UQ_wallet_top_ups_reference" UNIQUE ("reference"),
      CONSTRAINT "PK_wallet_top_ups" PRIMARY KEY ("id")
    )`);
    await q.query(`CREATE INDEX "IDX_wallet_top_ups_user_status" ON "wallet_top_ups" ("user_id","status")`);
    await q.query(`ALTER TABLE "wallet_top_ups" ADD CONSTRAINT "FK_wallet_top_ups_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT`);

    await q.query(`ALTER TABLE "payment_attempts" DROP CONSTRAINT "CHK_payment_attempts_obligation"`);
    await q.query(`ALTER TABLE "payment_attempts" ADD "wallet_top_up_id" uuid`);
    await q.query(`ALTER TABLE "payment_attempts" ADD CONSTRAINT "FK_payment_attempts_wallet_top_up" FOREIGN KEY ("wallet_top_up_id") REFERENCES "wallet_top_ups"("id") ON DELETE RESTRICT`);
    await q.query(`CREATE INDEX "IDX_payment_attempts_wallet_top_up_status" ON "payment_attempts" ("wallet_top_up_id","status")`);
    await q.query(`ALTER TABLE "payment_attempts" ADD CONSTRAINT "CHK_payment_attempts_obligation" CHECK (
      (CASE WHEN "booking_funding_id" IS NULL THEN 0 ELSE 1 END +
       CASE WHEN "fasttrack_request_id" IS NULL THEN 0 ELSE 1 END +
       CASE WHEN "care_request_funding_id" IS NULL THEN 0 ELSE 1 END +
       CASE WHEN "patient_provider_connection_funding_id" IS NULL THEN 0 ELSE 1 END +
       CASE WHEN "pharmacy_fulfillment_funding_id" IS NULL THEN 0 ELSE 1 END +
       CASE WHEN "guided_self_check_id" IS NULL THEN 0 ELSE 1 END +
       CASE WHEN "diagnostic_fulfillment_funding_id" IS NULL THEN 0 ELSE 1 END +
       CASE WHEN "wallet_top_up_id" IS NULL THEN 0 ELSE 1 END) = 1
    )`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "payment_attempts" DROP CONSTRAINT "CHK_payment_attempts_obligation"`);
    await q.query(`DROP INDEX "public"."IDX_payment_attempts_wallet_top_up_status"`);
    await q.query(`ALTER TABLE "payment_attempts" DROP CONSTRAINT "FK_payment_attempts_wallet_top_up"`);
    await q.query(`ALTER TABLE "payment_attempts" DROP COLUMN "wallet_top_up_id"`);
    await q.query(`ALTER TABLE "payment_attempts" ADD CONSTRAINT "CHK_payment_attempts_obligation" CHECK (
      (CASE WHEN "booking_funding_id" IS NULL THEN 0 ELSE 1 END +
       CASE WHEN "fasttrack_request_id" IS NULL THEN 0 ELSE 1 END +
       CASE WHEN "care_request_funding_id" IS NULL THEN 0 ELSE 1 END +
       CASE WHEN "patient_provider_connection_funding_id" IS NULL THEN 0 ELSE 1 END +
       CASE WHEN "pharmacy_fulfillment_funding_id" IS NULL THEN 0 ELSE 1 END +
       CASE WHEN "guided_self_check_id" IS NULL THEN 0 ELSE 1 END +
       CASE WHEN "diagnostic_fulfillment_funding_id" IS NULL THEN 0 ELSE 1 END) = 1
    )`);
    await q.query(`ALTER TABLE "wallet_top_ups" DROP CONSTRAINT "FK_wallet_top_ups_user"`);
    await q.query(`DROP TABLE "wallet_top_ups"`);
    await q.query(`DROP TYPE "wallet_top_up_status_enum"`);
  }
}
