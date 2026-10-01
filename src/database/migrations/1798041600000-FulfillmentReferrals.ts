import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * A lab or pharmacy can pass a request it was chosen for to another one.
 * The new handoff remembers where it came from, so the referring provider
 * can follow it through to results.
 */
export class FulfillmentReferrals1798041600000 implements MigrationInterface {
  name = "FulfillmentReferrals1798041600000";
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "clinical_order_fulfillments" ADD "referred_from_fulfillment_id" uuid`);
    await q.query(`ALTER TABLE "clinical_order_fulfillments" ADD "referral_note" varchar(500)`);
    await q.query(`ALTER TABLE "clinical_order_fulfillments" ADD CONSTRAINT "FK_clinical_order_fulfillments_referred_from" FOREIGN KEY ("referred_from_fulfillment_id") REFERENCES "clinical_order_fulfillments"("id") ON DELETE RESTRICT`);
    await q.query(`ALTER TABLE "clinical_order_fulfillments" ADD CONSTRAINT "CHK_clinical_order_fulfillments_referral" CHECK ("referred_from_fulfillment_id" IS NULL OR "recommended_by_provider_id" IS NOT NULL)`);
    await q.query(`CREATE UNIQUE INDEX "UQ_clinical_order_fulfillments_referred_from" ON "clinical_order_fulfillments" ("referred_from_fulfillment_id") WHERE "referred_from_fulfillment_id" IS NOT NULL`);
    await q.query(`CREATE INDEX "IDX_clinical_order_fulfillments_referrals_by" ON "clinical_order_fulfillments" ("recommended_by_provider_id", "created_at") WHERE "referred_from_fulfillment_id" IS NOT NULL`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "IDX_clinical_order_fulfillments_referrals_by"`);
    await q.query(`DROP INDEX "UQ_clinical_order_fulfillments_referred_from"`);
    await q.query(`ALTER TABLE "clinical_order_fulfillments" DROP CONSTRAINT "CHK_clinical_order_fulfillments_referral"`);
    await q.query(`ALTER TABLE "clinical_order_fulfillments" DROP CONSTRAINT "FK_clinical_order_fulfillments_referred_from"`);
    await q.query(`ALTER TABLE "clinical_order_fulfillments" DROP COLUMN "referral_note"`);
    await q.query(`ALTER TABLE "clinical_order_fulfillments" DROP COLUMN "referred_from_fulfillment_id"`);
  }
}
