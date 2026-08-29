import { MigrationInterface, QueryRunner } from 'typeorm';
export class ClinicalRecordAccessGrants1790956800000 implements MigrationInterface { name = 'ClinicalRecordAccessGrants1790956800000';
 async up(q: QueryRunner) {
  await q.query(`CREATE TYPE "clinical_record_access_scope_enum" AS ENUM ('ALL_RECORDS','RECORD_TYPE','SINGLE_RECORD')`); await q.query(`CREATE TYPE "clinical_record_access_action_enum" AS ENUM ('VIEW','ATTACHMENT_ACCESS')`);
  await q.query(`CREATE TABLE "clinical_record_access_grants" (
   "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "reference" varchar(32) NOT NULL, "patient_id" uuid NOT NULL, "grantee_provider_id" uuid NOT NULL,
   "scope" "clinical_record_access_scope_enum" NOT NULL, "record_type" "clinical_record_type_enum", "clinical_record_id" uuid,
   "granted_by_user_id" uuid NOT NULL, "granted_at" timestamptz NOT NULL, "expires_at" timestamptz, "revoked_at" timestamptz,
   "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
   CONSTRAINT "PK_clinical_record_access_grants" PRIMARY KEY ("id"), CONSTRAINT "UQ_clinical_record_access_grants_reference" UNIQUE ("reference"),
   CONSTRAINT "CHK_clinical_record_access_grants_scope" CHECK (("scope"='ALL_RECORDS' AND "record_type" IS NULL AND "clinical_record_id" IS NULL) OR ("scope"='RECORD_TYPE' AND "record_type" IS NOT NULL AND "clinical_record_id" IS NULL) OR ("scope"='SINGLE_RECORD' AND "record_type" IS NULL AND "clinical_record_id" IS NOT NULL)),
   CONSTRAINT "CHK_clinical_record_access_grants_expiry" CHECK ("expires_at" IS NULL OR "expires_at" > "granted_at"),
   CONSTRAINT "FK_clinical_record_access_grants_patient" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT,
   CONSTRAINT "FK_clinical_record_access_grants_provider" FOREIGN KEY ("grantee_provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT,
   CONSTRAINT "FK_clinical_record_access_grants_record" FOREIGN KEY ("clinical_record_id") REFERENCES "clinical_records"("id") ON DELETE RESTRICT,
   CONSTRAINT "FK_clinical_record_access_grants_user" FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT)`);
  await q.query(`CREATE INDEX "IDX_clinical_record_access_grants_patient" ON "clinical_record_access_grants" ("patient_id","created_at")`); await q.query(`CREATE INDEX "IDX_clinical_record_access_grants_provider_active" ON "clinical_record_access_grants" ("grantee_provider_id","revoked_at","expires_at")`);
  await q.query(`CREATE TABLE "clinical_record_access_audit" (
   "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "patient_id" uuid NOT NULL, "clinical_record_id" uuid NOT NULL, "provider_id" uuid NOT NULL, "user_id" uuid NOT NULL, "grant_id" uuid, "action" "clinical_record_access_action_enum" NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(),
   CONSTRAINT "PK_clinical_record_access_audit" PRIMARY KEY ("id"), CONSTRAINT "FK_clinical_record_access_audit_patient" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT,
   CONSTRAINT "FK_clinical_record_access_audit_record" FOREIGN KEY ("clinical_record_id") REFERENCES "clinical_records"("id") ON DELETE RESTRICT, CONSTRAINT "FK_clinical_record_access_audit_provider" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT,
   CONSTRAINT "FK_clinical_record_access_audit_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT, CONSTRAINT "FK_clinical_record_access_audit_grant" FOREIGN KEY ("grant_id") REFERENCES "clinical_record_access_grants"("id") ON DELETE SET NULL)`);
  await q.query(`CREATE INDEX "IDX_clinical_record_access_audit_patient_created" ON "clinical_record_access_audit" ("patient_id","created_at")`); await q.query(`CREATE INDEX "IDX_clinical_record_access_audit_provider_created" ON "clinical_record_access_audit" ("provider_id","created_at")`); await q.query(`CREATE INDEX "IDX_clinical_record_access_audit_record_created" ON "clinical_record_access_audit" ("clinical_record_id","created_at")`);
  await q.query(`CREATE FUNCTION prevent_clinical_record_access_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'clinical record access audit is append-only'; END; $$`);
  await q.query(`CREATE TRIGGER "TRG_clinical_record_access_audit_append_only" BEFORE UPDATE OR DELETE ON "clinical_record_access_audit" FOR EACH ROW EXECUTE FUNCTION prevent_clinical_record_access_audit_mutation()`);
 }
 async down(q: QueryRunner) { await q.query(`DROP TRIGGER "TRG_clinical_record_access_audit_append_only" ON "clinical_record_access_audit"`); await q.query(`DROP FUNCTION prevent_clinical_record_access_audit_mutation()`); await q.query(`DROP TABLE "clinical_record_access_audit"`); await q.query(`DROP TABLE "clinical_record_access_grants"`); await q.query(`DROP TYPE "clinical_record_access_action_enum"`); await q.query(`DROP TYPE "clinical_record_access_scope_enum"`); }
}
