import { MigrationInterface, QueryRunner } from 'typeorm';

export class MilestoneReferralRewards1791475200000 implements MigrationInterface {
  name = 'MilestoneReferralRewards1791475200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "referrals" ADD "reward_model_version" smallint NOT NULL DEFAULT 2`);
    await queryRunner.query(`ALTER TABLE "referrals" ADD CONSTRAINT "CHK_referrals_reward_model_version" CHECK ("reward_model_version" IN (1, 2))`);
    await queryRunner.query(`UPDATE "referrals" referral SET "reward_model_version" = 1 WHERE EXISTS (
      SELECT 1 FROM "reward_points_ledger" ledger
      WHERE ledger."referral_id" = referral."id"
        AND ledger."event_type" IN ('PATIENT_QUALIFIED', 'CLINIC_QUALIFIED', 'LABORATORY_QUALIFIED', 'PHARMACY_QUALIFIED')
    )`);
    await queryRunner.query(`UPDATE "reward_rules" SET "is_active" = false, "updated_at" = now() WHERE "code" IN ('PATIENT_QUALIFIED', 'CLINIC_QUALIFIED', 'LABORATORY_QUALIFIED', 'PHARMACY_QUALIFIED')`);
    await queryRunner.query(`INSERT INTO "reward_rules" ("code", "points", "is_active") VALUES
      ('PROVIDER_REGISTERED', 2, true),
      ('PROVIDER_VERIFIED', 4, true),
      ('PROVIDER_ACTIVATED', 8, true),
      ('PATIENT_REGISTERED', 1, true),
      ('PATIENT_FIRST_CARE_ACTION', 1, true)
      ON CONFLICT ("code") DO UPDATE SET "points" = EXCLUDED."points", "is_active" = true, "updated_at" = now()`);

