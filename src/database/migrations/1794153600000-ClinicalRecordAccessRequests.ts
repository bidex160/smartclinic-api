import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClinicalRecordAccessRequests1794153600000 implements MigrationInterface {
  name = 'ClinicalRecordAccessRequests1794153600000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE "clinical_record_access_request_status_enum" AS ENUM ('PENDING','APPROVED','DECLINED','EXPIRED')`);
    await q.query(`CREATE TABLE "clinical_record_access_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "reference" varchar(32) NOT NULL, "patient_id" uuid NOT NULL, "provider_id" uuid NOT NULL, "scope" "clinical_record_access_scope_enum" NOT NULL, "record_type" "clinical_record_type_enum", "clinical_record_reference" varchar(32), "reason" varchar(1000) NOT NULL, "requested_expires_at" timestamptz, "status" "clinical_record_access_request_status_enum" NOT NULL DEFAULT 'PENDING', "expires_at" timestamptz NOT NULL, "responded_at" timestamptz, "approved_grant_id" uuid, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_clinical_record_access_requests" PRIMARY KEY ("id"), CONSTRAINT "UQ_clinical_record_access_requests_reference" UNIQUE ("reference"), CONSTRAINT "CHK_clinical_record_access_requests_scope" CHECK (("scope"='ALL_RECORDS' AND "record_type" IS NULL AND "clinical_record_reference" IS NULL) OR ("scope"='RECORD_TYPE' AND "record_type" IS NOT NULL AND "clinical_record_reference" IS NULL) OR ("scope"='SINGLE_RECORD' AND "record_type" IS NULL AND "clinical_record_reference" IS NOT NULL)), CONSTRAINT "FK_clinical_record_access_requests_patient" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT, CONSTRAINT "FK_clinical_record_access_requests_provider" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT, CONSTRAINT "FK_clinical_record_access_requests_grant" FOREIGN KEY ("approved_grant_id") REFERENCES "clinical_record_access_grants"("id") ON DELETE RESTRICT)`);
    await q.query(`CREATE INDEX "IDX_clinical_record_access_requests_patient_created" ON "clinical_record_access_requests" ("patient_id","created_at")`);
    await q.query(`CREATE INDEX "IDX_clinical_record_access_requests_provider_created" ON "clinical_record_access_requests" ("provider_id","created_at")`);
    await q.query(`CREATE INDEX "IDX_clinical_record_access_requests_pending" ON "clinical_record_access_requests" ("patient_id","provider_id","status","expires_at")`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "clinical_record_access_requests"`);
    await q.query(`DROP TYPE "clinical_record_access_request_status_enum"`);
  }
}
