import { MigrationInterface, QueryRunner } from 'typeorm';

export class ShareableHealthPassportScope1794240000000 implements MigrationInterface {
  name = 'ShareableHealthPassportScope1794240000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "clinical_record_access_grants" DROP CONSTRAINT "CHK_clinical_record_access_grants_scope"`);
    await q.query(`ALTER TABLE "clinical_record_access_requests" DROP CONSTRAINT "CHK_clinical_record_access_requests_scope"`);
    await q.query(`ALTER TABLE "clinical_record_access_grants" ALTER COLUMN "scope" TYPE varchar USING "scope"::text`);
    await q.query(`ALTER TABLE "clinical_record_access_requests" ALTER COLUMN "scope" TYPE varchar USING "scope"::text`);
    await q.query(`DROP TYPE "clinical_record_access_scope_enum"`);
    await q.query(`CREATE TYPE "clinical_record_access_scope_enum" AS ENUM ('HEALTH_PASSPORT','ALL_RECORDS','RECORD_TYPE','SINGLE_RECORD')`);
    await q.query(`ALTER TABLE "clinical_record_access_grants" ALTER COLUMN "scope" TYPE "clinical_record_access_scope_enum" USING "scope"::"clinical_record_access_scope_enum"`);
    await q.query(`ALTER TABLE "clinical_record_access_requests" ALTER COLUMN "scope" TYPE "clinical_record_access_scope_enum" USING "scope"::"clinical_record_access_scope_enum"`);
    await q.query(`ALTER TABLE "clinical_record_access_grants" ADD CONSTRAINT "CHK_clinical_record_access_grants_scope" CHECK (("scope" IN ('HEALTH_PASSPORT','ALL_RECORDS') AND "record_type" IS NULL AND "clinical_record_id" IS NULL) OR ("scope"='RECORD_TYPE' AND "record_type" IS NOT NULL AND "clinical_record_id" IS NULL) OR ("scope"='SINGLE_RECORD' AND "record_type" IS NULL AND "clinical_record_id" IS NOT NULL))`);
    await q.query(`ALTER TABLE "clinical_record_access_requests" ADD CONSTRAINT "CHK_clinical_record_access_requests_scope" CHECK (("scope" IN ('HEALTH_PASSPORT','ALL_RECORDS') AND "record_type" IS NULL AND "clinical_record_reference" IS NULL) OR ("scope"='RECORD_TYPE' AND "record_type" IS NOT NULL AND "clinical_record_reference" IS NULL) OR ("scope"='SINGLE_RECORD' AND "record_type" IS NULL AND "clinical_record_reference" IS NOT NULL))`);
    await q.query(`ALTER TABLE "clinical_record_access_audit" ALTER COLUMN "clinical_record_id" DROP NOT NULL, ADD COLUMN "source_domain" varchar(40), ADD COLUMN "source_reference" varchar(32)`);
    await q.query(`ALTER TABLE "clinical_record_access_audit" DISABLE TRIGGER "TRG_clinical_record_access_audit_append_only"`);
    await q.query(`UPDATE "clinical_record_access_audit" audit SET "source_domain"='CLINICAL_RECORD', "source_reference"=record."reference" FROM "clinical_records" record WHERE record."id"=audit."clinical_record_id"`);
    await q.query(`ALTER TABLE "clinical_record_access_audit" ENABLE TRIGGER "TRG_clinical_record_access_audit_append_only"`);
    await q.query(`ALTER TABLE "clinical_record_access_audit" ALTER COLUMN "source_domain" SET NOT NULL, ALTER COLUMN "source_domain" SET DEFAULT 'CLINICAL_RECORD', ALTER COLUMN "source_reference" SET NOT NULL, ADD CONSTRAINT "CHK_clinical_record_access_audit_source" CHECK (("source_domain"='CLINICAL_RECORD' AND "clinical_record_id" IS NOT NULL) OR ("source_domain"='HEALTH_PASSPORT' AND "clinical_record_id" IS NULL))`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM "clinical_record_access_grants" WHERE "scope"='HEALTH_PASSPORT') OR EXISTS (SELECT 1 FROM "clinical_record_access_requests" WHERE "scope"='HEALTH_PASSPORT') THEN RAISE EXCEPTION 'Cannot remove HEALTH_PASSPORT scope while historical rows use it'; END IF; END $$`);
    await q.query(`ALTER TABLE "clinical_record_access_audit" DROP CONSTRAINT "CHK_clinical_record_access_audit_source", DROP COLUMN "source_reference", DROP COLUMN "source_domain", ALTER COLUMN "clinical_record_id" SET NOT NULL`);
    await q.query(`ALTER TABLE "clinical_record_access_grants" DROP CONSTRAINT "CHK_clinical_record_access_grants_scope"`);
    await q.query(`ALTER TABLE "clinical_record_access_requests" DROP CONSTRAINT "CHK_clinical_record_access_requests_scope"`);
    await q.query(`ALTER TABLE "clinical_record_access_grants" ALTER COLUMN "scope" TYPE varchar USING "scope"::text`);
    await q.query(`ALTER TABLE "clinical_record_access_requests" ALTER COLUMN "scope" TYPE varchar USING "scope"::text`);
    await q.query(`DROP TYPE "clinical_record_access_scope_enum"`);
    await q.query(`CREATE TYPE "clinical_record_access_scope_enum" AS ENUM ('ALL_RECORDS','RECORD_TYPE','SINGLE_RECORD')`);
    await q.query(`ALTER TABLE "clinical_record_access_grants" ALTER COLUMN "scope" TYPE "clinical_record_access_scope_enum" USING "scope"::"clinical_record_access_scope_enum"`);
    await q.query(`ALTER TABLE "clinical_record_access_requests" ALTER COLUMN "scope" TYPE "clinical_record_access_scope_enum" USING "scope"::"clinical_record_access_scope_enum"`);
    await q.query(`ALTER TABLE "clinical_record_access_grants" ADD CONSTRAINT "CHK_clinical_record_access_grants_scope" CHECK (("scope"='ALL_RECORDS' AND "record_type" IS NULL AND "clinical_record_id" IS NULL) OR ("scope"='RECORD_TYPE' AND "record_type" IS NOT NULL AND "clinical_record_id" IS NULL) OR ("scope"='SINGLE_RECORD' AND "record_type" IS NULL AND "clinical_record_id" IS NOT NULL))`);
    await q.query(`ALTER TABLE "clinical_record_access_requests" ADD CONSTRAINT "CHK_clinical_record_access_requests_scope" CHECK (("scope"='ALL_RECORDS' AND "record_type" IS NULL AND "clinical_record_reference" IS NULL) OR ("scope"='RECORD_TYPE' AND "record_type" IS NOT NULL AND "clinical_record_reference" IS NULL) OR ("scope"='SINGLE_RECORD' AND "record_type" IS NULL AND "clinical_record_reference" IS NOT NULL))`);
  }
}
