import { MigrationInterface, QueryRunner } from 'typeorm';

export class PartnerFacilityManualRequestsAndHmoPricing1797523200000 implements MigrationInterface {
  name = 'PartnerFacilityManualRequestsAndHmoPricing1797523200000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "partner_facility_requests" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "patient_id" uuid NOT NULL,
      "listing_id" uuid NOT NULL, "request_type" varchar(24) NOT NULL,
      "preferred_at" timestamptz, "consent_captured_at" timestamptz NOT NULL,
      "status" varchar(24) NOT NULL DEFAULT 'NEW', "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_partner_facility_requests" PRIMARY KEY ("id"),
      CONSTRAINT "FK_partner_facility_requests_patient" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_partner_facility_requests_listing" FOREIGN KEY ("listing_id") REFERENCES "partner_facility_listings"("id") ON DELETE RESTRICT,
      CONSTRAINT "CHK_partner_facility_requests_type" CHECK ("request_type" IN ('APPOINTMENT','REGISTRATION','CONTACT'))
    )`);
    await q.query(`CREATE INDEX "IDX_partner_facility_requests_status_created" ON "partner_facility_requests" ("status", "created_at")`);
    await q.query(`CREATE INDEX "IDX_partner_facility_requests_listing_created" ON "partner_facility_requests" ("listing_id", "created_at")`);
    await q.query(`ALTER TABLE "hmo_plans" ADD COLUMN "amount_minor" bigint, ADD COLUMN "currency" char(3) NOT NULL DEFAULT 'NGN', ADD COLUMN "billing_period" varchar(20) NOT NULL DEFAULT 'MONTHLY'`);
    await q.query(`ALTER TABLE "hmo_enrollment_leads" ADD COLUMN "plan_id" uuid, ADD COLUMN "quoted_amount_minor" bigint, ADD COLUMN "quoted_currency" char(3), ADD COLUMN "consent_captured_at" timestamptz, ADD CONSTRAINT "FK_hmo_lead_plan" FOREIGN KEY ("plan_id") REFERENCES "hmo_plans"("id") ON DELETE RESTRICT`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "hmo_enrollment_leads" DROP CONSTRAINT "FK_hmo_lead_plan", DROP COLUMN "consent_captured_at", DROP COLUMN "quoted_currency", DROP COLUMN "quoted_amount_minor", DROP COLUMN "plan_id"`);
    await q.query(`ALTER TABLE "hmo_plans" DROP COLUMN "billing_period", DROP COLUMN "currency", DROP COLUMN "amount_minor"`);
    await q.query(`DROP INDEX "IDX_partner_facility_requests_listing_created"`);
    await q.query(`DROP INDEX "IDX_partner_facility_requests_status_created"`);
    await q.query(`DROP TABLE "partner_facility_requests"`);
  }
}
