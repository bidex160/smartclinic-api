import { MigrationInterface, QueryRunner } from 'typeorm';

export class CanonicalHealthCheckClinicalContent1793548800000 implements MigrationInterface {
  name = 'CanonicalHealthCheckClinicalContent1793548800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT code
          FROM (
            SELECT code, name, category FROM health_check_package_contents
            UNION ALL
            SELECT code, name, category FROM health_check_addons
          ) definitions
          GROUP BY code
          HAVING COUNT(DISTINCT ROW(name, category)) > 1
        ) THEN
          RAISE EXCEPTION 'Conflicting Health Check clinical definitions share a code';
        END IF;
      END $$
    `);
    await queryRunner.query(`CREATE TYPE "health_check_clinical_result_type_enum" AS ENUM ('NONE', 'SINGLE_NUMERIC', 'BLOOD_PRESSURE')`);
    await queryRunner.query(`CREATE TABLE "health_check_clinical_contents" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "reference" varchar(23) NOT NULL,
      "code" varchar(80) NOT NULL,
      "name" varchar(160) NOT NULL,
      "description" text,
      "category" varchar(40) NOT NULL,
      "display_order" smallint NOT NULL DEFAULT 0,
      "result_type" "health_check_clinical_result_type_enum" NOT NULL DEFAULT 'NONE',
      "unit" varchar(16),
      "is_active" boolean NOT NULL DEFAULT true,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_health_check_clinical_contents" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_health_check_clinical_contents_result_contract" CHECK (("result_type" = 'NONE' AND "unit" IS NULL) OR ("result_type" <> 'NONE' AND "unit" IS NOT NULL))
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_health_check_clinical_contents_reference" ON "health_check_clinical_contents" ("reference")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_health_check_clinical_contents_code" ON "health_check_clinical_contents" ("code")`);
    await queryRunner.query(`CREATE FUNCTION "prevent_health_check_clinical_content_code_change"() RETURNS trigger AS $$ BEGIN IF NEW.code <> OLD.code THEN RAISE EXCEPTION 'Health Check clinical content code is immutable'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await queryRunner.query(`CREATE TRIGGER "TR_health_check_clinical_content_code_immutable" BEFORE UPDATE OF "code" ON "health_check_clinical_contents" FOR EACH ROW EXECUTE FUNCTION "prevent_health_check_clinical_content_code_change"()`);
    await queryRunner.query(`
      WITH definitions AS (
        SELECT code, name, description, category, sort_order, is_active, 1 AS source_priority FROM health_check_package_contents
        UNION ALL
        SELECT code, name, description, category, sort_order, is_active, 2 AS source_priority FROM health_check_addons
      ), canonical AS (
        SELECT DISTINCT ON (code)
          code, name, description, category, sort_order,
          BOOL_OR(is_active) OVER (PARTITION BY code) AS is_active
        FROM definitions
        ORDER BY code, source_priority DESC, (description IS NOT NULL) DESC
      )
      INSERT INTO health_check_clinical_contents
        (reference, code, name, description, category, display_order, result_type, unit, is_active)
      SELECT
        'SC-HCC-' || UPPER(SUBSTRING(REPLACE(uuid_generate_v4()::text, '-', ''), 1, 16)),
        code, name, description, category, sort_order,
        CASE
          WHEN code = 'BLOOD_PRESSURE' THEN 'BLOOD_PRESSURE'::health_check_clinical_result_type_enum
          WHEN code IN ('BLOOD_GLUCOSE', 'BMI', 'TEMPERATURE', 'OXYGEN_SATURATION', 'PULSE') THEN 'SINGLE_NUMERIC'::health_check_clinical_result_type_enum
          ELSE 'NONE'::health_check_clinical_result_type_enum
        END,
        CASE code
          WHEN 'BLOOD_PRESSURE' THEN 'mmHg'
          WHEN 'BLOOD_GLUCOSE' THEN 'mg/dL'
          WHEN 'BMI' THEN 'kg/m²'
          WHEN 'TEMPERATURE' THEN '°C'
          WHEN 'OXYGEN_SATURATION' THEN '%'
          WHEN 'PULSE' THEN 'bpm'
          ELSE NULL
        END,
        is_active
      FROM canonical
    `);

    await queryRunner.query(`ALTER TABLE "health_check_package_contents" ADD "clinical_content_id" uuid`);
    await queryRunner.query(`UPDATE "health_check_package_contents" composition SET "clinical_content_id" = content.id FROM "health_check_clinical_contents" content WHERE content.code = composition.code`);
    await queryRunner.query(`ALTER TABLE "health_check_package_contents" ALTER COLUMN "clinical_content_id" SET NOT NULL`);
    await queryRunner.query(`DROP INDEX "UQ_health_check_package_content_code"`);
    await queryRunner.query(`ALTER TABLE "health_check_package_contents" DROP COLUMN "code", DROP COLUMN "name", DROP COLUMN "category", DROP COLUMN "description"`);
    await queryRunner.query(`ALTER TABLE "health_check_package_contents" ADD CONSTRAINT "FK_health_check_package_contents_content" FOREIGN KEY ("clinical_content_id") REFERENCES "health_check_clinical_contents"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_health_check_package_content" ON "health_check_package_contents" ("health_check_package_id", "clinical_content_id")`);

    await queryRunner.query(`ALTER TABLE "health_check_package_addons" ADD "clinical_content_id" uuid`);
    await queryRunner.query(`UPDATE "health_check_package_addons" eligibility SET "clinical_content_id" = content.id FROM "health_check_addons" addon JOIN "health_check_clinical_contents" content ON content.code = addon.code WHERE eligibility.addon_id = addon.id`);
    await queryRunner.query(`ALTER TABLE "health_check_package_addons" ALTER COLUMN "clinical_content_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "health_check_package_addons" DROP CONSTRAINT "FK_health_check_package_addons_addon"`);
    await queryRunner.query(`DROP INDEX "UQ_health_check_package_addon"`);
    await queryRunner.query(`ALTER TABLE "health_check_package_addons" DROP COLUMN "addon_id"`);
    await queryRunner.query(`ALTER TABLE "health_check_package_addons" ADD CONSTRAINT "FK_health_check_package_addons_content" FOREIGN KEY ("clinical_content_id") REFERENCES "health_check_clinical_contents"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_health_check_package_addon" ON "health_check_package_addons" ("health_check_package_id", "clinical_content_id")`);

    await queryRunner.query(`ALTER TABLE "provider_service_addons" ADD "clinical_content_id" uuid`);
    await queryRunner.query(`UPDATE "provider_service_addons" offering SET "clinical_content_id" = content.id FROM "health_check_addons" addon JOIN "health_check_clinical_contents" content ON content.code = addon.code WHERE offering.addon_id = addon.id`);
    await queryRunner.query(`ALTER TABLE "provider_service_addons" ALTER COLUMN "clinical_content_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "provider_service_addons" DROP CONSTRAINT "FK_provider_service_addons_addon"`);
    await queryRunner.query(`DROP INDEX "UQ_provider_service_addon"`);
    await queryRunner.query(`ALTER TABLE "provider_service_addons" DROP COLUMN "addon_id"`);
    await queryRunner.query(`ALTER TABLE "provider_service_addons" ADD CONSTRAINT "FK_provider_service_addons_content" FOREIGN KEY ("clinical_content_id") REFERENCES "health_check_clinical_contents"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_provider_service_addon" ON "provider_service_addons" ("provider_service_id", "clinical_content_id")`);

    await queryRunner.query(`DROP TABLE "health_check_addons"`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "health_check_addons" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" varchar(80) NOT NULL, "name" varchar(160) NOT NULL, "category" varchar(40) NOT NULL, "description" text, "sort_order" smallint NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_health_check_addons" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_health_check_addon_code" ON "health_check_addons" ("code")`);
    await queryRunner.query(`INSERT INTO "health_check_addons" (id, code, name, category, description, sort_order, is_active, created_at, updated_at) SELECT content.id, content.code, content.name, content.category, content.description, content.display_order, content.is_active, content.created_at, content.updated_at FROM "health_check_clinical_contents" content WHERE EXISTS (SELECT 1 FROM "health_check_package_addons" eligibility WHERE eligibility.clinical_content_id = content.id) OR EXISTS (SELECT 1 FROM "provider_service_addons" offering WHERE offering.clinical_content_id = content.id)`);

    await queryRunner.query(`ALTER TABLE "provider_service_addons" ADD "addon_id" uuid`);
    await queryRunner.query(`UPDATE "provider_service_addons" SET "addon_id" = "clinical_content_id"`);
    await queryRunner.query(`ALTER TABLE "provider_service_addons" ALTER COLUMN "addon_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "provider_service_addons" DROP CONSTRAINT "FK_provider_service_addons_content"`);
    await queryRunner.query(`DROP INDEX "UQ_provider_service_addon"`);
    await queryRunner.query(`ALTER TABLE "provider_service_addons" DROP COLUMN "clinical_content_id"`);
    await queryRunner.query(`ALTER TABLE "provider_service_addons" ADD CONSTRAINT "FK_provider_service_addons_addon" FOREIGN KEY ("addon_id") REFERENCES "health_check_addons"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_provider_service_addon" ON "provider_service_addons" ("provider_service_id", "addon_id")`);

    await queryRunner.query(`ALTER TABLE "health_check_package_addons" ADD "addon_id" uuid`);
    await queryRunner.query(`UPDATE "health_check_package_addons" SET "addon_id" = "clinical_content_id"`);
    await queryRunner.query(`ALTER TABLE "health_check_package_addons" ALTER COLUMN "addon_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "health_check_package_addons" DROP CONSTRAINT "FK_health_check_package_addons_content"`);
    await queryRunner.query(`DROP INDEX "UQ_health_check_package_addon"`);
    await queryRunner.query(`ALTER TABLE "health_check_package_addons" DROP COLUMN "clinical_content_id"`);
    await queryRunner.query(`ALTER TABLE "health_check_package_addons" ADD CONSTRAINT "FK_health_check_package_addons_addon" FOREIGN KEY ("addon_id") REFERENCES "health_check_addons"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_health_check_package_addon" ON "health_check_package_addons" ("health_check_package_id", "addon_id")`);

    await queryRunner.query(`ALTER TABLE "health_check_package_contents" ADD "code" varchar(80), ADD "name" varchar(160), ADD "category" varchar(40), ADD "description" text`);
    await queryRunner.query(`UPDATE "health_check_package_contents" composition SET "code" = content.code, "name" = content.name, "category" = content.category, "description" = content.description FROM "health_check_clinical_contents" content WHERE composition.clinical_content_id = content.id`);
    await queryRunner.query(`ALTER TABLE "health_check_package_contents" ALTER COLUMN "code" SET NOT NULL, ALTER COLUMN "name" SET NOT NULL, ALTER COLUMN "category" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "health_check_package_contents" DROP CONSTRAINT "FK_health_check_package_contents_content"`);
    await queryRunner.query(`DROP INDEX "UQ_health_check_package_content"`);
    await queryRunner.query(`ALTER TABLE "health_check_package_contents" DROP COLUMN "clinical_content_id"`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_health_check_package_content_code" ON "health_check_package_contents" ("health_check_package_id", "code")`);

    await queryRunner.query(`DROP TABLE "health_check_clinical_contents"`);
    await queryRunner.query(`DROP FUNCTION "prevent_health_check_clinical_content_code_change"`);
    await queryRunner.query(`DROP TYPE "health_check_clinical_result_type_enum"`);
  }
}
