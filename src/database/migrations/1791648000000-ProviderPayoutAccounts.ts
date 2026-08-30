import { MigrationInterface, QueryRunner } from 'typeorm';
export class ProviderPayoutAccounts1791648000000 implements MigrationInterface {
  name = 'ProviderPayoutAccounts1791648000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE "provider_payout_account_type_enum" AS ENUM ('BANK_ACCOUNT')`);
    await q.query(`CREATE TYPE "provider_payout_account_status_enum" AS ENUM ('PENDING_VERIFICATION','VERIFIED','DISABLED')`);
    await q.query(`CREATE TABLE "provider_payout_accounts" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "reference" varchar(40) NOT NULL, "provider_id" uuid NOT NULL,
      "type" "provider_payout_account_type_enum" NOT NULL, "country_code" char(2) NOT NULL, "currency" char(3) NOT NULL,
      "bank_code" varchar(20) NOT NULL, "bank_name" varchar(120) NOT NULL, "account_number_encrypted" text NOT NULL,
      "account_number_iv" varchar(32) NOT NULL, "account_number_auth_tag" varchar(32) NOT NULL,
      "account_number_fingerprint" char(64) NOT NULL, "account_number_last4" char(4) NOT NULL, "account_name" varchar(160) NOT NULL,
      "status" "provider_payout_account_status_enum" NOT NULL, "is_default" boolean NOT NULL DEFAULT false,
      "verified_at" timestamptz, "disabled_at" timestamptz, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_provider_payout_accounts" PRIMARY KEY ("id"), CONSTRAINT "UQ_provider_payout_accounts_reference" UNIQUE ("reference"),
      CONSTRAINT "CHK_provider_payout_accounts_country" CHECK ("country_code" ~ '^[A-Z]{2}$'),
      CONSTRAINT "CHK_provider_payout_accounts_currency" CHECK ("currency" ~ '^[A-Z]{3}$'),
      CONSTRAINT "CHK_provider_payout_accounts_default_verified" CHECK (NOT "is_default" OR "status" = 'VERIFIED'),
      CONSTRAINT "FK_provider_payout_accounts_provider" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT
    )`);
    await q.query(`CREATE UNIQUE INDEX "UQ_provider_payout_accounts_active_identity" ON "provider_payout_accounts"("provider_id","country_code","currency","bank_code","account_number_fingerprint") WHERE "status" <> 'DISABLED'`);
    await q.query(`CREATE UNIQUE INDEX "UQ_provider_payout_accounts_default_currency" ON "provider_payout_accounts"("provider_id","currency") WHERE "is_default" = true`);
    await q.query(`CREATE INDEX "IDX_provider_payout_accounts_provider_status_created" ON "provider_payout_accounts"("provider_id","status","created_at")`);
    await q.query(`CREATE TABLE "provider_payout_account_history" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "account_id" uuid NOT NULL, "event_type" varchar(80) NOT NULL,
      "from_status" "provider_payout_account_status_enum", "to_status" "provider_payout_account_status_enum" NOT NULL,
      "actor_user_id" uuid NOT NULL, "reason_note" varchar(1000), "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_provider_payout_account_history" PRIMARY KEY ("id"),
      CONSTRAINT "FK_provider_payout_account_history_account" FOREIGN KEY ("account_id") REFERENCES "provider_payout_accounts"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_provider_payout_account_history_actor" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
    )`);
    await q.query(`CREATE INDEX "IDX_provider_payout_account_history_account_created" ON "provider_payout_account_history"("account_id","created_at")`);
  }
  async down(q: QueryRunner): Promise<void> { await q.query(`DROP TABLE "provider_payout_account_history"`); await q.query(`DROP TABLE "provider_payout_accounts"`); await q.query(`DROP TYPE "provider_payout_account_status_enum"`); await q.query(`DROP TYPE "provider_payout_account_type_enum"`); }
}
