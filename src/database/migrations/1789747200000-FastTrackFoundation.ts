import { MigrationInterface, QueryRunner } from 'typeorm';

export class FastTrackFoundation1789747200000 implements MigrationInterface {
  name = 'FastTrackFoundation1789747200000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "provider_care_services" ADD "supports_fast_track" boolean NOT NULL DEFAULT false, ADD "fast_track_fee_minor" bigint, ADD "fast_track_currency" char(3)`);
    await queryRunner.query(`ALTER TABLE "provider_care_services" ADD CONSTRAINT "CHK_provider_care_services_fasttrack_fee" CHECK (("supports_fast_track" = false AND "fast_track_fee_minor" IS NULL AND "fast_track_currency" IS NULL) OR ("supports_fast_track" = true AND "fast_track_fee_minor" > 0 AND "fast_track_currency" IS NOT NULL))`);
    await queryRunner.query(`CREATE TYPE "fasttrack_source_enum" AS ENUM ('SMARTCLINIC_CARE_REQUEST', 'EXTERNAL_APPOINTMENT')`);
    await queryRunner.query(`CREATE TYPE "fasttrack_status_enum" AS ENUM ('SUBMITTED','VERIFYING','READY_FOR_PAYMENT','PAYMENT_PENDING','PAID','CONFIRMED','IN_PROGRESS','COMPLETED','REJECTED','CANCELLED','EXPIRED')`);
    await queryRunner.query(`CREATE TABLE "fasttrack_requests" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "reference" varchar(32) NOT NULL,
      "user_id" uuid NOT NULL, "patient_id" uuid NOT NULL, "source" "fasttrack_source_enum" NOT NULL,
      "care_request_id" uuid, "provider_id" uuid NOT NULL, "provider_care_service_id" uuid NOT NULL, "care_service_definition_id" uuid NOT NULL,
      "external_appointment_reference" varchar(160), "appointment_date" date, "appointment_time" time,
      "department" varchar(160), "doctor_name" varchar(160), "notes" text,
      "fee_minor" bigint NOT NULL, "currency" char(3) NOT NULL, "status" "fasttrack_status_enum" NOT NULL,
      "verified_at" timestamptz, "paid_at" timestamptz, "confirmed_at" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_fasttrack_requests" PRIMARY KEY ("id"), CONSTRAINT "UQ_fasttrack_requests_reference" UNIQUE ("reference"), CONSTRAINT "UQ_fasttrack_requests_id_user" UNIQUE ("id", "user_id"),
      CONSTRAINT "CHK_fasttrack_requests_fee" CHECK ("fee_minor" > 0), CONSTRAINT "CHK_fasttrack_requests_currency" CHECK ("currency" ~ '^[A-Z]{3}$'),
      CONSTRAINT "CHK_fasttrack_requests_source" CHECK (("source" = 'SMARTCLINIC_CARE_REQUEST' AND "care_request_id" IS NOT NULL AND "external_appointment_reference" IS NULL) OR ("source" = 'EXTERNAL_APPOINTMENT' AND "care_request_id" IS NULL AND "external_appointment_reference" IS NOT NULL AND "appointment_date" IS NOT NULL)),
      CONSTRAINT "FK_fasttrack_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_fasttrack_patient" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_fasttrack_patient_user" FOREIGN KEY ("patient_id", "user_id") REFERENCES "patients"("id", "user_id") ON DELETE RESTRICT,
      CONSTRAINT "FK_fasttrack_care_request" FOREIGN KEY ("care_request_id") REFERENCES "care_requests"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_fasttrack_provider" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_fasttrack_offering_provider" FOREIGN KEY ("provider_care_service_id", "provider_id") REFERENCES "provider_care_services"("id", "provider_id") ON DELETE RESTRICT,
      CONSTRAINT "FK_fasttrack_offering_definition" FOREIGN KEY ("provider_care_service_id", "care_service_definition_id") REFERENCES "provider_care_services"("id", "care_service_definition_id") ON DELETE RESTRICT,
      CONSTRAINT "FK_fasttrack_definition" FOREIGN KEY ("care_service_definition_id") REFERENCES "care_service_definitions"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_fasttrack_active_care_request" ON "fasttrack_requests" ("care_request_id") WHERE "care_request_id" IS NOT NULL AND "status" NOT IN ('REJECTED','CANCELLED','EXPIRED','COMPLETED')`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_fasttrack_active_external_appointment" ON "fasttrack_requests" ("user_id", "provider_id", LOWER("external_appointment_reference")) WHERE "external_appointment_reference" IS NOT NULL AND "status" NOT IN ('REJECTED','CANCELLED','EXPIRED','COMPLETED')`);
    await queryRunner.query(`CREATE INDEX "IDX_fasttrack_requests_user_created" ON "fasttrack_requests" ("user_id", "created_at")`);
    await queryRunner.query(`CREATE INDEX "IDX_fasttrack_requests_provider_status" ON "fasttrack_requests" ("provider_id", "status")`);
    await queryRunner.query(`CREATE INDEX "IDX_fasttrack_requests_status_created" ON "fasttrack_requests" ("status", "created_at")`);
    await queryRunner.query(`CREATE TABLE "fasttrack_request_status_history" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "fasttrack_request_id" uuid NOT NULL,
      "from_status" "fasttrack_status_enum", "to_status" "fasttrack_status_enum" NOT NULL,
      "actor_user_id" uuid, "reason_code" varchar(100) NOT NULL, "reason_note" text,
      "created_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_fasttrack_request_status_history" PRIMARY KEY ("id"),
      CONSTRAINT "FK_fasttrack_history_request" FOREIGN KEY ("fasttrack_request_id") REFERENCES "fasttrack_requests"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_fasttrack_history_actor" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_fasttrack_history_request_created" ON "fasttrack_request_status_history" ("fasttrack_request_id", "created_at")`);
    await queryRunner.query(`ALTER TABLE "payment_attempts" DROP CONSTRAINT "FK_payment_attempts_booking_funding"`);
    await queryRunner.query(`ALTER TABLE "payment_attempts" ALTER COLUMN "booking_funding_id" DROP NOT NULL, ADD "fasttrack_request_id" uuid`);
    await queryRunner.query(`ALTER TABLE "payment_attempts" ADD CONSTRAINT "FK_payment_attempts_booking_funding" FOREIGN KEY ("booking_funding_id") REFERENCES "booking_funding"("id") ON DELETE RESTRICT, ADD CONSTRAINT "FK_payment_attempts_fasttrack" FOREIGN KEY ("fasttrack_request_id") REFERENCES "fasttrack_requests"("id") ON DELETE RESTRICT, ADD CONSTRAINT "CHK_payment_attempts_obligation" CHECK (("booking_funding_id" IS NOT NULL AND "fasttrack_request_id" IS NULL) OR ("booking_funding_id" IS NULL AND "fasttrack_request_id" IS NOT NULL))`);
    await queryRunner.query(`CREATE INDEX "IDX_payment_attempts_fasttrack_status" ON "payment_attempts" ("fasttrack_request_id", "status")`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_payment_attempts_fasttrack_status"`);
    await queryRunner.query(`ALTER TABLE "payment_attempts" DROP CONSTRAINT "CHK_payment_attempts_obligation", DROP CONSTRAINT "FK_payment_attempts_fasttrack", DROP CONSTRAINT "FK_payment_attempts_booking_funding"`);
    await queryRunner.query(`ALTER TABLE "payment_attempts" DROP COLUMN "fasttrack_request_id", ALTER COLUMN "booking_funding_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "payment_attempts" ADD CONSTRAINT "FK_payment_attempts_booking_funding" FOREIGN KEY ("booking_funding_id") REFERENCES "booking_funding"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`DROP TABLE "fasttrack_request_status_history"`);
    await queryRunner.query(`DROP TABLE "fasttrack_requests"`);
    await queryRunner.query(`DROP TYPE "fasttrack_status_enum"`);
    await queryRunner.query(`DROP TYPE "fasttrack_source_enum"`);
    await queryRunner.query(`ALTER TABLE "provider_care_services" DROP CONSTRAINT "CHK_provider_care_services_fasttrack_fee", DROP COLUMN "fast_track_currency", DROP COLUMN "fast_track_fee_minor", DROP COLUMN "supports_fast_track"`);
  }
}
