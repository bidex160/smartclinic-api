import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProviderRecruitmentInvitations1793980800000 implements MigrationInterface {
  name = 'ProviderRecruitmentInvitations1793980800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "provider_recruitment_invitation_source_enum" AS ENUM ('HEALTH_CHECK_NO_PROVIDER')`);
    await queryRunner.query(`CREATE TYPE "provider_recruitment_invitation_status_enum" AS ENUM ('PENDING', 'CONTACTED', 'JOINED', 'CANCELLED')`);
    await queryRunner.query(`CREATE TYPE "provider_recruitment_email_status_enum" AS ENUM ('PENDING', 'SENT', 'FAILED', 'NOT_APPLICABLE')`);
    await queryRunner.query(`CREATE TABLE "provider_recruitment_invitations" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "reference" varchar(17) NOT NULL,
      "invited_by_user_id" uuid NOT NULL,
      "organisation_name" varchar(160) NOT NULL,
      "email" varchar(254),
      "email_normalized" varchar(254),
      "phone" varchar(32),
      "source" "provider_recruitment_invitation_source_enum" NOT NULL,
      "status" "provider_recruitment_invitation_status_enum" NOT NULL DEFAULT 'PENDING',
      "package_code" varchar,
      "service_code" varchar,
      "fulfilment_mode_code" varchar,
      "preferred_date" date,
      "preferred_time" time,
      "country_code" char(2),
      "state_or_region" varchar(120),
      "city" varchar(120),
      "email_notification_status" "provider_recruitment_email_status_enum" NOT NULL,
      "email_notification_failure_reason" varchar(120),
      "submission_key" char(64) NOT NULL,
      "accepted_at" timestamptz,
      "provider_id" uuid,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_provider_recruitment_invitations" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_provider_recruitment_invitations_reference" UNIQUE ("reference"),
      CONSTRAINT "UQ_provider_recruitment_invitations_submission_key" UNIQUE ("submission_key"),
      CONSTRAINT "CHK_provider_recruitment_invitations_contact" CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL),
      CONSTRAINT "FK_provider_recruitment_invitations_user" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_provider_recruitment_invitations_provider" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE SET NULL
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_provider_recruitment_invitations_status_created" ON "provider_recruitment_invitations" ("status", "created_at")`);
    await queryRunner.query(`CREATE INDEX "IDX_provider_recruitment_invitations_source_created" ON "provider_recruitment_invitations" ("source", "created_at")`);
    await queryRunner.query(`CREATE INDEX "IDX_provider_recruitment_invitations_email" ON "provider_recruitment_invitations" ("email_normalized")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_provider_recruitment_invitations_email"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_provider_recruitment_invitations_source_created"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_provider_recruitment_invitations_status_created"`);
    await queryRunner.query(`DROP TABLE "provider_recruitment_invitations"`);
    await queryRunner.query(`DROP TYPE "provider_recruitment_email_status_enum"`);
    await queryRunner.query(`DROP TYPE "provider_recruitment_invitation_status_enum"`);
    await queryRunner.query(`DROP TYPE "provider_recruitment_invitation_source_enum"`);
  }
}
