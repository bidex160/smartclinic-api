import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Earnings for providers who refer a lab or pharmacy job to another provider
 * (a share of the job, taken from the receiving provider's share).
 *
 * Also adds DIAGNOSTIC_FULFILLMENT, which the code already used for lab
 * earnings but no earlier migration added to the database type.
 */
export class ProviderReferralEarnings1798128000000 implements MigrationInterface {
  name = "ProviderReferralEarnings1798128000000";
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "provider_earning_source_type_enum" ADD VALUE IF NOT EXISTS 'DIAGNOSTIC_FULFILLMENT'`);
    await q.query(`ALTER TYPE "provider_earning_source_type_enum" ADD VALUE IF NOT EXISTS 'PROVIDER_REFERRAL'`);
  }
  async down(q: QueryRunner): Promise<void> {
    // Postgres can't drop one enum value; rebuild the type without PROVIDER_REFERRAL.
    // DIAGNOSTIC_FULFILLMENT stays: the code has always needed it.
    await q.query(`DELETE FROM "provider_earning_status_history" WHERE "provider_earning_id" IN (SELECT "id" FROM "provider_earnings" WHERE "source_type" = 'PROVIDER_REFERRAL')`);
    await q.query(`DELETE FROM "provider_earnings" WHERE "source_type" = 'PROVIDER_REFERRAL'`);
    await q.query(`ALTER TYPE "provider_earning_source_type_enum" RENAME TO "provider_earning_source_type_enum_referral_old"`);
    await q.query(`CREATE TYPE "provider_earning_source_type_enum" AS ENUM ('HEALTH_CHECK','GENERAL_CARE','PATIENT_REGISTRATION','PATIENT_LINKING','PHARMACY_FULFILLMENT','DIAGNOSTIC_FULFILLMENT')`);
    await q.query(`ALTER TABLE "provider_earnings" ALTER COLUMN "source_type" TYPE "provider_earning_source_type_enum" USING "source_type"::text::"provider_earning_source_type_enum"`);
    await q.query(`DROP TYPE "provider_earning_source_type_enum_referral_old"`);
  }
}
