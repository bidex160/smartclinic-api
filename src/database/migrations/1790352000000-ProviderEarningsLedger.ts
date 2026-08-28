import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProviderEarningsLedger1790352000000 implements MigrationInterface {
  name = 'ProviderEarningsLedger1790352000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "provider_earning_source_type_enum" AS ENUM ('HEALTH_CHECK', 'GENERAL_CARE', 'PATIENT_REGISTRATION', 'PATIENT_LINKING')`);
    await queryRunner.query(`CREATE TYPE "provider_earning_status_enum" AS ENUM ('HELD', 'PAYABLE', 'SETTLED', 'VOIDED')`);
    await queryRunner.query(`CREATE TYPE "provider_earning_commission_source_enum" AS ENUM ('PLATFORM_DEFAULT', 'PROVIDER_OVERRIDE')`);
    await queryRunner.query(`CREATE TABLE "provider_earnings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "reference" varchar(32) NOT NULL, "provider_id" uuid NOT NULL, "payment_transaction_id" uuid, "source_type" "provider_earning_source_type_enum" NOT NULL, "source_reference" varchar(80) NOT NULL, "currency" char(3) NOT NULL, "gross_amount_minor" bigint NOT NULL, "commission_bps" smallint NOT NULL, "commission_source" "provider_earning_commission_source_enum" NOT NULL, "commission_amount_minor" bigint NOT NULL, "provider_share_minor" bigint NOT NULL, "status" "provider_earning_status_enum" NOT NULL, "payable_at" TIMESTAMP WITH TIME ZONE, "settled_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_provider_earnings_money" CHECK ("gross_amount_minor" >= 0 AND "commission_amount_minor" >= 0 AND "provider_share_minor" >= 0 AND "commission_amount_minor" + "provider_share_minor" = "gross_amount_minor"), CONSTRAINT "CHK_provider_earnings_commission_bps" CHECK ("commission_bps" >= 0 AND "commission_bps" <= 10000), CONSTRAINT "CHK_provider_earnings_currency" CHECK ("currency" ~ '^[A-Z]{3}$'), CONSTRAINT "PK_provider_earnings" PRIMARY KEY ("id"))`);
    await queryRunner.query(`ALTER TABLE "provider_earnings" ADD CONSTRAINT "FK_provider_earnings_provider" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE "provider_earnings" ADD CONSTRAINT "FK_provider_earnings_payment_transaction" FOREIGN KEY ("payment_transaction_id") REFERENCES "payment_transactions"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_provider_earnings_reference" ON "provider_earnings" ("reference")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_provider_earnings_source" ON "provider_earnings" ("source_type", "source_reference")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_provider_earnings_payment_transaction" ON "provider_earnings" ("payment_transaction_id") WHERE "payment_transaction_id" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_provider_earnings_provider_status_currency" ON "provider_earnings" ("provider_id", "status", "currency")`);
    await queryRunner.query(`CREATE INDEX "IDX_provider_earnings_created" ON "provider_earnings" ("created_at")`);
    await queryRunner.query(`CREATE TABLE "provider_earning_status_history" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "provider_earning_id" uuid NOT NULL, "from_status" "provider_earning_status_enum", "to_status" "provider_earning_status_enum" NOT NULL, "actor_user_id" uuid, "reason_code" varchar(80) NOT NULL, "reason_note" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_provider_earning_status_history" PRIMARY KEY ("id"))`);
    await queryRunner.query(`ALTER TABLE "provider_earning_status_history" ADD CONSTRAINT "FK_provider_earning_status_history_earning" FOREIGN KEY ("provider_earning_id") REFERENCES "provider_earnings"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE "provider_earning_status_history" ADD CONSTRAINT "FK_provider_earning_status_history_actor" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`CREATE INDEX "IDX_provider_earning_status_history_earning_created" ON "provider_earning_status_history" ("provider_earning_id", "created_at")`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_provider_earning_status_history_earning_created"`);
    await queryRunner.query(`ALTER TABLE "provider_earning_status_history" DROP CONSTRAINT "FK_provider_earning_status_history_actor"`);
    await queryRunner.query(`ALTER TABLE "provider_earning_status_history" DROP CONSTRAINT "FK_provider_earning_status_history_earning"`);
    await queryRunner.query(`DROP TABLE "provider_earning_status_history"`);
    await queryRunner.query(`DROP INDEX "IDX_provider_earnings_created"`);
    await queryRunner.query(`DROP INDEX "IDX_provider_earnings_provider_status_currency"`);
    await queryRunner.query(`DROP INDEX "UQ_provider_earnings_payment_transaction"`);
    await queryRunner.query(`DROP INDEX "UQ_provider_earnings_source"`);
    await queryRunner.query(`DROP INDEX "UQ_provider_earnings_reference"`);
    await queryRunner.query(`ALTER TABLE "provider_earnings" DROP CONSTRAINT "FK_provider_earnings_payment_transaction"`);
    await queryRunner.query(`ALTER TABLE "provider_earnings" DROP CONSTRAINT "FK_provider_earnings_provider"`);
    await queryRunner.query(`DROP TABLE "provider_earnings"`);
    await queryRunner.query(`DROP TYPE "provider_earning_commission_source_enum"`);
    await queryRunner.query(`DROP TYPE "provider_earning_status_enum"`);
    await queryRunner.query(`DROP TYPE "provider_earning_source_type_enum"`);
  }
}
