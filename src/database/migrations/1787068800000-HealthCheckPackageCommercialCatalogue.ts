import { MigrationInterface, QueryRunner } from 'typeorm';

export class HealthCheckPackageCommercialCatalogue1787068800000 implements MigrationInterface {
  name = 'HealthCheckPackageCommercialCatalogue1787068800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "health_check_packages" ADD "benefits" text array NOT NULL DEFAULT \'{}\'',
    );
    await queryRunner.query(
      'ALTER TABLE "health_check_packages" ADD "estimated_duration_minutes" integer',
    );
    await queryRunner.query(
      'ALTER TABLE "health_check_packages" ADD CONSTRAINT "CHK_health_check_packages_estimated_duration_minutes" CHECK ("estimated_duration_minutes" IS NULL OR "estimated_duration_minutes" > 0)',
    );
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "btree_gist"');
    await queryRunner.query(`
      CREATE TABLE "package_prices" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "health_check_package_id" uuid NOT NULL,
        "fulfilment_mode_id" uuid NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "currency" char(3) NOT NULL,
        "effective_from" date NOT NULL,
        "effective_to" date,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_package_prices" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_package_prices_amount_positive" CHECK ("amount" > 0),
        CONSTRAINT "CHK_package_prices_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$'),
        CONSTRAINT "CHK_package_prices_effective_range" CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from"),
        CONSTRAINT "FK_package_prices_health_check_package" FOREIGN KEY ("health_check_package_id") REFERENCES "health_check_packages"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_package_prices_fulfilment_mode" FOREIGN KEY ("fulfilment_mode_id") REFERENCES "fulfilment_modes"("id") ON DELETE RESTRICT,
        CONSTRAINT "EX_package_prices_active_effective_range" EXCLUDE USING gist ("health_check_package_id" WITH =, "fulfilment_mode_id" WITH =, "currency" WITH =, daterange("effective_from", "effective_to", '[)') WITH &&) WHERE ("is_active")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_package_prices_active_effective_from" ON "package_prices" ("health_check_package_id", "fulfilment_mode_id", "currency", "effective_from") WHERE "is_active" = true',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "package_prices"');
    await queryRunner.query('ALTER TABLE "health_check_packages" DROP CONSTRAINT "CHK_health_check_packages_estimated_duration_minutes"');
    await queryRunner.query('ALTER TABLE "health_check_packages" DROP COLUMN "estimated_duration_minutes"');
    await queryRunner.query('ALTER TABLE "health_check_packages" DROP COLUMN "benefits"');
  }
}
