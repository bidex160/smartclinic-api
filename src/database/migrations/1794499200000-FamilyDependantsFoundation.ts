import { MigrationInterface, QueryRunner } from 'typeorm';

export class FamilyDependantsFoundation1794499200000 implements MigrationInterface {
  name = 'FamilyDependantsFoundation1794499200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "patient_relationship_type_enum" AS ENUM ('MOTHER', 'FATHER', 'PARENT', 'LEGAL_GUARDIAN', 'CAREGIVER', 'OTHER')`);
    await queryRunner.query(`CREATE TYPE "patient_relationship_role_enum" AS ENUM ('GUARDIAN')`);
    await queryRunner.query(`CREATE TYPE "patient_relationship_status_enum" AS ENUM ('ACTIVE', 'INACTIVE')`);
    await queryRunner.query(`CREATE TYPE "dependant_reward_qualification_status_enum" AS ENUM ('PENDING', 'QUALIFIED')`);
    await queryRunner.query(`CREATE TABLE "patient_relationships" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "related_user_id" uuid NOT NULL, "patient_id" uuid NOT NULL,
      "relationship_type" "patient_relationship_type_enum" NOT NULL, "role" "patient_relationship_role_enum" NOT NULL,
      "status" "patient_relationship_status_enum" NOT NULL DEFAULT 'ACTIVE', "is_primary" boolean NOT NULL DEFAULT false,
      "ended_at" timestamptz, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_patient_relationships" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_patient_relationships_lifecycle" CHECK (("status" = 'ACTIVE' AND "ended_at" IS NULL) OR "status" = 'INACTIVE'),
      CONSTRAINT "FK_patient_relationships_user" FOREIGN KEY ("related_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_patient_relationships_patient" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_patient_relationships_active_guardian" ON "patient_relationships" ("related_user_id", "patient_id", "role") WHERE "status" = 'ACTIVE'`);
    await queryRunner.query(`CREATE INDEX "IDX_patient_relationships_patient_status" ON "patient_relationships" ("patient_id", "status")`);
    await queryRunner.query(`CREATE INDEX "IDX_patient_relationships_user_status" ON "patient_relationships" ("related_user_id", "status")`);
    await queryRunner.query(`CREATE TABLE "dependant_reward_provenance" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "dependant_patient_id" uuid NOT NULL, "created_by_user_id" uuid NOT NULL,
      "status" "dependant_reward_qualification_status_enum" NOT NULL DEFAULT 'PENDING',
      "qualifying_care_source" varchar(80), "qualifying_care_reference" varchar(80), "qualified_at" timestamptz, "reward_credited_at" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_dependant_reward_provenance" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_dependant_reward_provenance_qualification" CHECK (("status" = 'PENDING' AND "qualified_at" IS NULL AND "qualifying_care_source" IS NULL AND "qualifying_care_reference" IS NULL) OR ("status" = 'QUALIFIED' AND "qualified_at" IS NOT NULL AND "qualifying_care_source" IS NOT NULL AND "qualifying_care_reference" IS NOT NULL)),
      CONSTRAINT "FK_dependant_reward_provenance_patient" FOREIGN KEY ("dependant_patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_dependant_reward_provenance_creator" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_dependant_reward_provenance_patient" ON "dependant_reward_provenance" ("dependant_patient_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_dependant_reward_provenance_creator_status" ON "dependant_reward_provenance" ("created_by_user_id", "status")`);
    await queryRunner.query(`INSERT INTO "reward_rules" ("code", "points", "is_active") VALUES ('DEPENDANT_FIRST_CARE_ACTION', 0, false) ON CONFLICT ("code") DO NOTHING`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "reward_rules" WHERE "code" = 'DEPENDANT_FIRST_CARE_ACTION' AND "points" = 0 AND "is_active" = false`);
    await queryRunner.query(`DROP TABLE "dependant_reward_provenance"`);
    await queryRunner.query(`DROP TABLE "patient_relationships"`);
    await queryRunner.query(`DROP TYPE "dependant_reward_qualification_status_enum"`);
    await queryRunner.query(`DROP TYPE "patient_relationship_status_enum"`);
    await queryRunner.query(`DROP TYPE "patient_relationship_role_enum"`);
    await queryRunner.query(`DROP TYPE "patient_relationship_type_enum"`);
  }
}
