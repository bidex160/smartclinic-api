import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReferralRewardsFoundation1789142400000 implements MigrationInterface {
  name = 'ReferralRewardsFoundation1789142400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "provider_type_enum" ADD VALUE IF NOT EXISTS 'PHARMACY'`);
    await queryRunner.query(`CREATE TYPE "referral_target_type_enum" AS ENUM ('PATIENT', 'CLINIC', 'LABORATORY', 'PHARMACY')`);
    await queryRunner.query(`CREATE TYPE "referral_status_enum" AS ENUM ('REGISTERED', 'QUALIFIED', 'REJECTED', 'CANCELLED')`);
    await queryRunner.query(`CREATE TYPE "reward_ledger_direction_enum" AS ENUM ('CREDIT', 'DEBIT')`);

    await queryRunner.query(`CREATE TABLE "referral_codes" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL,
      "code_normalized" varchar(9) NOT NULL, "is_active" boolean NOT NULL DEFAULT true,
      "created_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_referral_codes" PRIMARY KEY ("id"),
      CONSTRAINT "FK_referral_codes_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_referral_codes_user_id" ON "referral_codes" ("user_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_referral_codes_code_normalized" ON "referral_codes" ("code_normalized")`);
    await queryRunner.query(`CREATE FUNCTION prevent_referral_code_change() RETURNS trigger AS $$ BEGIN IF NEW.code_normalized <> OLD.code_normalized OR NEW.user_id <> OLD.user_id THEN RAISE EXCEPTION 'Referral code identity is immutable'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await queryRunner.query(`CREATE TRIGGER "TRG_referral_codes_immutable" BEFORE UPDATE ON "referral_codes" FOR EACH ROW EXECUTE FUNCTION prevent_referral_code_change()`);

    await queryRunner.query(`CREATE TABLE "referrals" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "referrer_user_id" uuid NOT NULL, "referral_code_id" uuid NOT NULL,
      "target_type" "referral_target_type_enum" NOT NULL, "status" "referral_status_enum" NOT NULL DEFAULT 'REGISTERED',
      "referred_user_id" uuid, "referred_patient_id" uuid, "referred_provider_id" uuid,
      "created_at" timestamptz NOT NULL DEFAULT now(), "qualified_at" timestamptz,
      CONSTRAINT "PK_referrals" PRIMARY KEY ("id"),
      CONSTRAINT "FK_referrals_referrer_user" FOREIGN KEY ("referrer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_referrals_referral_code" FOREIGN KEY ("referral_code_id") REFERENCES "referral_codes"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_referrals_referred_user" FOREIGN KEY ("referred_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_referrals_referred_patient" FOREIGN KEY ("referred_patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_referrals_referred_provider" FOREIGN KEY ("referred_provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_referrals_referred_user_id" ON "referrals" ("referred_user_id") WHERE "referred_user_id" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_referrals_referrer_status_target" ON "referrals" ("referrer_user_id", "status", "target_type")`);
    await queryRunner.query(`CREATE INDEX "IDX_referrals_qualified_at" ON "referrals" ("qualified_at")`);

    await queryRunner.query(`CREATE TABLE "reward_rules" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" varchar(80) NOT NULL, "points" integer NOT NULL,
      "is_active" boolean NOT NULL DEFAULT true, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_reward_rules" PRIMARY KEY ("id"), CONSTRAINT "UQ_reward_rules_code" UNIQUE ("code"),
      CONSTRAINT "CHK_reward_rules_nonnegative" CHECK ("points" >= 0)
    )`);
    await queryRunner.query(`CREATE TABLE "reward_points_ledger" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "referral_id" uuid,
      "event_key" varchar(160) NOT NULL, "event_type" varchar(80) NOT NULL,
      "direction" "reward_ledger_direction_enum" NOT NULL, "points" integer NOT NULL, "reason_code" varchar(80) NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_reward_points_ledger" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_reward_points_ledger_positive_points" CHECK ("points" > 0),
      CONSTRAINT "FK_reward_points_ledger_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_reward_points_ledger_referral" FOREIGN KEY ("referral_id") REFERENCES "referrals"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_reward_points_ledger_event_key" ON "reward_points_ledger" ("event_key")`);
    await queryRunner.query(`CREATE INDEX "IDX_reward_points_ledger_user_created" ON "reward_points_ledger" ("user_id", "created_at")`);
    await queryRunner.query(`CREATE FUNCTION prevent_reward_ledger_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Reward points ledger is append-only'; END; $$ LANGUAGE plpgsql`);
    await queryRunner.query(`CREATE TRIGGER "TRG_reward_points_ledger_no_update" BEFORE UPDATE OR DELETE ON "reward_points_ledger" FOR EACH ROW EXECUTE FUNCTION prevent_reward_ledger_mutation()`);

    await queryRunner.query(`CREATE TABLE "reward_level_definitions" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" varchar(40) NOT NULL, "name" varchar(100) NOT NULL,
      "ordinal" integer NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_reward_level_definitions" PRIMARY KEY ("id"), CONSTRAINT "UQ_reward_level_definitions_code" UNIQUE ("code"), CONSTRAINT "UQ_reward_level_definitions_ordinal" UNIQUE ("ordinal")
    )`);
    await queryRunner.query(`CREATE TABLE "reward_level_requirements" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "level_id" uuid NOT NULL, "target_type" "referral_target_type_enum" NOT NULL,
      "required_count" integer NOT NULL, CONSTRAINT "PK_reward_level_requirements" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_reward_level_requirements_positive" CHECK ("required_count" > 0),
      CONSTRAINT "FK_reward_level_requirements_level" FOREIGN KEY ("level_id") REFERENCES "reward_level_definitions"("id") ON DELETE CASCADE
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_reward_level_requirements_level_target" ON "reward_level_requirements" ("level_id", "target_type")`);
    await queryRunner.query(`CREATE TABLE "reward_level_achievements" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "level_id" uuid NOT NULL,
      "achieved_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_reward_level_achievements" PRIMARY KEY ("id"),
      CONSTRAINT "FK_reward_level_achievements_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_reward_level_achievements_level" FOREIGN KEY ("level_id") REFERENCES "reward_level_definitions"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_reward_level_achievements_user_level" ON "reward_level_achievements" ("user_id", "level_id")`);
    await queryRunner.query(`CREATE TABLE "reward_conversion_rates" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "points" integer NOT NULL, "amount" numeric(14,2) NOT NULL,
      "currency" varchar(3) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "effective_from" timestamptz NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_reward_conversion_rates" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_reward_conversion_rate_positive" CHECK ("points" > 0 AND "amount" > 0)
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_reward_conversion_rates_active_currency" ON "reward_conversion_rates" ("currency") WHERE "is_active" = true`);

    await queryRunner.query(`INSERT INTO "reward_rules" ("code", "points", "is_active") VALUES
      ('PATIENT_QUALIFIED', 10, true), ('CLINIC_QUALIFIED', 100, true),
      ('LABORATORY_QUALIFIED', 100, true), ('PHARMACY_QUALIFIED', 100, true),
      ('LEVEL_1_COMPLETED', 0, false)`);
    await queryRunner.query(`INSERT INTO "reward_level_definitions" ("id", "code", "name", "ordinal", "is_active") VALUES ('10000000-0000-4000-8000-000000000001', 'LEVEL_1', 'Level 1', 1, true)`);
    await queryRunner.query(`INSERT INTO "reward_level_requirements" ("level_id", "target_type", "required_count") VALUES
      ('10000000-0000-4000-8000-000000000001', 'CLINIC', 2),
      ('10000000-0000-4000-8000-000000000001', 'LABORATORY', 2),
      ('10000000-0000-4000-8000-000000000001', 'PHARMACY', 2),
      ('10000000-0000-4000-8000-000000000001', 'PATIENT', 10)`);
    await queryRunner.query(`DO $$
      DECLARE member RECORD; candidate text; salt integer;
      BEGIN
        FOR member IN SELECT id FROM users LOOP
          salt := 0;
          LOOP
            candidate := 'SC-' || upper(substr(md5(member.id::text || ':' || salt::text), 1, 6));
            EXIT WHEN NOT EXISTS (SELECT 1 FROM referral_codes WHERE code_normalized = candidate);
            salt := salt + 1;
          END LOOP;
          INSERT INTO referral_codes (user_id, code_normalized, is_active) VALUES (member.id, candidate, true) ON CONFLICT (user_id) DO NOTHING;
        END LOOP;
      END $$`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "reward_conversion_rates"`);
    await queryRunner.query(`DROP TABLE "reward_level_achievements"`);
    await queryRunner.query(`DROP TABLE "reward_level_requirements"`);
    await queryRunner.query(`DROP TABLE "reward_level_definitions"`);
    await queryRunner.query(`DROP TABLE "reward_points_ledger"`);
    await queryRunner.query(`DROP FUNCTION prevent_reward_ledger_mutation()`);
    await queryRunner.query(`DROP TABLE "reward_rules"`);
    await queryRunner.query(`DROP TABLE "referrals"`);
    await queryRunner.query(`DROP TABLE "referral_codes"`);
    await queryRunner.query(`DROP FUNCTION prevent_referral_code_change()`);
    await queryRunner.query(`DROP TYPE "reward_ledger_direction_enum"`);
    await queryRunner.query(`DROP TYPE "referral_status_enum"`);
    await queryRunner.query(`DROP TYPE "referral_target_type_enum"`);
    await queryRunner.query(`UPDATE "providers" SET "provider_type" = 'OTHER' WHERE "provider_type"::text = 'PHARMACY'`);
    await queryRunner.query(`ALTER TYPE "provider_type_enum" RENAME TO "provider_type_enum_old"`);
    await queryRunner.query(`CREATE TYPE "provider_type_enum" AS ENUM ('INDIVIDUAL', 'CLINIC', 'DIAGNOSTIC_CENTRE', 'OTHER')`);
    await queryRunner.query(`ALTER TABLE "providers" ALTER COLUMN "provider_type" DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE "providers" ALTER COLUMN "provider_type" TYPE "provider_type_enum" USING "provider_type"::text::"provider_type_enum"`);
    await queryRunner.query(`ALTER TABLE "providers" ALTER COLUMN "provider_type" SET DEFAULT 'OTHER'`);
    await queryRunner.query(`DROP TYPE "provider_type_enum_old"`);
  }
}