    await queryRunner.query(`INSERT INTO "reward_points_ledger" ("user_id", "referral_id", "event_key", "event_type", "direction", "points", "reason_code")
      SELECT referral."referrer_user_id", referral."id", 'REFERRAL_MILESTONE:' || referral."id" || ':PATIENT_REGISTERED', 'PATIENT_REGISTERED', 'CREDIT', 1, 'PATIENT_REGISTERED'
      FROM "referrals" referral
      WHERE referral."reward_model_version" = 2 AND referral."target_type" = 'PATIENT'
      ON CONFLICT ("event_key") DO NOTHING`);
    await queryRunner.query(`INSERT INTO "reward_points_ledger" ("user_id", "referral_id", "event_key", "event_type", "direction", "points", "reason_code")
      SELECT referral."referrer_user_id", referral."id", 'REFERRAL_MILESTONE:' || referral."id" || ':PROVIDER_REGISTERED', 'PROVIDER_REGISTERED', 'CREDIT', 2, 'PROVIDER_REGISTERED'
      FROM "referrals" referral
      WHERE referral."reward_model_version" = 2 AND referral."referred_provider_id" IS NOT NULL
      ON CONFLICT ("event_key") DO NOTHING`);
    await queryRunner.query(`INSERT INTO "reward_points_ledger" ("user_id", "referral_id", "event_key", "event_type", "direction", "points", "reason_code")
      SELECT referral."referrer_user_id", referral."id", 'REFERRAL_MILESTONE:' || referral."id" || ':PROVIDER_VERIFIED', 'PROVIDER_VERIFIED', 'CREDIT', 4, 'PROVIDER_VERIFIED'
      FROM "referrals" referral INNER JOIN "providers" provider ON provider."id" = referral."referred_provider_id"
      WHERE referral."reward_model_version" = 2 AND provider."deleted_at" IS NULL AND provider."onboarding_status" = 'APPROVED'
      ON CONFLICT ("event_key") DO NOTHING`);
    await queryRunner.query(`INSERT INTO "reward_points_ledger" ("user_id", "referral_id", "event_key", "event_type", "direction", "points", "reason_code")
      SELECT referral."referrer_user_id", referral."id", 'REFERRAL_MILESTONE:' || referral."id" || ':PROVIDER_ACTIVATED', 'PROVIDER_ACTIVATED', 'CREDIT', 8, 'PROVIDER_ACTIVATED'
      FROM "referrals" referral INNER JOIN "providers" provider ON provider."id" = referral."referred_provider_id"
      WHERE referral."reward_model_version" = 2 AND provider."deleted_at" IS NULL AND provider."onboarding_status" = 'APPROVED' AND provider."status" = 'ACTIVE'
      ON CONFLICT ("event_key") DO NOTHING`);
    await queryRunner.query(`INSERT INTO "reward_points_ledger" ("user_id", "referral_id", "event_key", "event_type", "direction", "points", "reason_code")
      SELECT referral."referrer_user_id", referral."id", 'REFERRAL_MILESTONE:' || referral."id" || ':PATIENT_FIRST_CARE_ACTION', 'PATIENT_FIRST_CARE_ACTION', 'CREDIT', 1, 'PATIENT_FIRST_CARE_ACTION'
      FROM "referrals" referral
      WHERE referral."reward_model_version" = 2 AND referral."target_type" = 'PATIENT' AND (
        referral."status" = 'QUALIFIED'
        OR EXISTS (SELECT 1 FROM "health_check_encounters" encounter INNER JOIN "bookings" booking ON booking."id" = encounter."booking_id" WHERE booking."participant_patient_id" = referral."referred_patient_id" AND encounter."status" = 'COMPLETED')
        OR EXISTS (SELECT 1 FROM "care_appointments" appointment WHERE appointment."patient_id" = referral."referred_patient_id" AND appointment."status" = 'COMPLETED')
        OR EXISTS (SELECT 1 FROM "patient_provider_connections" connection WHERE connection."patient_id" = referral."referred_patient_id" AND connection."status" = 'CONNECTED')
        OR EXISTS (SELECT 1 FROM "pharmacy_dispensings" dispensing INNER JOIN "clinical_order_fulfillments" fulfillment ON fulfillment."id" = dispensing."fulfillment_id" WHERE fulfillment."patient_id" = referral."referred_patient_id" AND dispensing."status" = 'COMPLETED')
      ) ON CONFLICT ("event_key") DO NOTHING`);
    await queryRunner.query(`UPDATE "referrals" referral SET "status" = 'QUALIFIED', "qualified_at" = COALESCE(referral."qualified_at", now())
      WHERE referral."reward_model_version" = 2 AND (
        EXISTS (SELECT 1 FROM "reward_points_ledger" ledger WHERE ledger."referral_id" = referral."id" AND ledger."event_type" = 'PATIENT_FIRST_CARE_ACTION')
        OR EXISTS (SELECT 1 FROM "reward_points_ledger" ledger WHERE ledger."referral_id" = referral."id" AND ledger."event_type" = 'PROVIDER_ACTIVATED')
      )`);
    await queryRunner.query(`INSERT INTO "reward_level_achievements" ("user_id", "level_id")
      SELECT referrer."referrer_user_id", level."id"
      FROM (SELECT DISTINCT "referrer_user_id" FROM "referrals") referrer
      CROSS JOIN "reward_level_definitions" level
      WHERE level."is_active" = true AND NOT EXISTS (
        SELECT 1 FROM "reward_level_requirements" requirement
        WHERE requirement."level_id" = level."id" AND requirement."required_count" > (
          SELECT COUNT(*) FROM "referrals" qualified
          WHERE qualified."referrer_user_id" = referrer."referrer_user_id" AND qualified."status" = 'QUALIFIED' AND qualified."target_type" = requirement."target_type"
        )
      ) ON CONFLICT ("user_id", "level_id") DO NOTHING`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "reward_rules" SET "is_active" = false, "updated_at" = now() WHERE "code" IN ('PROVIDER_REGISTERED', 'PROVIDER_VERIFIED', 'PROVIDER_ACTIVATED', 'PATIENT_REGISTERED', 'PATIENT_FIRST_CARE_ACTION')`);
    await queryRunner.query(`UPDATE "reward_rules" SET "points" = CASE "code" WHEN 'PATIENT_QUALIFIED' THEN 10 ELSE 100 END, "is_active" = true, "updated_at" = now() WHERE "code" IN ('PATIENT_QUALIFIED', 'CLINIC_QUALIFIED', 'LABORATORY_QUALIFIED', 'PHARMACY_QUALIFIED')`);
    await queryRunner.query(`ALTER TABLE "referrals" DROP CONSTRAINT "CHK_referrals_reward_model_version"`);
    await queryRunner.query(`ALTER TABLE "referrals" DROP COLUMN "reward_model_version"`);
  }
}
