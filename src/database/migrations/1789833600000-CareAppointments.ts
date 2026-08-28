import { MigrationInterface, QueryRunner } from 'typeorm';

export class CareAppointments1789833600000 implements MigrationInterface {
  name = 'CareAppointments1789833600000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "provider_locations" ADD "location_reference" varchar(21)`);
    await queryRunner.query(`UPDATE "provider_locations" SET "location_reference" = 'SCPL-' || UPPER(SUBSTRING(MD5("id"::text), 1, 16)) WHERE "location_reference" IS NULL`);
    await queryRunner.query(`ALTER TABLE "provider_locations" ALTER COLUMN "location_reference" SET NOT NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_provider_locations_reference" ON "provider_locations" ("location_reference")`);
    await queryRunner.query(`CREATE TYPE "care_appointment_status_enum" AS ENUM ('SCHEDULED','CONFIRMED','IN_PROGRESS','COMPLETED','CANCELLED','NO_SHOW')`);
    await queryRunner.query(`ALTER TABLE "care_requests" ADD CONSTRAINT "UQ_care_requests_appointment_link" UNIQUE ("id", "patient_id", "assigned_provider_id", "assigned_provider_care_service_id")`);
    await queryRunner.query(`CREATE TABLE "care_appointments" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "reference" varchar(32) NOT NULL,
      "care_request_id" uuid NOT NULL, "patient_id" uuid NOT NULL, "provider_id" uuid NOT NULL,
      "provider_care_service_id" uuid NOT NULL, "provider_location_id" uuid,
      "scheduled_date" date NOT NULL, "scheduled_time_from" time NOT NULL, "scheduled_time_to" time NOT NULL,
      "timezone" varchar(100) NOT NULL, "status" "care_appointment_status_enum" NOT NULL, "notes" text,
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_care_appointments" PRIMARY KEY ("id"), CONSTRAINT "UQ_care_appointments_reference" UNIQUE ("reference"),
      CONSTRAINT "UQ_care_appointments_id_provider" UNIQUE ("id", "provider_id"),
      CONSTRAINT "CHK_care_appointments_time_range" CHECK ("scheduled_time_to" > "scheduled_time_from"),
      CONSTRAINT "FK_care_appointments_request" FOREIGN KEY ("care_request_id", "patient_id", "provider_id", "provider_care_service_id") REFERENCES "care_requests"("id", "patient_id", "assigned_provider_id", "assigned_provider_care_service_id") ON DELETE RESTRICT,
      CONSTRAINT "FK_care_appointments_patient" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_care_appointments_provider" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_care_appointments_offering_provider" FOREIGN KEY ("provider_care_service_id", "provider_id") REFERENCES "provider_care_services"("id", "provider_id") ON DELETE RESTRICT,
      CONSTRAINT "FK_care_appointments_location_provider" FOREIGN KEY ("provider_location_id", "provider_id") REFERENCES "provider_locations"("id", "provider_id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_care_appointments_active_request" ON "care_appointments" ("care_request_id") WHERE "status" IN ('SCHEDULED','CONFIRMED','IN_PROGRESS')`);
    await queryRunner.query(`ALTER TABLE "care_appointments" ADD CONSTRAINT "EX_care_appointments_provider_overlap" EXCLUDE USING gist ("provider_id" WITH =, tsrange(("scheduled_date" + "scheduled_time_from"), ("scheduled_date" + "scheduled_time_to"), '[)') WITH &&) WHERE ("status" IN ('SCHEDULED','CONFIRMED','IN_PROGRESS'))`);
    await queryRunner.query(`CREATE INDEX "IDX_care_appointments_request_created" ON "care_appointments" ("care_request_id", "created_at")`);
    await queryRunner.query(`CREATE INDEX "IDX_care_appointments_provider_date_status" ON "care_appointments" ("provider_id", "scheduled_date", "status")`);
    await queryRunner.query(`CREATE INDEX "IDX_care_appointments_patient_created" ON "care_appointments" ("patient_id", "created_at")`);
    await queryRunner.query(`CREATE TABLE "care_appointment_status_history" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "care_appointment_id" uuid NOT NULL,
      "from_status" "care_appointment_status_enum", "to_status" "care_appointment_status_enum" NOT NULL,
      "actor_user_id" uuid, "reason_code" varchar(100) NOT NULL, "reason_note" text,
      "created_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_care_appointment_status_history" PRIMARY KEY ("id"),
      CONSTRAINT "FK_care_appointment_history_appointment" FOREIGN KEY ("care_appointment_id") REFERENCES "care_appointments"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_care_appointment_history_actor" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_care_appointment_history_appointment_created" ON "care_appointment_status_history" ("care_appointment_id", "created_at")`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "care_appointment_status_history"`);
    await queryRunner.query(`DROP TABLE "care_appointments"`);
    await queryRunner.query(`ALTER TABLE "care_requests" DROP CONSTRAINT "UQ_care_requests_appointment_link"`);
    await queryRunner.query(`DROP TYPE "care_appointment_status_enum"`);
    await queryRunner.query(`DROP INDEX "UQ_provider_locations_reference"`);
    await queryRunner.query(`ALTER TABLE "provider_locations" DROP COLUMN "location_reference"`);
  }
}
