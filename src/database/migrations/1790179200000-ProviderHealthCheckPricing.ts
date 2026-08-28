import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProviderHealthCheckPricing1790179200000 implements MigrationInterface {
  name = 'ProviderHealthCheckPricing1790179200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "provider_services" ADD "price_minor" bigint`);
    await queryRunner.query(`ALTER TABLE "provider_services" ADD "currency" char(3)`);
    await queryRunner.query(`UPDATE "provider_services" service SET "price_minor" = (SELECT (ROUND(price.amount * 100))::bigint FROM package_prices price WHERE price.health_check_package_id = service.health_check_package_id AND price.fulfilment_mode_id = service.fulfilment_mode_id AND price.is_active = true AND price.effective_from <= CURRENT_DATE AND (price.effective_to IS NULL OR price.effective_to > CURRENT_DATE) ORDER BY price.effective_from DESC, price.created_at DESC LIMIT 1), "currency" = (SELECT price.currency FROM package_prices price WHERE price.health_check_package_id = service.health_check_package_id AND price.fulfilment_mode_id = service.fulfilment_mode_id AND price.is_active = true AND price.effective_from <= CURRENT_DATE AND (price.effective_to IS NULL OR price.effective_to > CURRENT_DATE) ORDER BY price.effective_from DESC, price.created_at DESC LIMIT 1)`);
    await queryRunner.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM provider_services WHERE price_minor IS NULL OR currency IS NULL) THEN RAISE EXCEPTION 'Every legacy ProviderService requires one unambiguous active package price before provider pricing migration'; END IF; END $$`);
    await queryRunner.query(`ALTER TABLE "provider_services" ALTER COLUMN "price_minor" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "provider_services" ALTER COLUMN "currency" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "provider_services" ADD CONSTRAINT "CHK_provider_services_price_minor" CHECK ("price_minor" >= 0)`);
    await queryRunner.query(`ALTER TABLE "provider_services" ADD CONSTRAINT "CHK_provider_services_currency" CHECK ("currency" ~ '^[A-Z]{3}$')`);
    await queryRunner.query(`ALTER TABLE "bookings" ADD "commercial_provider_id" uuid`);
    await queryRunner.query(`ALTER TABLE "bookings" ADD "commercial_provider_service_id" uuid`);
    await queryRunner.query(`ALTER TABLE "bookings" ADD CONSTRAINT "CHK_bookings_commercial_provider_pair" CHECK (("commercial_provider_id" IS NULL AND "commercial_provider_service_id" IS NULL) OR ("commercial_provider_id" IS NOT NULL AND "commercial_provider_service_id" IS NOT NULL))`);
    await queryRunner.query(`ALTER TABLE "bookings" ADD CONSTRAINT "FK_bookings_commercial_provider" FOREIGN KEY ("commercial_provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE "bookings" ADD CONSTRAINT "FK_bookings_commercial_provider_service" FOREIGN KEY ("commercial_provider_service_id", "commercial_provider_id") REFERENCES "provider_services"("id", "provider_id") ON DELETE RESTRICT`);
    await queryRunner.query(`CREATE INDEX "IDX_bookings_commercial_provider_status" ON "bookings" ("commercial_provider_id", "status")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_bookings_commercial_provider_status"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP CONSTRAINT "FK_bookings_commercial_provider_service"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP CONSTRAINT "FK_bookings_commercial_provider"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP CONSTRAINT "CHK_bookings_commercial_provider_pair"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN "commercial_provider_service_id"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN "commercial_provider_id"`);
    await queryRunner.query(`ALTER TABLE "provider_services" DROP CONSTRAINT "CHK_provider_services_currency"`);
    await queryRunner.query(`ALTER TABLE "provider_services" DROP CONSTRAINT "CHK_provider_services_price_minor"`);
    await queryRunner.query(`ALTER TABLE "provider_services" DROP COLUMN "currency"`);
    await queryRunner.query(`ALTER TABLE "provider_services" DROP COLUMN "price_minor"`);
  }
}
