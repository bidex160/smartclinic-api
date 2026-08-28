import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProviderCareServiceDeliveryPricing1790092800000 implements MigrationInterface {
  name = 'ProviderCareServiceDeliveryPricing1790092800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM provider_care_services WHERE price_minor IS NULL OR currency IS NULL) THEN RAISE EXCEPTION 'ProviderCareService delivery pricing migration requires an explicit legacy price and currency for every offering'; END IF; END $$`);
    await queryRunner.query(`CREATE TABLE "provider_care_service_delivery_options" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "provider_care_service_id" uuid NOT NULL,
      "delivery_mode" "general_care_delivery_mode_enum" NOT NULL, "price_minor" bigint NOT NULL,
      "currency" char(3) NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_provider_care_service_delivery_options" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_provider_care_service_delivery_options_mode" UNIQUE ("provider_care_service_id", "delivery_mode"),
      CONSTRAINT "CHK_provider_care_service_delivery_options_price" CHECK ("price_minor" >= 0),
      CONSTRAINT "CHK_provider_care_service_delivery_options_currency" CHECK ("currency" ~ '^[A-Z]{3}$'),
      CONSTRAINT "FK_provider_care_service_delivery_options_service" FOREIGN KEY ("provider_care_service_id") REFERENCES "provider_care_services"("id") ON DELETE CASCADE
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_provider_care_service_delivery_options_mode_service" ON "provider_care_service_delivery_options" ("delivery_mode", "provider_care_service_id")`);
    await queryRunner.query(`INSERT INTO "provider_care_service_delivery_options" ("provider_care_service_id", "delivery_mode", "price_minor", "currency") SELECT service.id, mode, service.price_minor, service.currency FROM provider_care_services service CROSS JOIN LATERAL unnest(service.delivery_modes) mode`);
    await queryRunner.query(`ALTER TABLE "care_requests" ADD "service_price_minor" bigint`);
    await queryRunner.query(`ALTER TABLE "care_requests" ADD "service_currency" char(3)`);
    await queryRunner.query(`UPDATE "care_requests" request SET "service_price_minor" = option.price_minor, "service_currency" = option.currency FROM "provider_care_service_delivery_options" option WHERE option.provider_care_service_id = request.assigned_provider_care_service_id AND option.delivery_mode = request.delivery_mode`);
    await queryRunner.query(`ALTER TABLE "care_requests" ADD CONSTRAINT "CHK_care_requests_service_price_pair" CHECK (("service_price_minor" IS NULL AND "service_currency" IS NULL) OR ("service_price_minor" IS NOT NULL AND "service_currency" IS NOT NULL))`);
    await queryRunner.query(`ALTER TABLE "care_requests" ADD CONSTRAINT "CHK_care_requests_service_price_nonnegative" CHECK ("service_price_minor" IS NULL OR "service_price_minor" >= 0)`);
    await queryRunner.query(`ALTER TABLE "care_requests" ADD CONSTRAINT "CHK_care_requests_service_currency" CHECK ("service_currency" IS NULL OR "service_currency" ~ '^[A-Z]{3}$')`);
    await queryRunner.query(`CREATE FUNCTION enforce_provider_care_service_delivery_option() RETURNS trigger AS $$ DECLARE service_id uuid; BEGIN service_id := CASE WHEN TG_TABLE_NAME = 'provider_care_services' THEN NEW.id ELSE OLD.provider_care_service_id END; IF EXISTS (SELECT 1 FROM provider_care_services WHERE id = service_id) AND NOT EXISTS (SELECT 1 FROM provider_care_service_delivery_options WHERE provider_care_service_id = service_id) THEN RAISE EXCEPTION 'ProviderCareService % must have at least one delivery option', service_id; END IF; RETURN NULL; END; $$ LANGUAGE plpgsql`);
    await queryRunner.query(`CREATE CONSTRAINT TRIGGER "TRG_provider_care_services_require_delivery_option" AFTER INSERT OR UPDATE ON "provider_care_services" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_provider_care_service_delivery_option()`);
    await queryRunner.query(`CREATE CONSTRAINT TRIGGER "TRG_provider_care_delivery_options_prevent_empty" AFTER DELETE ON "provider_care_service_delivery_options" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_provider_care_service_delivery_option()`);
    await queryRunner.query(`DROP INDEX "IDX_provider_care_services_delivery_modes"`);
    await queryRunner.query(`ALTER TABLE "provider_care_services" DROP CONSTRAINT "CHK_provider_care_services_delivery_modes"`);
    await queryRunner.query(`ALTER TABLE "provider_care_services" DROP CONSTRAINT "CHK_provider_care_services_price_currency"`);
    await queryRunner.query(`ALTER TABLE "provider_care_services" DROP CONSTRAINT "CHK_provider_care_services_price_minor"`);
    await queryRunner.query(`ALTER TABLE "provider_care_services" DROP CONSTRAINT "CHK_provider_care_services_currency"`);
    await queryRunner.query(`ALTER TABLE "provider_care_services" DROP COLUMN "delivery_modes"`);
    await queryRunner.query(`ALTER TABLE "provider_care_services" DROP COLUMN "price_minor"`);
    await queryRunner.query(`ALTER TABLE "provider_care_services" DROP COLUMN "currency"`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "provider_care_services" ADD "price_minor" bigint`);
    await queryRunner.query(`ALTER TABLE "provider_care_services" ADD "currency" char(3)`);
    await queryRunner.query(`ALTER TABLE "provider_care_services" ADD "delivery_modes" "general_care_delivery_mode_enum"[] NOT NULL DEFAULT ARRAY['IN_PERSON']::"general_care_delivery_mode_enum"[]`);
    await queryRunner.query(`UPDATE "provider_care_services" service SET "delivery_modes" = data.modes, "price_minor" = data.price_minor, "currency" = data.currency FROM (SELECT provider_care_service_id, array_agg(delivery_mode ORDER BY delivery_mode)::"general_care_delivery_mode_enum"[] modes, (array_agg(price_minor ORDER BY delivery_mode))[1] price_minor, (array_agg(currency ORDER BY delivery_mode))[1] currency FROM provider_care_service_delivery_options GROUP BY provider_care_service_id) data WHERE data.provider_care_service_id = service.id`);
    await queryRunner.query(`ALTER TABLE "provider_care_services" ADD CONSTRAINT "CHK_provider_care_services_price_currency" CHECK (("price_minor" IS NULL AND "currency" IS NULL) OR ("price_minor" IS NOT NULL AND "currency" IS NOT NULL))`);
    await queryRunner.query(`ALTER TABLE "provider_care_services" ADD CONSTRAINT "CHK_provider_care_services_price_minor" CHECK ("price_minor" IS NULL OR "price_minor" >= 0)`);
    await queryRunner.query(`ALTER TABLE "provider_care_services" ADD CONSTRAINT "CHK_provider_care_services_currency" CHECK ("currency" IS NULL OR "currency" ~ '^[A-Z]{3}$')`);
    await queryRunner.query(`ALTER TABLE "provider_care_services" ADD CONSTRAINT "CHK_provider_care_services_delivery_modes" CHECK (cardinality("delivery_modes") > 0)`);
    await queryRunner.query(`CREATE INDEX "IDX_provider_care_services_delivery_modes" ON "provider_care_services" USING GIN ("delivery_modes")`);
    await queryRunner.query(`DROP TRIGGER "TRG_provider_care_delivery_options_prevent_empty" ON "provider_care_service_delivery_options"`);
    await queryRunner.query(`DROP TRIGGER "TRG_provider_care_services_require_delivery_option" ON "provider_care_services"`);
    await queryRunner.query(`DROP FUNCTION enforce_provider_care_service_delivery_option`);
    await queryRunner.query(`ALTER TABLE "care_requests" DROP CONSTRAINT "CHK_care_requests_service_currency"`);
    await queryRunner.query(`ALTER TABLE "care_requests" DROP CONSTRAINT "CHK_care_requests_service_price_nonnegative"`);
    await queryRunner.query(`ALTER TABLE "care_requests" DROP CONSTRAINT "CHK_care_requests_service_price_pair"`);
    await queryRunner.query(`ALTER TABLE "care_requests" DROP COLUMN "service_currency"`);
    await queryRunner.query(`ALTER TABLE "care_requests" DROP COLUMN "service_price_minor"`);
    await queryRunner.query(`DROP TABLE "provider_care_service_delivery_options"`);
  }
}
