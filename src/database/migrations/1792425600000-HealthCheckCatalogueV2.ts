import { MigrationInterface, QueryRunner } from 'typeorm';

export class HealthCheckCatalogueV21792425600000 implements MigrationInterface {
  name = 'HealthCheckCatalogueV21792425600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "health_check_package_contents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "health_check_package_id" uuid NOT NULL, "code" varchar(80) NOT NULL, "name" varchar(160) NOT NULL, "category" varchar(40) NOT NULL DEFAULT 'MEASUREMENT', "description" text, "sort_order" smallint NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_health_check_package_contents" PRIMARY KEY ("id"), CONSTRAINT "FK_health_check_package_contents_package" FOREIGN KEY ("health_check_package_id") REFERENCES "health_check_packages"("id") ON DELETE RESTRICT)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_health_check_package_content_code" ON "health_check_package_contents" ("health_check_package_id", "code")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_health_check_package_content_order" ON "health_check_package_contents" ("health_check_package_id", "sort_order")`);
    await queryRunner.query(`CREATE TABLE "health_check_addons" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" varchar(80) NOT NULL, "name" varchar(160) NOT NULL, "category" varchar(40) NOT NULL, "description" text, "sort_order" smallint NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_health_check_addons" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_health_check_addon_code" ON "health_check_addons" ("code")`);
    await queryRunner.query(`CREATE TABLE "health_check_package_addons" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "health_check_package_id" uuid NOT NULL, "addon_id" uuid NOT NULL, "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_health_check_package_addons" PRIMARY KEY ("id"), CONSTRAINT "FK_health_check_package_addons_package" FOREIGN KEY ("health_check_package_id") REFERENCES "health_check_packages"("id") ON DELETE RESTRICT, CONSTRAINT "FK_health_check_package_addons_addon" FOREIGN KEY ("addon_id") REFERENCES "health_check_addons"("id") ON DELETE RESTRICT)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_health_check_package_addon" ON "health_check_package_addons" ("health_check_package_id", "addon_id")`);
    await queryRunner.query(`CREATE TABLE "provider_service_addons" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "provider_service_id" uuid NOT NULL, "addon_id" uuid NOT NULL, "price_minor" bigint NOT NULL, "currency" char(3) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_provider_service_addons" PRIMARY KEY ("id"), CONSTRAINT "CHK_provider_service_addon_price" CHECK ("price_minor" >= 0), CONSTRAINT "CHK_provider_service_addon_currency" CHECK ("currency" ~ '^[A-Z]{3}$'), CONSTRAINT "FK_provider_service_addons_service" FOREIGN KEY ("provider_service_id") REFERENCES "provider_services"("id") ON DELETE RESTRICT, CONSTRAINT "FK_provider_service_addons_addon" FOREIGN KEY ("addon_id") REFERENCES "health_check_addons"("id") ON DELETE RESTRICT)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_provider_service_addon" ON "provider_service_addons" ("provider_service_id", "addon_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_provider_service_addon_active" ON "provider_service_addons" ("provider_service_id", "is_active")`);
    await queryRunner.query(`ALTER TABLE "provider_services" ADD "fulfilment_fee_minor" bigint NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "provider_services" ADD CONSTRAINT "CHK_provider_services_fulfilment_fee_minor" CHECK ("fulfilment_fee_minor" >= 0)`);
    await queryRunner.query(`ALTER TABLE "bookings" ADD "base_package_price_minor" bigint`);
    await queryRunner.query(`ALTER TABLE "bookings" ADD "clinical_addons_total_minor" bigint`);
    await queryRunner.query(`ALTER TABLE "bookings" ADD "fulfilment_fee_minor" bigint`);
    await queryRunner.query(`ALTER TABLE "bookings" ADD "commercial_configuration_snapshot" jsonb`);
    await queryRunner.query(`INSERT INTO "health_check_package_contents" ("health_check_package_id","code","name","category","sort_order") SELECT p.id,v.code,v.name,v.category,v.ord FROM "health_check_packages" p JOIN (VALUES ('ESSENTIAL','BLOOD_PRESSURE','Blood pressure','MEASUREMENT',1),('ESSENTIAL','BLOOD_GLUCOSE','Blood glucose','MEASUREMENT',2),('ESSENTIAL','BMI','BMI','MEASUREMENT',3),('ESSENTIAL','TEMPERATURE','Temperature','MEASUREMENT',4),('ESSENTIAL','OXYGEN_SATURATION','Oxygen saturation','MEASUREMENT',5),('ESSENTIAL','PULSE','Pulse','MEASUREMENT',6),('COMPLETE','BLOOD_PRESSURE','Blood pressure','MEASUREMENT',1),('COMPLETE','BLOOD_GLUCOSE','Blood glucose','MEASUREMENT',2),('COMPLETE','BMI','BMI','MEASUREMENT',3),('COMPLETE','TEMPERATURE','Temperature','MEASUREMENT',4),('COMPLETE','OXYGEN_SATURATION','Oxygen saturation','MEASUREMENT',5),('COMPLETE','PULSE','Pulse','MEASUREMENT',6),('COMPLETE','CLINICIAN_REVIEW','Additional clinician review','REVIEW',7),('COMPLETE','EXPANDED_INTERPRETATION','Expanded interpretation of recorded measurements','REVIEW',8)) AS v(package_code,code,name,category,ord) ON p.code=v.package_code`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN "commercial_configuration_snapshot"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN "fulfilment_fee_minor"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN "clinical_addons_total_minor"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN "base_package_price_minor"`);
    await queryRunner.query(`ALTER TABLE "provider_services" DROP CONSTRAINT "CHK_provider_services_fulfilment_fee_minor"`);
    await queryRunner.query(`ALTER TABLE "provider_services" DROP COLUMN "fulfilment_fee_minor"`);
    await queryRunner.query(`DROP TABLE "provider_service_addons"`);
    await queryRunner.query(`DROP TABLE "health_check_package_addons"`);
    await queryRunner.query(`DROP TABLE "health_check_addons"`);
    await queryRunner.query(`DROP TABLE "health_check_package_contents"`);
  }
}
