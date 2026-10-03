import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bringing listed facilities on board: contacts, claim links, invites, reminders and a call log.
 * Also gives Abuja one spelling ("Federal Capital Territory") everywhere, so dashboards add up.
 */
export class FacilityOutreach1798992000000 implements MigrationInterface {
  name = 'FacilityOutreach1798992000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "facility_outreach" (
      "listing_id" uuid NOT NULL, "phone" varchar(32), "whatsapp" varchar(32), "email" varchar(254), "website" varchar(300),
      "address" varchar(300), "contact_name" varchar(160), "status" varchar(20) NOT NULL DEFAULT 'LISTED',
      "claim_token_hash" varchar(64), "claim_token_created_at" timestamptz, "claimed_at" timestamptz,
      "invites_sent" integer NOT NULL DEFAULT 0, "last_contact_at" timestamptz, "reminder_stage" smallint NOT NULL DEFAULT 0,
      "next_reminder_at" timestamptz, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_facility_outreach" PRIMARY KEY ("listing_id"),
      CONSTRAINT "UQ_facility_outreach_claim_token" UNIQUE ("claim_token_hash"),
      CONSTRAINT "CHK_facility_outreach_status" CHECK ("status" IN ('LISTED','INVITED','CONTACTED','CLAIMED','DECLINED','WRONG_CONTACT')),
      CONSTRAINT "FK_facility_outreach_listing" FOREIGN KEY ("listing_id") REFERENCES "partner_facility_listings"("id") ON DELETE CASCADE)`);
    await q.query(`CREATE INDEX "IDX_facility_outreach_reminders_due" ON "facility_outreach" ("next_reminder_at") WHERE "status" = 'INVITED' AND "claimed_at" IS NULL`);
    await q.query(`CREATE TABLE "facility_outreach_events" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(), "listing_id" uuid NOT NULL, "kind" varchar(24) NOT NULL, "note" varchar(500),
      "by_user_id" uuid, "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_facility_outreach_events" PRIMARY KEY ("id"),
      CONSTRAINT "FK_facility_outreach_events_listing" FOREIGN KEY ("listing_id") REFERENCES "partner_facility_listings"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_facility_outreach_events_user" FOREIGN KEY ("by_user_id") REFERENCES "users"("id") ON DELETE SET NULL)`);
    await q.query(`CREATE INDEX "IDX_facility_outreach_events_listing_created" ON "facility_outreach_events" ("listing_id", "created_at")`);

    const fct = `('fct','f.c.t','f.c.t.','abuja','fct abuja','abuja fct','abuja federal capital territory','federal capital territory abuja')`;
    await q.query(`UPDATE "providers" SET "state_or_region" = 'Federal Capital Territory' WHERE "country_code" = 'NG' AND LOWER(TRIM("state_or_region")) IN ${fct}`);
    await q.query(`UPDATE "partner_facility_listings" SET "state_or_region" = 'Federal Capital Territory' WHERE "country_code" = 'NG' AND LOWER(TRIM("state_or_region")) IN ${fct}`);
    await q.query(`UPDATE "provider_locations" SET "state" = 'Federal Capital Territory' WHERE "country_code" = 'NG' AND LOWER(TRIM("state")) IN ${fct}`);
  }

  public async down(q: QueryRunner): Promise<void> {
    // The spelling clean-up is kept: it can't be undone row by row, and every spelling meant the same place.
    await q.query(`DROP TABLE "facility_outreach_events"`);
    await q.query(`DROP TABLE "facility_outreach"`);
  }
}
