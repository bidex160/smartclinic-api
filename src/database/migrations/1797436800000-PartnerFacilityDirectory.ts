import { MigrationInterface, QueryRunner } from 'typeorm';

export class PartnerFacilityDirectory1797436800000 implements MigrationInterface {
  name = 'PartnerFacilityDirectory1797436800000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE "partner_facility_type_enum" AS ENUM ('HOSPITAL','PHARMACY','LABORATORY','RADIOLOGY')`);
    await q.query(`CREATE TYPE "partner_facility_readiness_enum" AS ENUM ('AVAILABLE_TO_JOIN','JOINED','FULLY_JOINED')`);
    await q.query(`CREATE TABLE "partner_facility_listings" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "source" varchar(40) NOT NULL,
      "source_reference" varchar(100) NOT NULL, "display_name" varchar(240) NOT NULL,
      "facility_type" "partner_facility_type_enum" NOT NULL, "country_code" char(2) NOT NULL,
      "state_or_region" varchar(120), "city" varchar(120),
      "readiness" "partner_facility_readiness_enum" NOT NULL DEFAULT 'AVAILABLE_TO_JOIN',
      "provider_id" uuid, "source_verified_at" timestamptz, "active" boolean NOT NULL DEFAULT true,
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_partner_facility_listings" PRIMARY KEY ("id"),
      CONSTRAINT "FK_partner_facility_listings_provider" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT
    )`);
    await q.query(`CREATE UNIQUE INDEX "UQ_partner_facility_listings_source_ref" ON "partner_facility_listings"("source","source_reference")`);
    await q.query(`CREATE INDEX "IDX_partner_facility_listings_type_location" ON "partner_facility_listings"("facility_type","country_code","state_or_region","city")`);
    await q.query(`CREATE TABLE "partner_facility_interests" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "patient_id" uuid NOT NULL,
      "listing_id" uuid NOT NULL, "consent_captured_at" timestamptz NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_partner_facility_interests" PRIMARY KEY ("id"),
      CONSTRAINT "FK_partner_facility_interests_patient" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_partner_facility_interests_listing" FOREIGN KEY ("listing_id") REFERENCES "partner_facility_listings"("id") ON DELETE RESTRICT
    )`);
    await q.query(`CREATE UNIQUE INDEX "UQ_partner_facility_interests_patient_listing" ON "partner_facility_interests"("patient_id","listing_id")`);
    await q.query(`CREATE INDEX "IDX_partner_facility_interests_listing_created" ON "partner_facility_interests"("listing_id","created_at")`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "IDX_partner_facility_interests_listing_created"`);
    await q.query(`DROP INDEX "UQ_partner_facility_interests_patient_listing"`);
    await q.query(`DROP TABLE "partner_facility_interests"`);
    await q.query(`DROP INDEX "IDX_partner_facility_listings_type_location"`);
    await q.query(`DROP INDEX "UQ_partner_facility_listings_source_ref"`);
    await q.query(`DROP TABLE "partner_facility_listings"`);
    await q.query(`DROP TYPE "partner_facility_readiness_enum"`);
    await q.query(`DROP TYPE "partner_facility_type_enum"`);
  }
}
