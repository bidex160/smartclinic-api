import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProviderCapabilities1787328000000 implements MigrationInterface {
  name = 'ProviderCapabilities1787328000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "provider_services" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "provider_id" uuid NOT NULL,
      "health_check_package_id" uuid NOT NULL, "fulfilment_mode_id" uuid NOT NULL,
      "is_active" boolean NOT NULL DEFAULT true, "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_provider_services" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_provider_services_provider_package_mode" UNIQUE ("provider_id", "health_check_package_id", "fulfilment_mode_id"),
      CONSTRAINT "UQ_provider_services_id_provider" UNIQUE ("id", "provider_id"),
      CONSTRAINT "FK_provider_services_provider" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_provider_services_package" FOREIGN KEY ("health_check_package_id") REFERENCES "health_check_packages"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_provider_services_mode" FOREIGN KEY ("fulfilment_mode_id") REFERENCES "fulfilment_modes"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_provider_services_matching" ON "provider_services" ("health_check_package_id", "fulfilment_mode_id", "is_active", "provider_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_provider_services_provider_active" ON "provider_services" ("provider_id", "is_active")`);
    await queryRunner.query(`CREATE TABLE "provider_locations" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "provider_id" uuid NOT NULL, "name" varchar NOT NULL,
      "address_line_1" varchar NOT NULL, "address_line_2" varchar, "city" varchar NOT NULL, "state" varchar NOT NULL,
      "country_code" char(2) NOT NULL, "latitude" numeric(9,6), "longitude" numeric(9,6), "is_active" boolean NOT NULL DEFAULT true,
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_provider_locations" PRIMARY KEY ("id"), CONSTRAINT "UQ_provider_locations_id_provider" UNIQUE ("id", "provider_id"),
      CONSTRAINT "CHK_provider_locations_country_code" CHECK ("country_code" ~ '^[A-Z]{2}$'),
      CONSTRAINT "CHK_provider_locations_latitude" CHECK ("latitude" IS NULL OR ("latitude" >= -90 AND "latitude" <= 90)),
      CONSTRAINT "CHK_provider_locations_longitude" CHECK ("longitude" IS NULL OR ("longitude" >= -180 AND "longitude" <= 180)),
      CONSTRAINT "FK_provider_locations_provider" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_provider_locations_provider_active" ON "provider_locations" ("provider_id", "is_active")`);
    await queryRunner.query(`CREATE INDEX "IDX_provider_locations_active_place" ON "provider_locations" ("is_active", "country_code", "state", "city")`);
    await queryRunner.query(`CREATE TABLE "provider_service_locations" (
      "provider_service_id" uuid NOT NULL, "provider_location_id" uuid NOT NULL, "provider_id" uuid NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_provider_service_locations" PRIMARY KEY ("provider_service_id", "provider_location_id"),
      CONSTRAINT "UQ_provider_service_locations_service_location" UNIQUE ("provider_service_id", "provider_location_id"),
      CONSTRAINT "FK_provider_service_locations_service_provider" FOREIGN KEY ("provider_service_id", "provider_id") REFERENCES "provider_services"("id", "provider_id") ON DELETE CASCADE,
      CONSTRAINT "FK_provider_service_locations_location_provider" FOREIGN KEY ("provider_location_id", "provider_id") REFERENCES "provider_locations"("id", "provider_id") ON DELETE CASCADE
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_provider_service_locations_location" ON "provider_service_locations" ("provider_location_id")`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "provider_service_locations"');
    await queryRunner.query('DROP TABLE "provider_locations"');
    await queryRunner.query('DROP TABLE "provider_services"');
  }
}
