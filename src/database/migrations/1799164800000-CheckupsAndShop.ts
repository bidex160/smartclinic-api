import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Know your numbers" check-ups (home and pharmacy readings, the plan, free-check vouchers and
 * gifts for parents, partner pharmacies) and the health shop (products, pharmacy suppliers,
 * wallet-paid orders, the free readings review). Suggested products are added switched off:
 * staff confirm prices and supply costs, then switch them on.
 */
export class CheckupsAndShop1799164800000 implements MigrationInterface {
  name = 'CheckupsAndShop1799164800000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "provider_earning_source_type_enum" ADD VALUE IF NOT EXISTS 'FREE_CHECK'`);
    await q.query(`ALTER TYPE "provider_earning_source_type_enum" ADD VALUE IF NOT EXISTS 'SHOP_ORDER'`);
    await q.query(`ALTER TYPE "patient_wallet_entry_type_enum" ADD VALUE IF NOT EXISTS 'SHOP_PURCHASE'`);

    await q.query(`CREATE TABLE "vital_readings" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(), "patient_id" uuid, "voucher_id" uuid, "source" varchar(12) NOT NULL,
      "provider_id" uuid, "entered_by_user_id" uuid, "systolic" smallint, "diastolic" smallint, "bp_readings" jsonb, "pulse" smallint,
      "glucose_mmol" numeric(4,1), "glucose_context" varchar(12), "weight_kg" numeric(5,1), "height_cm" numeric(4,1),
      "band" varchar(12) NOT NULL, "measured_at" timestamptz NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_vital_readings" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_vital_readings_owner" CHECK ("patient_id" IS NOT NULL OR "voucher_id" IS NOT NULL),
      CONSTRAINT "CHK_vital_readings_source" CHECK ("source" IN ('HOME','PHARMACY','HOME_VISIT')),
      CONSTRAINT "FK_vital_readings_patient" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_vital_readings_provider" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE SET NULL)`);
    await q.query(`CREATE INDEX "IDX_vital_readings_patient_measured" ON "vital_readings" ("patient_id", "measured_at")`);
    await q.query(`CREATE INDEX "IDX_vital_readings_voucher" ON "vital_readings" ("voucher_id") WHERE "voucher_id" IS NOT NULL`);

    await q.query(`CREATE TABLE "checkup_plans" (
      "patient_id" uuid NOT NULL, "band" varchar(12) NOT NULL DEFAULT 'UNKNOWN', "next_step" varchar(14) NOT NULL DEFAULT 'KNOW_NUMBERS',
      "next_due_at" timestamptz, "numbers_done_at" timestamptz, "confirmed_at" timestamptz, "last_reading_id" uuid,
      "reminded_for" timestamptz, "reminder_count" smallint NOT NULL DEFAULT 0, "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_checkup_plans" PRIMARY KEY ("patient_id"),
      CONSTRAINT "FK_checkup_plans_patient" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE)`);
    await q.query(`CREATE INDEX "IDX_checkup_plans_due" ON "checkup_plans" ("next_due_at")`);

    await q.query(`CREATE TABLE "checkup_vouchers" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(), "code" varchar(12) NOT NULL, "status" varchar(10) NOT NULL,
      "recipient_patient_id" uuid, "recipient_name" varchar(120) NOT NULL, "recipient_phone" varchar(20), "relationship" varchar(16),
      "gifted_by_user_id" uuid, "country_code" char(2) NOT NULL, "expires_at" timestamptz NOT NULL, "redeemed_at" timestamptz,
      "redeemed_by_provider_id" uuid, "provider_fee_minor" integer NOT NULL DEFAULT 0, "share_with_gifter" boolean NOT NULL DEFAULT false,
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_checkup_vouchers" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_checkup_vouchers_status" CHECK ("status" IN ('ISSUED','REDEEMED','EXPIRED','CANCELLED')),
      CONSTRAINT "FK_checkup_vouchers_patient" FOREIGN KEY ("recipient_patient_id") REFERENCES "patients"("id") ON DELETE SET NULL,
      CONSTRAINT "FK_checkup_vouchers_gifter" FOREIGN KEY ("gifted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
      CONSTRAINT "FK_checkup_vouchers_provider" FOREIGN KEY ("redeemed_by_provider_id") REFERENCES "providers"("id") ON DELETE SET NULL)`);
    await q.query(`CREATE UNIQUE INDEX "UQ_checkup_vouchers_code" ON "checkup_vouchers" ("code")`);
    await q.query(`CREATE INDEX "IDX_checkup_vouchers_gifter" ON "checkup_vouchers" ("gifted_by_user_id", "created_at")`);
    await q.query(`CREATE INDEX "IDX_checkup_vouchers_phone" ON "checkup_vouchers" ("recipient_phone")`);
    await q.query(`CREATE INDEX "IDX_checkup_vouchers_provider" ON "checkup_vouchers" ("redeemed_by_provider_id", "redeemed_at")`);
    await q.query(`ALTER TABLE "vital_readings" ADD CONSTRAINT "FK_vital_readings_voucher" FOREIGN KEY ("voucher_id") REFERENCES "checkup_vouchers"("id") ON DELETE CASCADE`);

