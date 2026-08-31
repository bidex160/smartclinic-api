import { MigrationInterface, QueryRunner } from 'typeorm';

export class GuidedSelfCheckInternalClinicalDecision1792857600000 implements MigrationInterface {
  name = 'GuidedSelfCheckInternalClinicalDecision1792857600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "gsc_internal_professional_type_enum" AS ENUM ('DOCTOR','NURSE','OTHER_CLINICAL_PROFESSIONAL')`);
    await queryRunner.query(`CREATE TYPE "gsc_internal_professional_status_enum" AS ENUM ('ACTIVE','DISABLED')`);
    await queryRunner.query(`CREATE TYPE "gsc_internal_clinical_capability_enum" AS ENUM ('SELF_CHECK_CLINICAL_REVIEW','URGENT_SELF_CHECK_REVIEW')`);
    await queryRunner.query(`CREATE TYPE "gsc_internal_professional_event_enum" AS ENUM ('INTERNAL_CLINICAL_PROFESSIONAL_AUTHORIZED','INTERNAL_CLINICAL_PROFESSIONAL_DISABLED','CAPABILITY_GRANTED','CAPABILITY_REVOKED')`);
    await queryRunner.query(`CREATE TABLE "guided_self_check_internal_clinical_professionals" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "reference" varchar(40) NOT NULL,
      "user_id" uuid NOT NULL, "display_name" varchar(160) NOT NULL,
      "professional_type" "gsc_internal_professional_type_enum" NOT NULL,
      "status" "gsc_internal_professional_status_enum" NOT NULL,
      "capabilities" "gsc_internal_clinical_capability_enum"[] NOT NULL DEFAULT '{}',
      "authorized_by_user_id" uuid NOT NULL, "authorized_at" timestamptz NOT NULL,
      "disabled_at" timestamptz, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_gsc_internal_professionals" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_gsc_internal_professional_reference" UNIQUE ("reference"),
      CONSTRAINT "UQ_gsc_internal_professional_user" UNIQUE ("user_id"),
      CONSTRAINT "FK_gsc_internal_professional_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_gsc_internal_professional_authorizer" FOREIGN KEY ("authorized_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_gsc_internal_professional_directory" ON "guided_self_check_internal_clinical_professionals" ("status","professional_type")`);
    await queryRunner.query(`CREATE INDEX "IDX_gsc_internal_professional_capabilities" ON "guided_self_check_internal_clinical_professionals" USING GIN ("capabilities")`);
    await queryRunner.query(`CREATE TABLE "guided_self_check_internal_clinical_professional_history" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "professional_id" uuid NOT NULL,
      "event" "gsc_internal_professional_event_enum" NOT NULL, "actor_user_id" uuid NOT NULL,
      "metadata" jsonb NOT NULL DEFAULT '{}', "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_gsc_internal_professional_history" PRIMARY KEY ("id"),
      CONSTRAINT "FK_gsc_internal_professional_history_professional" FOREIGN KEY ("professional_id") REFERENCES "guided_self_check_internal_clinical_professionals"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_gsc_internal_professional_history_actor" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_gsc_internal_professional_history" ON "guided_self_check_internal_clinical_professional_history" ("professional_id","created_at")`);

    await queryRunner.query(`ALTER TYPE "guided_self_check_next_action_type_enum" ADD VALUE IF NOT EXISTS 'FIND_CARE'`);
    await queryRunner.query(`ALTER TYPE "guided_self_check_next_action_source_enum" ADD VALUE IF NOT EXISTS 'AI_ANALYSIS'`);
    await queryRunner.query(`ALTER TYPE "guided_self_check_review_event_enum" ADD VALUE IF NOT EXISTS 'INTERNAL_REVIEW_ASSIGNED'`);
    await queryRunner.query(`ALTER TYPE "guided_self_check_review_event_enum" ADD VALUE IF NOT EXISTS 'INTERNAL_REVIEW_REASSIGNED'`);
    await queryRunner.query(`ALTER TYPE "guided_self_check_review_event_enum" ADD VALUE IF NOT EXISTS 'CLINICAL_REVIEW_STARTED'`);
    await queryRunner.query(`ALTER TYPE "guided_self_check_review_event_enum" ADD VALUE IF NOT EXISTS 'CLINICAL_REVIEW_COMPLETED'`);
    await queryRunner.query(`ALTER TYPE "guided_self_check_review_event_enum" ADD VALUE IF NOT EXISTS 'NEXT_ACTION_RECOMMENDED'`);

    await queryRunner.query(`ALTER TABLE "guided_self_check_professional_reviews"
      ADD "assigned_internal_clinical_professional_id" uuid,
      ADD "patient_guidance" varchar(1000), ADD "internal_clinical_note" varchar(3000),
      ADD CONSTRAINT "FK_gsc_review_internal_professional" FOREIGN KEY ("assigned_internal_clinical_professional_id") REFERENCES "guided_self_check_internal_clinical_professionals"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`CREATE INDEX "IDX_gsc_review_internal_assignee" ON "guided_self_check_professional_reviews" ("assigned_internal_clinical_professional_id","status")`);
    await queryRunner.query(`ALTER TABLE "guided_self_check_analyses" ADD "human_review_recommended" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "guided_self_check_next_actions" ADD "analysis_id" uuid, ADD CONSTRAINT "FK_gsc_next_action_analysis" FOREIGN KEY ("analysis_id") REFERENCES "guided_self_check_analyses"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`CREATE INDEX "IDX_gsc_next_action_analysis" ON "guided_self_check_next_actions" ("analysis_id")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_gsc_next_action_analysis"`);
    await queryRunner.query(`ALTER TABLE "guided_self_check_next_actions" DROP CONSTRAINT "FK_gsc_next_action_analysis", DROP COLUMN "analysis_id"`);
    await queryRunner.query(`ALTER TABLE "guided_self_check_analyses" DROP COLUMN "human_review_recommended"`);
    await queryRunner.query(`DROP INDEX "IDX_gsc_review_internal_assignee"`);
    await queryRunner.query(`ALTER TABLE "guided_self_check_professional_reviews" DROP CONSTRAINT "FK_gsc_review_internal_professional", DROP COLUMN "internal_clinical_note", DROP COLUMN "patient_guidance", DROP COLUMN "assigned_internal_clinical_professional_id"`);
    await queryRunner.query(`DROP TABLE "guided_self_check_internal_clinical_professional_history"`);
    await queryRunner.query(`DROP TABLE "guided_self_check_internal_clinical_professionals"`);
    await queryRunner.query(`DROP TYPE "gsc_internal_professional_event_enum"`);
    await queryRunner.query(`DROP TYPE "gsc_internal_clinical_capability_enum"`);
    await queryRunner.query(`DROP TYPE "gsc_internal_professional_status_enum"`);
    await queryRunner.query(`DROP TYPE "gsc_internal_professional_type_enum"`);
  }
}
