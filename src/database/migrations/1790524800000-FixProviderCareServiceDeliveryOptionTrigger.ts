import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixProviderCareServiceDeliveryOptionTrigger1790524800000 implements MigrationInterface {
  name = 'FixProviderCareServiceDeliveryOptionTrigger1790524800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TRG_provider_care_delivery_options_prevent_empty" ON "provider_care_service_delivery_options"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TRG_provider_care_services_require_delivery_option" ON "provider_care_services"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS enforce_provider_care_service_delivery_option()`);

    await queryRunner.query(`CREATE FUNCTION enforce_provider_care_service_has_delivery_option() RETURNS trigger AS $$ BEGIN IF NOT EXISTS (SELECT 1 FROM provider_care_service_delivery_options WHERE provider_care_service_id = NEW.id) THEN RAISE EXCEPTION 'ProviderCareService % must have at least one delivery option', NEW.id; END IF; RETURN NULL; END; $$ LANGUAGE plpgsql`);
    await queryRunner.query(`CREATE FUNCTION prevent_empty_provider_care_service_delivery_options() RETURNS trigger AS $$ BEGIN IF EXISTS (SELECT 1 FROM provider_care_services WHERE id = OLD.provider_care_service_id) AND NOT EXISTS (SELECT 1 FROM provider_care_service_delivery_options WHERE provider_care_service_id = OLD.provider_care_service_id) THEN RAISE EXCEPTION 'ProviderCareService % must have at least one delivery option', OLD.provider_care_service_id; END IF; RETURN NULL; END; $$ LANGUAGE plpgsql`);

    await queryRunner.query(`CREATE CONSTRAINT TRIGGER "TRG_provider_care_services_require_delivery_option" AFTER INSERT OR UPDATE ON "provider_care_services" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_provider_care_service_has_delivery_option()`);
    await queryRunner.query(`CREATE CONSTRAINT TRIGGER "TRG_provider_care_delivery_options_prevent_empty" AFTER DELETE ON "provider_care_service_delivery_options" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION prevent_empty_provider_care_service_delivery_options()`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TRG_provider_care_delivery_options_prevent_empty" ON "provider_care_service_delivery_options"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TRG_provider_care_services_require_delivery_option" ON "provider_care_services"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS prevent_empty_provider_care_service_delivery_options()`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS enforce_provider_care_service_has_delivery_option()`);

    await queryRunner.query(`CREATE FUNCTION enforce_provider_care_service_delivery_option() RETURNS trigger AS $$ DECLARE service_id uuid; BEGIN service_id := CASE WHEN TG_TABLE_NAME = 'provider_care_services' THEN NEW.id ELSE OLD.provider_care_service_id END; IF EXISTS (SELECT 1 FROM provider_care_services WHERE id = service_id) AND NOT EXISTS (SELECT 1 FROM provider_care_service_delivery_options WHERE provider_care_service_id = service_id) THEN RAISE EXCEPTION 'ProviderCareService % must have at least one delivery option', service_id; END IF; RETURN NULL; END; $$ LANGUAGE plpgsql`);
    await queryRunner.query(`CREATE CONSTRAINT TRIGGER "TRG_provider_care_services_require_delivery_option" AFTER INSERT OR UPDATE ON "provider_care_services" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_provider_care_service_delivery_option()`);
    await queryRunner.query(`CREATE CONSTRAINT TRIGGER "TRG_provider_care_delivery_options_prevent_empty" AFTER DELETE ON "provider_care_service_delivery_options" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_provider_care_service_delivery_option()`);
  }
}
