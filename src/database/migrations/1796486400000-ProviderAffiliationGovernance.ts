import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProviderAffiliationGovernance1796486400000 implements MigrationInterface {
  name = 'ProviderAffiliationGovernance1796486400000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      DO $$ BEGIN
        CREATE TYPE "provider_practice_affiliation_status_enum" AS ENUM ('PENDING','APPROVED','REJECTED');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await q.query(`
      ALTER TABLE "provider_practice_affiliations"
      ADD COLUMN IF NOT EXISTS "status" "provider_practice_affiliation_status_enum" NOT NULL DEFAULT 'PENDING'
    `);
    await q.query(`
      ALTER TABLE "provider_practice_affiliations"
      ADD COLUMN IF NOT EXISTS "reviewed_at" timestamptz
    `);
    await q.query(`
      ALTER TABLE "provider_practice_affiliations"
      ADD COLUMN IF NOT EXISTS "reviewed_by_user_id" uuid
    `);

    await q.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_provider_practice_affiliations_reviewer'
        ) THEN
          ALTER TABLE "provider_practice_affiliations"
          ADD CONSTRAINT "FK_provider_practice_affiliations_reviewer"
          FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    /*
     * Some staging databases already contain this composite unique index.
     * It is required only so PostgreSQL can validate the composite FK below,
     * therefore reuse it when present instead of failing the migration.
     */
    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_provider_locations_id_provider"
      ON "provider_locations" ("id","provider_id")
    `);

    await q.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_provider_practice_affiliations_host_location_owner'
        ) THEN
          ALTER TABLE "provider_practice_affiliations"
          ADD CONSTRAINT "FK_provider_practice_affiliations_host_location_owner"
          FOREIGN KEY ("host_location_id","host_provider_id")
          REFERENCES "provider_locations"("id","provider_id")
          ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await q.query(`
      UPDATE "provider_practice_affiliations"
      SET "status"='APPROVED',
          "reviewed_at"=COALESCE("reviewed_at", now())
      WHERE "is_active"=true
        AND "status"='PENDING'
    `);

    // Virtual-care columns are introduced by the later InstitutionalVirtualCare migration.
    // Governance must not reference them before they exist.
    await q.query(`
      CREATE INDEX IF NOT EXISTS "IDX_provider_practice_affiliations_host_status"
      ON "provider_practice_affiliations"
      ("host_provider_id","status","is_active")
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "public"."IDX_provider_practice_affiliations_host_status"`);
    await q.query(`
      ALTER TABLE "provider_practice_affiliations"
      DROP CONSTRAINT IF EXISTS "FK_provider_practice_affiliations_host_location_owner"
    `);

    /*
     * Intentionally keep UQ_provider_locations_id_provider on rollback.
     * It may pre-date this migration in some environments and is harmless.
     */

    await q.query(`
      ALTER TABLE "provider_practice_affiliations"
      DROP CONSTRAINT IF EXISTS "FK_provider_practice_affiliations_reviewer"
    `);
    await q.query(`
      ALTER TABLE "provider_practice_affiliations"
      DROP COLUMN IF EXISTS "reviewed_by_user_id"
    `);
    await q.query(`
      ALTER TABLE "provider_practice_affiliations"
      DROP COLUMN IF EXISTS "reviewed_at"
    `);
    await q.query(`
      ALTER TABLE "provider_practice_affiliations"
      DROP COLUMN IF EXISTS "status"
    `);
    await q.query(`DROP TYPE IF EXISTS "provider_practice_affiliation_status_enum"`);
  }
}
