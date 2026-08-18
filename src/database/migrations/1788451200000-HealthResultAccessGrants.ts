import { MigrationInterface, QueryRunner } from 'typeorm';

export class HealthResultAccessGrants1788451200000 implements MigrationInterface {
  name = 'HealthResultAccessGrants1788451200000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "health_result_access_grant_status_enum" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED')`);
    await queryRunner.query(`CREATE TABLE "health_result_access_grants" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "patient_id" uuid NOT NULL, "encounter_id" uuid NOT NULL, "user_id" uuid, "access_token_hash" char(64), "status" "health_result_access_grant_status_enum" NOT NULL DEFAULT 'ACTIVE', "expires_at" timestamptz, "revoked_at" timestamptz, "created_by_user_id" uuid NOT NULL, "last_used_at" timestamptz, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_health_result_access_grants" PRIMARY KEY ("id"), CONSTRAINT "CHK_health_result_access_grants_authority" CHECK (("user_id" IS NOT NULL) <> ("access_token_hash" IS NOT NULL)), CONSTRAINT "FK_health_result_access_grants_patient" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT, CONSTRAINT "FK_health_result_access_grants_encounter" FOREIGN KEY ("encounter_id") REFERENCES "health_check_encounters"("id") ON DELETE RESTRICT, CONSTRAINT "FK_health_result_access_grants_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT, CONSTRAINT "FK_health_result_access_grants_creator" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_health_result_access_grants_token_hash" ON "health_result_access_grants" ("access_token_hash") WHERE "access_token_hash" IS NOT NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_health_result_access_grants_active_encounter" ON "health_result_access_grants" ("encounter_id") WHERE "status" = 'ACTIVE'`);
    await queryRunner.query(`CREATE INDEX "IDX_health_result_access_grants_patient_status" ON "health_result_access_grants" ("patient_id", "status")`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_health_result_access_grants_patient_status"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_health_result_access_grants_active_encounter"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_health_result_access_grants_token_hash"`);
    await queryRunner.query(`DROP TABLE "health_result_access_grants"`);
    await queryRunner.query(`DROP TYPE "health_result_access_grant_status_enum"`);
  }
}
