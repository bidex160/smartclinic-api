import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProviderPayoutsFoundation1791561600000 implements MigrationInterface {
  name = 'ProviderPayoutsFoundation1791561600000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "provider_payout_status_enum" AS ENUM ('DRAFT','PROCESSING','COMPLETED','FAILED','CANCELLED')`);
    await queryRunner.query(`CREATE TYPE "provider_payout_settlement_method_enum" AS ENUM ('MANUAL_BANK_TRANSFER','MANUAL_OTHER')`);
    await queryRunner.query(`CREATE TABLE "provider_payouts" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "reference" varchar(40) NOT NULL,
      "provider_id" uuid NOT NULL, "currency" char(3) NOT NULL, "total_amount_minor" bigint NOT NULL,
      "earning_count" integer NOT NULL, "status" "provider_payout_status_enum" NOT NULL,
      "settlement_method" "provider_payout_settlement_method_enum" NOT NULL,
      "external_reference" varchar(160), "note" varchar(1000), "initiated_by_user_id" uuid NOT NULL,
      "processing_at" timestamptz, "completed_at" timestamptz, "failed_at" timestamptz, "cancelled_at" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_provider_payouts" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_provider_payouts_reference" UNIQUE ("reference"),
      CONSTRAINT "CHK_provider_payouts_amount_count" CHECK ("total_amount_minor" >= 0 AND "earning_count" > 0),
      CONSTRAINT "CHK_provider_payouts_currency" CHECK ("currency" ~ '^[A-Z]{3}$'),
      CONSTRAINT "FK_provider_payouts_provider" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_provider_payouts_initiator" FOREIGN KEY ("initiated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_provider_payouts_external_reference" ON "provider_payouts"("external_reference") WHERE "external_reference" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_provider_payouts_provider_status_created" ON "provider_payouts"("provider_id","status","created_at")`);
    await queryRunner.query(`CREATE INDEX "IDX_provider_payouts_status_currency_created" ON "provider_payouts"("status","currency","created_at")`);
    await queryRunner.query(`CREATE TABLE "provider_payout_earnings" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "payout_id" uuid NOT NULL, "provider_earning_id" uuid NOT NULL,
      "provider_share_minor" bigint NOT NULL, "released_at" timestamptz, "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_provider_payout_earnings" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_provider_payout_earning_membership" UNIQUE ("payout_id","provider_earning_id"),
      CONSTRAINT "CHK_provider_payout_earning_amount" CHECK ("provider_share_minor" >= 0),
      CONSTRAINT "FK_provider_payout_earnings_payout" FOREIGN KEY ("payout_id") REFERENCES "provider_payouts"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_provider_payout_earnings_earning" FOREIGN KEY ("provider_earning_id") REFERENCES "provider_earnings"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_provider_payout_earning_active_reservation" ON "provider_payout_earnings"("provider_earning_id") WHERE "released_at" IS NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_provider_payout_earnings_payout" ON "provider_payout_earnings"("payout_id")`);
    await queryRunner.query(`CREATE TABLE "provider_payout_status_history" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "payout_id" uuid NOT NULL,
      "from_status" "provider_payout_status_enum", "to_status" "provider_payout_status_enum" NOT NULL,
      "actor_user_id" uuid NOT NULL, "reason_code" varchar(80) NOT NULL, "reason_note" varchar(1000),
      "created_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_provider_payout_status_history" PRIMARY KEY ("id"),
      CONSTRAINT "FK_provider_payout_history_payout" FOREIGN KEY ("payout_id") REFERENCES "provider_payouts"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_provider_payout_history_actor" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_provider_payout_status_history_payout_created" ON "provider_payout_status_history"("payout_id","created_at")`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "provider_payout_status_history"`);
    await queryRunner.query(`DROP TABLE "provider_payout_earnings"`);
    await queryRunner.query(`DROP TABLE "provider_payouts"`);
    await queryRunner.query(`DROP TYPE "provider_payout_settlement_method_enum"`);
    await queryRunner.query(`DROP TYPE "provider_payout_status_enum"`);
  }
}