    await q.query(`CREATE TABLE "free_check_partners" (
      "provider_id" uuid NOT NULL, "active" boolean NOT NULL DEFAULT true, "weekly_capacity" integer NOT NULL DEFAULT 0,
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_free_check_partners" PRIMARY KEY ("provider_id"),
      CONSTRAINT "FK_free_check_partners_provider" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE)`);

    await q.query(`CREATE TABLE "shop_products" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(), "sku" varchar(40) NOT NULL, "name" varchar(140) NOT NULL, "brand" varchar(60),
      "category" varchar(16) NOT NULL, "description" varchar(1000) NOT NULL, "highlights" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "image_url" varchar(500), "validation_note" varchar(160), "currency" char(3) NOT NULL DEFAULT 'NGN', "price_minor" integer NOT NULL,
      "supply_cost_minor" integer NOT NULL, "referral_bps" smallint NOT NULL DEFAULT 500, "includes_review" boolean NOT NULL DEFAULT false,
      "store_stock" integer NOT NULL DEFAULT 0, "active" boolean NOT NULL DEFAULT false, "sort_order" smallint NOT NULL DEFAULT 0,
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_shop_products" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_shop_products_money" CHECK ("price_minor" > 0 AND "supply_cost_minor" >= 0 AND "referral_bps" BETWEEN 0 AND 3000 AND "store_stock" >= 0
        AND "price_minor"::bigint - "supply_cost_minor" - ("price_minor"::bigint * "referral_bps" / 10000) >= 0))`);
    await q.query(`CREATE UNIQUE INDEX "UQ_shop_products_sku" ON "shop_products" ("sku")`);

    await q.query(`CREATE TABLE "shop_supplier_offers" (
      "provider_id" uuid NOT NULL, "product_id" uuid NOT NULL, "active" boolean NOT NULL DEFAULT true, "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_shop_supplier_offers" PRIMARY KEY ("provider_id", "product_id"),
      CONSTRAINT "FK_shop_supplier_offers_provider" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_shop_supplier_offers_product" FOREIGN KEY ("product_id") REFERENCES "shop_products"("id") ON DELETE CASCADE)`);
    await q.query(`CREATE INDEX "IDX_shop_supplier_offers_product" ON "shop_supplier_offers" ("product_id") WHERE "active"`);

    await q.query(`CREATE TABLE "shop_orders" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(), "reference" varchar(20) NOT NULL, "user_id" uuid NOT NULL, "patient_id" uuid,
      "status" varchar(20) NOT NULL, "fulfilment" varchar(10), "provider_id" uuid, "assigned_at" timestamptz, "accept_by" timestamptz,
      "passed_provider_ids" jsonb NOT NULL DEFAULT '[]'::jsonb, "lines" jsonb NOT NULL, "currency" char(3) NOT NULL,
      "subtotal_minor" integer NOT NULL, "delivery_fee_minor" integer NOT NULL, "total_minor" integer NOT NULL,
      "supplier_share_minor" integer NOT NULL, "referral_share_minor" integer NOT NULL DEFAULT 0, "referrer_user_id" uuid,
      "delivery" jsonb NOT NULL, "delivery_code" varchar(4) NOT NULL, "wallet_entry_id" uuid, "includes_review" boolean NOT NULL DEFAULT false,
      "delivered_at" timestamptz, "cancelled_at" timestamptz, "cancel_reason" varchar(300),
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_shop_orders" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_shop_orders_status" CHECK ("status" IN ('AWAITING_SUPPLIER','ASSIGNED','ACCEPTED','OUT_FOR_DELIVERY','DELIVERED','CANCELLED')),
      CONSTRAINT "CHK_shop_orders_money" CHECK ("total_minor" = "subtotal_minor" + "delivery_fee_minor" AND "supplier_share_minor" + "referral_share_minor" <= "total_minor"),
      CONSTRAINT "FK_shop_orders_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_shop_orders_provider" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE SET NULL,
      CONSTRAINT "FK_shop_orders_referrer" FOREIGN KEY ("referrer_user_id") REFERENCES "users"("id") ON DELETE SET NULL)`);
    await q.query(`CREATE UNIQUE INDEX "UQ_shop_orders_reference" ON "shop_orders" ("reference")`);
    await q.query(`CREATE INDEX "IDX_shop_orders_user_created" ON "shop_orders" ("user_id", "created_at")`);
    await q.query(`CREATE INDEX "IDX_shop_orders_provider_status" ON "shop_orders" ("provider_id", "status")`);
    await q.query(`CREATE INDEX "IDX_shop_orders_open" ON "shop_orders" ("status", "accept_by") WHERE "status" IN ('AWAITING_SUPPLIER','ASSIGNED')`);

