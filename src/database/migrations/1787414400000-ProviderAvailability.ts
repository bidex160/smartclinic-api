import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProviderAvailability1787414400000 implements MigrationInterface {
  name = 'ProviderAvailability1787414400000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "day_of_week_enum" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY')`);
    await queryRunner.query(`CREATE TABLE "provider_availability" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "provider_id" uuid NOT NULL,
      "provider_service_id" uuid, "provider_location_id" uuid, "day_of_week" "day_of_week_enum" NOT NULL,
      "start_time" time NOT NULL, "end_time" time NOT NULL, "timezone" varchar NOT NULL,
      "is_active" boolean NOT NULL DEFAULT true, "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_provider_availability" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_provider_availability_time_range" CHECK ("start_time" < "end_time"),
      CONSTRAINT "CHK_provider_availability_timezone_not_empty" CHECK (length(trim("timezone")) > 0),
      CONSTRAINT "FK_provider_availability_provider" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_provider_availability_service_provider" FOREIGN KEY ("provider_service_id", "provider_id") REFERENCES "provider_services"("id", "provider_id") ON DELETE RESTRICT,
      CONSTRAINT "FK_provider_availability_location_provider" FOREIGN KEY ("provider_location_id", "provider_id") REFERENCES "provider_locations"("id", "provider_id") ON DELETE RESTRICT,
      CONSTRAINT "EX_provider_availability_active_overlap" EXCLUDE USING gist (
        "provider_id" WITH =, "day_of_week" WITH =,
        COALESCE("provider_service_id", '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        COALESCE("provider_location_id", '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        int8range(EXTRACT(EPOCH FROM "start_time")::bigint, EXTRACT(EPOCH FROM "end_time")::bigint, '[)') WITH &&
      ) WHERE ("is_active")
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_provider_availability_lookup" ON "provider_availability" ("provider_id", "day_of_week", "is_active", "start_time", "end_time")`);
    await queryRunner.query(`CREATE INDEX "IDX_provider_availability_service" ON "provider_availability" ("provider_service_id") WHERE "provider_service_id" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_provider_availability_location" ON "provider_availability" ("provider_location_id") WHERE "provider_location_id" IS NOT NULL`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "provider_availability"');
    await queryRunner.query('DROP TYPE "day_of_week_enum"');
  }
}
