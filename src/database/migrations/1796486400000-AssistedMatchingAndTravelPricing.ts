import { MigrationInterface, QueryRunner } from 'typeorm';

export class AssistedMatchingAndTravelPricing1796486400000 implements MigrationInterface {
  name='AssistedMatchingAndTravelPricing1796486400000';
  async up(q:QueryRunner):Promise<void>{
    await q.query(`ALTER TABLE "provider_service_areas" ADD "travel_fee_minor" bigint NOT NULL DEFAULT 0`);
    await q.query(`ALTER TABLE "provider_service_areas" ADD "priority" integer NOT NULL DEFAULT 100`);
    await q.query(`ALTER TABLE "provider_service_areas" ADD "origin_latitude" decimal(9,6)`);
    await q.query(`ALTER TABLE "provider_service_areas" ADD "origin_longitude" decimal(9,6)`);
    await q.query(`ALTER TABLE "provider_service_areas" ADD "max_radius_km" decimal(8,2)`);
    await q.query(`ALTER TABLE "provider_service_areas" ADD CONSTRAINT "CHK_provider_service_area_travel_fee" CHECK ("travel_fee_minor" >= 0)`);
    await q.query(`CREATE TYPE "assisted_match_status_enum" AS ENUM ('SEARCHING','AGENT_REVIEW','MATCHED','CANCELLED','EXPIRED')`);
    await q.query(`CREATE TYPE "assisted_match_contact_enum" AS ENUM ('NOTIFY','CALL','WHATSAPP')`);
    await q.query(`CREATE TABLE "assisted_match_requests" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "reference" varchar(32) NOT NULL,
      "user_id" uuid NOT NULL,
      "patient_id" uuid,
      "service_kind" varchar(40) NOT NULL,
      "package_code" varchar(80),
      "fulfilment_mode_code" varchar(80),
      "preferred_date" date,
      "preferred_time" time,
      "preferred_timezone" varchar(80),
      "country_code" char(2),
      "state_or_region" varchar(120),
      "city" varchar(120),
      "postal_code" varchar(30),
      "contact_preference" "assisted_match_contact_enum" NOT NULL DEFAULT 'NOTIFY',
      "status" "assisted_match_status_enum" NOT NULL DEFAULT 'SEARCHING',
      "search_expands_at" timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
      "agent_review_at" timestamptz NOT NULL DEFAULT (now() + interval '20 minutes'),
      "matched_provider_id" uuid,
      "matched_provider_service_id" uuid,
      "quoted_travel_fee_minor" bigint,
      "matched_at" timestamptz,
      "notes" text,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_assisted_match_reference" UNIQUE ("reference"),
      CONSTRAINT "PK_assisted_match_requests" PRIMARY KEY ("id"),
      CONSTRAINT "FK_assisted_match_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_assisted_match_patient" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL,
      CONSTRAINT "FK_assisted_match_provider" FOREIGN KEY ("matched_provider_id") REFERENCES "providers"("id") ON DELETE SET NULL,
      CONSTRAINT "FK_assisted_match_service" FOREIGN KEY ("matched_provider_service_id") REFERENCES "provider_services"("id") ON DELETE SET NULL
    )`);
    await q.query(`CREATE INDEX "IDX_assisted_match_queue" ON "assisted_match_requests" ("status","agent_review_at","created_at")`);
    await q.query(`CREATE INDEX "IDX_assisted_match_user" ON "assisted_match_requests" ("user_id","created_at")`);
  }
  async down(q:QueryRunner):Promise<void>{
    await q.query(`DROP TABLE "assisted_match_requests"`);
    await q.query(`DROP TYPE "assisted_match_contact_enum"`);
    await q.query(`DROP TYPE "assisted_match_status_enum"`);
    await q.query(`ALTER TABLE "provider_service_areas" DROP CONSTRAINT "CHK_provider_service_area_travel_fee"`);
    await q.query(`ALTER TABLE "provider_service_areas" DROP COLUMN "max_radius_km"`);
    await q.query(`ALTER TABLE "provider_service_areas" DROP COLUMN "origin_longitude"`);
    await q.query(`ALTER TABLE "provider_service_areas" DROP COLUMN "origin_latitude"`);
    await q.query(`ALTER TABLE "provider_service_areas" DROP COLUMN "priority"`);
    await q.query(`ALTER TABLE "provider_service_areas" DROP COLUMN "travel_fee_minor"`);
  }
}