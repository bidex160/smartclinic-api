import { MigrationInterface, QueryRunner } from 'typeorm';

export class FindCareProviderServices1789574400000 implements MigrationInterface {
  name = 'FindCareProviderServices1789574400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "providers" ADD "provider_reference" varchar(45)`);
    await queryRunner.query(`UPDATE "providers" SET "provider_reference" = 'SCPR-' || UPPER(REPLACE(uuid_generate_v4()::text, '-', '')) WHERE "provider_reference" IS NULL`);
    await queryRunner.query(`ALTER TABLE "providers" ALTER COLUMN "provider_reference" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "providers" ADD CONSTRAINT "UQ_providers_provider_reference" UNIQUE ("provider_reference")`);

    await queryRunner.query(`CREATE TABLE "care_service_definitions" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" varchar(80) NOT NULL, "name" varchar(160) NOT NULL,
      "description" text, "is_active" boolean NOT NULL DEFAULT true,
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_care_service_definitions" PRIMARY KEY ("id"), CONSTRAINT "UQ_care_service_definitions_code" UNIQUE ("code")
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_care_service_definitions_active_name" ON "care_service_definitions" ("is_active", "name")`);

    await queryRunner.query(`CREATE TABLE "provider_care_services" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "provider_id" uuid NOT NULL, "care_service_definition_id" uuid NOT NULL,
      "description_override" text, "price_minor" bigint, "currency" char(3),
      "supports_appointment_requests" boolean NOT NULL DEFAULT true, "is_active" boolean NOT NULL DEFAULT true,
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_provider_care_services" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_provider_care_services_provider_definition" UNIQUE ("provider_id", "care_service_definition_id"),
      CONSTRAINT "CHK_provider_care_services_price_minor" CHECK ("price_minor" IS NULL OR "price_minor" >= 0),
      CONSTRAINT "CHK_provider_care_services_price_currency" CHECK (("price_minor" IS NULL AND "currency" IS NULL) OR ("price_minor" IS NOT NULL AND "currency" IS NOT NULL)),
      CONSTRAINT "CHK_provider_care_services_currency" CHECK ("currency" IS NULL OR "currency" ~ '^[A-Z]{3}$'),
      CONSTRAINT "FK_provider_care_services_provider" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_provider_care_services_definition" FOREIGN KEY ("care_service_definition_id") REFERENCES "care_service_definitions"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_provider_care_services_public" ON "provider_care_services" ("care_service_definition_id", "is_active", "provider_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_provider_care_services_provider_active" ON "provider_care_services" ("provider_id", "is_active")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "provider_care_services"`);
    await queryRunner.query(`DROP TABLE "care_service_definitions"`);
    await queryRunner.query(`ALTER TABLE "providers" DROP CONSTRAINT "UQ_providers_provider_reference"`);
    await queryRunner.query(`ALTER TABLE "providers" DROP COLUMN "provider_reference"`);
  }
}
