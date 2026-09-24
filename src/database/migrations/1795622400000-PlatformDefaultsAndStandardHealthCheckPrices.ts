import { MigrationInterface, QueryRunner } from 'typeorm';

export class PlatformDefaultsAndStandardHealthCheckPrices1795622400000 implements MigrationInterface {
  name = 'PlatformDefaultsAndStandardHealthCheckPrices1795622400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "providers"
      ADD "is_platform_default" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "providers"
      ADD "platform_default_priority" smallint
    `);
    await queryRunner.query(`
      ALTER TABLE "providers"
      ADD CONSTRAINT "CHK_providers_platform_default_priority"
      CHECK ("platform_default_priority" IS NULL OR "platform_default_priority" >= 0)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_providers_platform_default"
      ON "providers" ("is_platform_default", "platform_default_priority")
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      INSERT INTO "package_prices"
        ("health_check_package_id","fulfilment_mode_id","amount","currency","effective_from","effective_to","is_active")
      SELECT p.id, m.id, v.amount, 'NGN', DATE '2026-01-01', NULL, true
      FROM (VALUES
        ('BASIC', 5000.00::numeric),
        ('ESSENTIAL', 8000.00::numeric),
        ('COMPLETE', 16000.00::numeric)
      ) AS v(package_code, amount)
      JOIN "health_check_packages" p ON p.code = v.package_code AND p.is_active = true
      JOIN "fulfilment_modes" m ON m.code IN ('PROVIDER_LOCATION','HOME_VISIT') AND m.is_active = true
      WHERE NOT EXISTS (
        SELECT 1
        FROM "package_prices" existing
        WHERE existing.health_check_package_id = p.id
          AND existing.fulfilment_mode_id = m.id
          AND existing.currency = 'NGN'
          AND existing.is_active = true
          AND existing.effective_from <= CURRENT_DATE
          AND (existing.effective_to IS NULL OR CURRENT_DATE < existing.effective_to)
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "public"."IDX_providers_platform_default"');
    await queryRunner.query('ALTER TABLE "providers" DROP CONSTRAINT "CHK_providers_platform_default_priority"');
    await queryRunner.query('ALTER TABLE "providers" DROP COLUMN "platform_default_priority"');
    await queryRunner.query('ALTER TABLE "providers" DROP COLUMN "is_platform_default"');
  }
}
