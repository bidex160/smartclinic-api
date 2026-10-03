import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Facilities straight from the national Health Facility Registry: location, level of care,
 * licence status and registered contacts on each listing, a log of nightly sync runs, Google place
 * IDs for map links, and claim-by-code on the outreach record.
 */
export class FacilityRegistrySync1799078400000 implements MigrationInterface {
  name = 'FacilityRegistrySync1799078400000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "partner_facility_listings"
      ADD COLUMN "lga" varchar(120), ADD COLUMN "address" varchar(300),
      ADD COLUMN "latitude" double precision, ADD COLUMN "longitude" double precision,
      ADD COLUMN "level_of_care" varchar(60), ADD COLUMN "ownership" varchar(60), ADD COLUMN "registry_unique_id" varchar(80),
      ADD COLUMN "operational_status" varchar(60), ADD COLUMN "registration_status" varchar(60),
      ADD COLUMN "licence_status" varchar(60), ADD COLUMN "accreditation_status" varchar(60),
      ADD COLUMN "registry_verified" boolean NOT NULL DEFAULT false,
      ADD COLUMN "registry_phone" varchar(40), ADD COLUMN "registry_email" varchar(254), ADD COLUMN "registry_seen_at" timestamptz,
      ADD COLUMN "google_place_id" varchar(300), ADD COLUMN "google_checked_at" timestamptz,
      ADD CONSTRAINT "CHK_partner_facility_listings_lat" CHECK ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90),
      ADD CONSTRAINT "CHK_partner_facility_listings_lng" CHECK ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180)`);
    await q.query(`CREATE INDEX "IDX_partner_facility_listings_point" ON "partner_facility_listings" ("latitude", "longitude") WHERE "active" AND "latitude" IS NOT NULL`);
    await q.query(`CREATE INDEX "IDX_partner_facility_listings_name_lower" ON "partner_facility_listings" (LOWER("display_name"))`);
    await q.query(`CREATE INDEX "IDX_partner_facility_listings_registry_seen" ON "partner_facility_listings" ("source", "registry_seen_at") WHERE "provider_id" IS NULL`);

    await q.query(`CREATE TABLE "facility_registry_syncs" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(), "source" varchar(40) NOT NULL, "status" varchar(12) NOT NULL,
      "started_at" timestamptz NOT NULL, "finished_at" timestamptz, "counts" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "error" varchar(120), "triggered_by" varchar(20) NOT NULL DEFAULT 'SCHEDULE', "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_facility_registry_syncs" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_facility_registry_syncs_status" CHECK ("status" IN ('RUNNING','SUCCEEDED','FAILED')))`);
    await q.query(`CREATE INDEX "IDX_facility_registry_syncs_source_started" ON "facility_registry_syncs" ("source", "started_at")`);

    await q.query(`ALTER TABLE "facility_outreach"
      ADD COLUMN "claim_code_hash" varchar(64), ADD COLUMN "claim_code_expires_at" timestamptz,
      ADD COLUMN "claim_code_attempts" smallint NOT NULL DEFAULT 0, ADD COLUMN "claim_codes_sent" smallint NOT NULL DEFAULT 0,
      ADD COLUMN "claim_code_window_at" timestamptz, ADD COLUMN "claim_code_sent_at" timestamptz,
      ADD COLUMN "ownership_verified_at" timestamptz, ADD COLUMN "ownership_verified_via" varchar(12)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "facility_outreach"
      DROP COLUMN "ownership_verified_via", DROP COLUMN "ownership_verified_at", DROP COLUMN "claim_code_sent_at",
      DROP COLUMN "claim_code_window_at", DROP COLUMN "claim_codes_sent", DROP COLUMN "claim_code_attempts",
      DROP COLUMN "claim_code_expires_at", DROP COLUMN "claim_code_hash"`);
    await q.query(`DROP TABLE "facility_registry_syncs"`);
    await q.query(`DROP INDEX "IDX_partner_facility_listings_registry_seen"`);
    await q.query(`DROP INDEX "IDX_partner_facility_listings_name_lower"`);
    await q.query(`DROP INDEX "IDX_partner_facility_listings_point"`);
    await q.query(`ALTER TABLE "partner_facility_listings"
      DROP CONSTRAINT "CHK_partner_facility_listings_lng", DROP CONSTRAINT "CHK_partner_facility_listings_lat",
      DROP COLUMN "google_checked_at", DROP COLUMN "google_place_id", DROP COLUMN "registry_seen_at", DROP COLUMN "registry_email",
      DROP COLUMN "registry_phone", DROP COLUMN "registry_verified", DROP COLUMN "accreditation_status", DROP COLUMN "licence_status",
      DROP COLUMN "registration_status", DROP COLUMN "operational_status", DROP COLUMN "registry_unique_id", DROP COLUMN "ownership",
      DROP COLUMN "level_of_care", DROP COLUMN "longitude", DROP COLUMN "latitude", DROP COLUMN "address", DROP COLUMN "lga"`);
  }
}
