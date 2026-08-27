import { MigrationInterface, QueryRunner } from 'typeorm';

export class CareRequests1789660800000 implements MigrationInterface {
  name = 'CareRequests1789660800000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "care_request_contact_method_enum" AS ENUM ('EMAIL', 'PHONE', 'WHATSAPP')`);
    await queryRunner.query(`CREATE TYPE "care_request_status_enum" AS ENUM ('SUBMITTED', 'MATCHING', 'PROVIDER_SELECTED', 'AWAITING_PROVIDER_RESPONSE', 'PROVIDER_ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DECLINED', 'UNFULFILLABLE')`);
    await queryRunner.query(`ALTER TABLE "patients" ADD CONSTRAINT "UQ_patients_id_user" UNIQUE ("id", "user_id")`);
    await queryRunner.query(`CREATE TABLE "care_requests" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "reference" varchar(32) NOT NULL,
      "user_id" uuid NOT NULL, "patient_id" uuid NOT NULL, "care_service_definition_id" uuid NOT NULL,
      "preferred_provider_id" uuid, "preferred_provider_care_service_id" uuid,
      "assigned_provider_id" uuid, "assigned_provider_care_service_id" uuid,
      "country_code" char(2) NOT NULL, "state_or_region" varchar(120) NOT NULL, "city" varchar(120) NOT NULL,
      "notes" text, "preferred_date" date, "preferred_time" time,
      "contact_method" "care_request_contact_method_enum" NOT NULL, "status" "care_request_status_enum" NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_care_requests" PRIMARY KEY ("id"), CONSTRAINT "UQ_care_requests_reference" UNIQUE ("reference"),
      CONSTRAINT "CHK_care_requests_country_code" CHECK ("country_code" ~ '^[A-Z]{2}$'),
      CONSTRAINT "CHK_care_requests_preferred_pair" CHECK (("preferred_provider_id" IS NULL AND "preferred_provider_care_service_id" IS NULL) OR ("preferred_provider_id" IS NOT NULL AND "preferred_provider_care_service_id" IS NOT NULL)),
      CONSTRAINT "CHK_care_requests_assigned_pair" CHECK (("assigned_provider_id" IS NULL AND "assigned_provider_care_service_id" IS NULL) OR ("assigned_provider_id" IS NOT NULL AND "assigned_provider_care_service_id" IS NOT NULL)),
      CONSTRAINT "FK_care_requests_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_care_requests_patient" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_care_requests_patient_user" FOREIGN KEY ("patient_id", "user_id") REFERENCES "patients"("id", "user_id") ON DELETE RESTRICT,
      CONSTRAINT "FK_care_requests_definition" FOREIGN KEY ("care_service_definition_id") REFERENCES "care_service_definitions"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_care_requests_preferred_provider" FOREIGN KEY ("preferred_provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_care_requests_assigned_provider" FOREIGN KEY ("assigned_provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_care_requests_preferred_offering_provider" FOREIGN KEY ("preferred_provider_care_service_id", "preferred_provider_id") REFERENCES "provider_care_services"("id", "provider_id") ON DELETE RESTRICT,
      CONSTRAINT "FK_care_requests_preferred_offering_definition" FOREIGN KEY ("preferred_provider_care_service_id", "care_service_definition_id") REFERENCES "provider_care_services"("id", "care_service_definition_id") ON DELETE RESTRICT,
      CONSTRAINT "FK_care_requests_assigned_offering_provider" FOREIGN KEY ("assigned_provider_care_service_id", "assigned_provider_id") REFERENCES "provider_care_services"("id", "provider_id") ON DELETE RESTRICT,
      CONSTRAINT "FK_care_requests_assigned_offering_definition" FOREIGN KEY ("assigned_provider_care_service_id", "care_service_definition_id") REFERENCES "provider_care_services"("id", "care_service_definition_id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_care_requests_patient_created" ON "care_requests" ("patient_id", "created_at")`);
    await queryRunner.query(`CREATE INDEX "IDX_care_requests_user_created" ON "care_requests" ("user_id", "created_at")`);
    await queryRunner.query(`CREATE INDEX "IDX_care_requests_status_created" ON "care_requests" ("status", "created_at")`);
    await queryRunner.query(`CREATE INDEX "IDX_care_requests_assigned_provider_status" ON "care_requests" ("assigned_provider_id", "status")`);
    await queryRunner.query(`CREATE INDEX "IDX_care_requests_service_status" ON "care_requests" ("care_service_definition_id", "status")`);
    await queryRunner.query(`CREATE TABLE "care_request_status_history" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "care_request_id" uuid NOT NULL,
      "from_status" "care_request_status_enum", "to_status" "care_request_status_enum" NOT NULL,
      "actor_user_id" uuid, "reason_code" varchar(80), "reason_note" text,
      "created_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_care_request_status_history" PRIMARY KEY ("id"),
      CONSTRAINT "FK_care_request_status_history_request" FOREIGN KEY ("care_request_id") REFERENCES "care_requests"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_care_request_status_history_actor" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_care_request_status_history_request_created" ON "care_request_status_history" ("care_request_id", "created_at")`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "care_request_status_history"`);
    await queryRunner.query(`DROP TABLE "care_requests"`);
    await queryRunner.query(`ALTER TABLE "patients" DROP CONSTRAINT IF EXISTS "UQ_patients_id_user"`);
    await queryRunner.query(`DROP TYPE "care_request_status_enum"`);
    await queryRunner.query(`DROP TYPE "care_request_contact_method_enum"`);
  }
}
