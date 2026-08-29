import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClinicalRecordsFoundation1790611200000 implements MigrationInterface {
  name = 'ClinicalRecordsFoundation1790611200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "clinical_record_type_enum" AS ENUM ('CONSULTATION','LAB_RESULT','IMAGING_RESULT','PROCEDURE','PHARMACY','FOLLOW_UP','OTHER')`);
    await queryRunner.query(`CREATE TYPE "clinical_record_status_enum" AS ENUM ('DRAFT','FINALIZED')`);
    await queryRunner.query(`ALTER TABLE "care_service_definitions" ADD "clinical_record_type" "clinical_record_type_enum"`);
    await queryRunner.query(`CREATE TABLE "clinical_records" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "reference" varchar(32) NOT NULL,
      "patient_id" uuid NOT NULL, "provider_id" uuid NOT NULL, "care_request_id" uuid,
      "care_appointment_id" uuid, "care_service_definition_id" uuid,
      "record_type" "clinical_record_type_enum" NOT NULL, "title" varchar(200) NOT NULL,
      "summary" text, "status" "clinical_record_status_enum" NOT NULL,
      "occurred_at" timestamptz NOT NULL, "finalized_at" timestamptz,
      "created_by_user_id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_clinical_records" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_clinical_records_reference" UNIQUE ("reference"),
      CONSTRAINT "CHK_clinical_records_finalized_at" CHECK (("status" = 'DRAFT' AND "finalized_at" IS NULL) OR ("status" = 'FINALIZED' AND "finalized_at" IS NOT NULL)),
      CONSTRAINT "FK_clinical_records_patient" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_clinical_records_provider" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_clinical_records_care_request" FOREIGN KEY ("care_request_id") REFERENCES "care_requests"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_clinical_records_care_appointment" FOREIGN KEY ("care_appointment_id") REFERENCES "care_appointments"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_clinical_records_definition" FOREIGN KEY ("care_service_definition_id") REFERENCES "care_service_definitions"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_clinical_records_created_by" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_clinical_records_care_appointment" ON "clinical_records" ("care_appointment_id") WHERE "care_appointment_id" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_clinical_records_patient_status_occurred" ON "clinical_records" ("patient_id", "status", "occurred_at")`);
    await queryRunner.query(`CREATE INDEX "IDX_clinical_records_provider_status_created" ON "clinical_records" ("provider_id", "status", "created_at")`);
    await queryRunner.query(`CREATE INDEX "IDX_clinical_records_care_request" ON "clinical_records" ("care_request_id")`);
    await queryRunner.query(`CREATE TABLE "clinical_consultation_details" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "clinical_record_id" uuid NOT NULL,
      "presenting_complaint" text, "history_of_presenting_complaint" text,
      "observations" text, "assessment" text, "diagnosis" text, "plan" text,
      "follow_up_instructions" text, "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_clinical_consultation_details" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_clinical_consultation_details_record" UNIQUE ("clinical_record_id"),
      CONSTRAINT "FK_clinical_consultation_details_record" FOREIGN KEY ("clinical_record_id") REFERENCES "clinical_records"("id") ON DELETE CASCADE
    )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "clinical_consultation_details"`);
    await queryRunner.query(`DROP TABLE "clinical_records"`);
    await queryRunner.query(`ALTER TABLE "care_service_definitions" DROP COLUMN "clinical_record_type"`);
    await queryRunner.query(`DROP TYPE "clinical_record_status_enum"`);
    await queryRunner.query(`DROP TYPE "clinical_record_type_enum"`);
  }
}
