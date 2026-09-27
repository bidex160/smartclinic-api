import { MigrationInterface, QueryRunner } from "typeorm";

export class PrimaryReferralEarnings1796918400000 implements MigrationInterface {
  name = "PrimaryReferralEarnings1796918400000";
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE "provider_earnings" DROP CONSTRAINT "CHK_provider_earnings_money"',
    );
    await q.query(
      'ALTER TABLE "provider_earnings" ADD "referral_share_minor" bigint NOT NULL DEFAULT 0',
    );
    await q.query(
      'ALTER TABLE "provider_earnings" ADD CONSTRAINT "CHK_provider_earnings_money" CHECK ("gross_amount_minor" >= 0 AND "commission_amount_minor" >= 0 AND "referral_share_minor" >= 0 AND "provider_share_minor" >= 0 AND "commission_amount_minor" + "referral_share_minor" + "provider_share_minor" = "gross_amount_minor")',
    );
    await q.query(`CREATE TABLE "referral_earnings" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "referral_id" uuid NOT NULL,
      "referral_code_id" uuid NOT NULL, "referral_code_snapshot" varchar(32) NOT NULL,
      "referrer_user_id" uuid NOT NULL, "patient_id" uuid NOT NULL,
      "payment_transaction_id" uuid NOT NULL, "source_type" varchar(40) NOT NULL,
      "source_reference" varchar(80) NOT NULL, "gross_amount_minor" bigint NOT NULL,
      "platform_bps" smallint NOT NULL, "platform_amount_minor" bigint NOT NULL,
      "referral_bps" smallint NOT NULL, "referral_amount_minor" bigint NOT NULL,
      "provider_amount_minor" bigint NOT NULL, "currency" char(3) NOT NULL,
      "status" varchar(20) NOT NULL, "payable_at" timestamptz, "settled_at" timestamptz,
      "reversed_at" timestamptz, "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_referral_earnings" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_referral_earnings_bps" CHECK ("platform_bps" >= 0 AND "platform_bps" <= 10000 AND "referral_bps" >= 0 AND "referral_bps" <= 10000),
      CONSTRAINT "CHK_referral_earnings_currency" CHECK ("currency" ~ '^[A-Z]{3}$'),
      CONSTRAINT "CHK_referral_earnings_money" CHECK ("gross_amount_minor" >= 0 AND "platform_amount_minor" >= 0 AND "referral_amount_minor" >= 0 AND "provider_amount_minor" >= 0 AND "platform_amount_minor" + "referral_amount_minor" + "provider_amount_minor" = "gross_amount_minor"),
      CONSTRAINT "FK_referral_earnings_referral" FOREIGN KEY ("referral_id") REFERENCES "referrals"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_referral_earnings_code" FOREIGN KEY ("referral_code_id") REFERENCES "referral_codes"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_referral_earnings_referrer" FOREIGN KEY ("referrer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_referral_earnings_patient" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_referral_earnings_transaction" FOREIGN KEY ("payment_transaction_id") REFERENCES "payment_transactions"("id") ON DELETE RESTRICT
    )`);
    await q.query(
      'CREATE UNIQUE INDEX "UQ_referral_earnings_payment_transaction" ON "referral_earnings"("payment_transaction_id")',
    );
    await q.query(
      'CREATE INDEX "IDX_referral_earnings_referrer_status_currency" ON "referral_earnings"("referrer_user_id", "status", "currency")',
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE "referral_earnings"');
    await q.query(
      'ALTER TABLE "provider_earnings" DROP CONSTRAINT "CHK_provider_earnings_money"',
    );
    await q.query(
      'ALTER TABLE "provider_earnings" DROP COLUMN "referral_share_minor"',
    );
    await q.query(
      'ALTER TABLE "provider_earnings" ADD CONSTRAINT "CHK_provider_earnings_money" CHECK ("gross_amount_minor" >= 0 AND "commission_amount_minor" >= 0 AND "provider_share_minor" >= 0 AND "commission_amount_minor" + "provider_share_minor" = "gross_amount_minor")',
    );
  }
}