    await q.query(`CREATE TABLE "shop_order_events" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(), "order_id" uuid NOT NULL, "kind" varchar(30) NOT NULL, "note" varchar(300),
      "actor_user_id" uuid, "provider_id" uuid, "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_shop_order_events" PRIMARY KEY ("id"),
      CONSTRAINT "FK_shop_order_events_order" FOREIGN KEY ("order_id") REFERENCES "shop_orders"("id") ON DELETE CASCADE)`);
    await q.query(`CREATE INDEX "IDX_shop_order_events_order" ON "shop_order_events" ("order_id", "created_at")`);

    await q.query(`CREATE TABLE "checkup_review_requests" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(), "patient_id" uuid NOT NULL, "order_id" uuid, "status" varchar(12) NOT NULL,
      "patient_note" varchar(500), "answer" varchar(2000), "answered_by_user_id" uuid, "answered_at" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_checkup_review_requests" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_checkup_review_requests_status" CHECK ("status" IN ('REQUESTED','ANSWERED')),
      CONSTRAINT "FK_checkup_review_requests_patient" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_checkup_review_requests_order" FOREIGN KEY ("order_id") REFERENCES "shop_orders"("id") ON DELETE SET NULL)`);
    await q.query(`CREATE INDEX "IDX_checkup_review_requests_status" ON "checkup_review_requests" ("status", "created_at")`);

    // Suggested starting range (switched off). Prices from Nigerian retail in 2026; staff set the real supply costs.
    await q.query(`INSERT INTO "shop_products" ("sku","name","brand","category","description","highlights","validation_note","price_minor","supply_cost_minor","referral_bps","includes_review","sort_order") VALUES
      ('HEART-KIT','Home Heart Kit',NULL,'BP_MONITOR','An upper-arm blood pressure monitor, delivered to your door, plus a free review of your first week of readings by a SmartClinic clinician.','["Upper-arm cuff (the accurate kind)","Free clinician review of your first week","Readings go straight into your check-up plan","Delivered by a pharmacy near you"]','Clinically validated upper-arm monitor (STRIDE BP list)',3500000,2500000,500,true,1),
      ('BP-BASIC','Blood pressure monitor',NULL,'BP_MONITOR','A simple, accurate upper-arm blood pressure monitor for home.','["Upper-arm cuff","One button","Batteries included"]','Clinically validated upper-arm monitor (STRIDE BP list)',3200000,2500000,500,false,2),
      ('BP-SMART','Bluetooth blood pressure monitor',NULL,'BP_MONITOR','An upper-arm monitor that remembers your readings and connects to your phone.','["Upper-arm cuff","Stores readings","Bluetooth"]','Clinically validated upper-arm monitor (STRIDE BP list)',5200000,4200000,500,false,3),
      ('GLUCO-KIT','Blood sugar starter kit',NULL,'GLUCOMETER','A glucose meter with 50 test strips and lancets.','["Meter, 50 strips and lancets","Results in seconds","mmol/L or mg/dL"]',NULL,3800000,3000000,500,false,4),
      ('STRIPS-50','Glucose test strips (50)',NULL,'TEST_STRIPS','Refill strips for your glucose meter. Check they match your meter.','["50 strips"]',NULL,2600000,2150000,500,false,5)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    // Enum values added above are left in place (Postgres can't drop them); nothing uses them once the tables are gone.
    await q.query(`DROP TABLE "checkup_review_requests"`);
    await q.query(`DROP TABLE "shop_order_events"`);
    await q.query(`DROP TABLE "shop_orders"`);
    await q.query(`DROP TABLE "shop_supplier_offers"`);
    await q.query(`DROP TABLE "shop_products"`);
    await q.query(`DROP TABLE "free_check_partners"`);
    await q.query(`ALTER TABLE "vital_readings" DROP CONSTRAINT "FK_vital_readings_voucher"`);
    await q.query(`DROP TABLE "checkup_vouchers"`);
    await q.query(`DROP TABLE "checkup_plans"`);
    await q.query(`DROP TABLE "vital_readings"`);
  }
}
