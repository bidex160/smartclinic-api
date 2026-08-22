import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProviderOnboardingRedesign1788624000000 implements MigrationInterface {
  name = 'ProviderOnboardingRedesign1788624000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "provider_type_enum" AS ENUM ('INDIVIDUAL', 'CLINIC', 'DIAGNOSTIC_CENTRE', 'OTHER')`);
    await queryRunner.query(`CREATE TYPE "provider_onboarding_status_enum" AS ENUM ('DRAFT', 'INVITED', 'SUBMITTED', 'APPROVED', 'REJECTED')`);
    await queryRunner.query(`ALTER TABLE "providers" ADD "email" varchar`);
    await queryRunner.query(`ALTER TABLE "providers" ADD "phone" varchar`);
    await queryRunner.query(`ALTER TABLE "providers" ADD "provider_type" "provider_type_enum" NOT NULL DEFAULT 'OTHER'`);
    await queryRunner.query(`ALTER TABLE "providers" ADD "country_code" char(2)`);
    await queryRunner.query(`ALTER TABLE "providers" ADD "state_or_region" varchar`);
    await queryRunner.query(`ALTER TABLE "providers" ADD "city" varchar`);
    await queryRunner.query(`ALTER TABLE "providers" ADD "onboarding_status" "provider_onboarding_status_enum" NOT NULL DEFAULT 'DRAFT'`);
    await queryRunner.query(`ALTER TABLE "providers" ADD "submitted_at" timestamptz`);
    await queryRunner.query(`ALTER TABLE "providers" ADD "reviewed_at" timestamptz`);
    await queryRunner.query(`ALTER TABLE "providers" ADD "reviewed_by_user_id" uuid`);
    await queryRunner.query(`ALTER TABLE "providers" ADD "review_note" text`);
    await queryRunner.query(`UPDATE "providers" p SET "email" = lower(u."email") FROM "users" u WHERE p."user_id" = u."id" AND u."email" IS NOT NULL`);
    await queryRunner.query(`UPDATE "providers" SET "onboarding_status" = 'APPROVED', "reviewed_at" = "updated_at" WHERE "status" = 'ACTIVE'`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_providers_email" ON "providers" ("email") WHERE "email" IS NOT NULL`);
    await queryRunner.query(`ALTER TABLE "providers" ADD CONSTRAINT "CHK_providers_country_code" CHECK ("country_code" IS NULL OR "country_code" ~ '^[A-Z]{2}$')`);
    await queryRunner.query(`ALTER TABLE "providers" ADD CONSTRAINT "FK_providers_reviewed_by_user" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "providers" DROP CONSTRAINT "FK_providers_reviewed_by_user"`);
    await queryRunner.query(`ALTER TABLE "providers" DROP CONSTRAINT "CHK_providers_country_code"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_providers_email"`);
    await queryRunner.query(`ALTER TABLE "providers" DROP COLUMN "review_note"`);
    await queryRunner.query(`ALTER TABLE "providers" DROP COLUMN "reviewed_by_user_id"`);
    await queryRunner.query(`ALTER TABLE "providers" DROP COLUMN "reviewed_at"`);
    await queryRunner.query(`ALTER TABLE "providers" DROP COLUMN "submitted_at"`);
    await queryRunner.query(`ALTER TABLE "providers" DROP COLUMN "onboarding_status"`);
    await queryRunner.query(`ALTER TABLE "providers" DROP COLUMN "city"`);
    await queryRunner.query(`ALTER TABLE "providers" DROP COLUMN "state_or_region"`);
    await queryRunner.query(`ALTER TABLE "providers" DROP COLUMN "country_code"`);
    await queryRunner.query(`ALTER TABLE "providers" DROP COLUMN "provider_type"`);
    await queryRunner.query(`ALTER TABLE "providers" DROP COLUMN "phone"`);
    await queryRunner.query(`ALTER TABLE "providers" DROP COLUMN "email"`);
    await queryRunner.query(`DROP TYPE "provider_onboarding_status_enum"`);
    await queryRunner.query(`DROP TYPE "provider_type_enum"`);
  }
}
