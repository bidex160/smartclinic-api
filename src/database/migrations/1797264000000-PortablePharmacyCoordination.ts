import { MigrationInterface, QueryRunner } from "typeorm";

export class PortablePharmacyCoordination1797264000000 implements MigrationInterface {
  name = "PortablePharmacyCoordination1797264000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TYPE "pharmacy_fulfillment_method_enum" ADD VALUE IF NOT EXISTS 'HOSPITAL_DELIVERY'`,
    );
    await q.query(
      `ALTER TYPE "pharmacy_fulfillment_method_enum" ADD VALUE IF NOT EXISTS 'HOME_DELIVERY'`,
    );
    await q.query(
      `ALTER TABLE "pharmacy_quotes" ADD "fulfillment_options_snapshot" jsonb NOT NULL DEFAULT '[{"method":"PICKUP","feeMinor":0}]'::jsonb`,
    );
    await q.query(
      `ALTER TABLE "pharmacy_fulfillment_fundings" DROP CONSTRAINT "CHK_pharmacy_funding_money"`,
    );
    await q.query(
      `ALTER TABLE "pharmacy_fulfillment_fundings" ADD "medicine_amount_minor" bigint`,
    );
    await q.query(
      `ALTER TABLE "pharmacy_fulfillment_fundings" ADD "delivery_fee_minor" bigint NOT NULL DEFAULT 0`,
    );
    await q.query(
      `ALTER TABLE "pharmacy_fulfillment_fundings" ADD "doctor_coordination_bps" smallint NOT NULL DEFAULT 0`,
    );
    await q.query(
      `ALTER TABLE "pharmacy_fulfillment_fundings" ADD "doctor_coordination_amount_minor" bigint NOT NULL DEFAULT 0`,
    );
    await q.query(
      `ALTER TABLE "pharmacy_fulfillment_fundings" ADD "doctor_beneficiary_user_id" uuid`,
    );
    await q.query(
      `ALTER TABLE "pharmacy_fulfillment_fundings" ADD "hospital_coordination_bps" smallint NOT NULL DEFAULT 0`,
    );
    await q.query(
      `ALTER TABLE "pharmacy_fulfillment_fundings" ADD "hospital_coordination_amount_minor" bigint NOT NULL DEFAULT 0`,
    );
    await q.query(
      `ALTER TABLE "pharmacy_fulfillment_fundings" ADD "hospital_beneficiary_provider_id" uuid`,
    );
    await q.query(
      `ALTER TABLE "pharmacy_fulfillment_fundings" ADD "fulfillment_method" "pharmacy_fulfillment_method_enum" NOT NULL DEFAULT 'PICKUP'`,
    );
    await q.query(
      `ALTER TABLE "pharmacy_fulfillment_fundings" ADD "delivery_address_snapshot" jsonb`,
    );
    await q.query(
      `UPDATE "pharmacy_fulfillment_fundings" funding SET "medicine_amount_minor" = funding."gross_amount_minor", "doctor_beneficiary_user_id" = orders."ordering_user_id" FROM "clinical_order_fulfillments" fulfillment INNER JOIN "clinical_orders" orders ON orders."id" = fulfillment."clinical_order_id" WHERE funding."fulfillment_id" = fulfillment."id"`,
    );
    await q.query(
      `ALTER TABLE "pharmacy_fulfillment_fundings" ALTER COLUMN "medicine_amount_minor" SET NOT NULL`,
    );
    await q.query(
      `ALTER TABLE "pharmacy_fulfillment_fundings" ALTER COLUMN "doctor_beneficiary_user_id" SET NOT NULL`,
    );
    await q.query(
      `ALTER TABLE "pharmacy_fulfillment_fundings" ADD CONSTRAINT "FK_pharmacy_funding_doctor_beneficiary" FOREIGN KEY ("doctor_beneficiary_user_id") REFERENCES "users"("id") ON DELETE RESTRICT`,
    );
    await q.query(
      `ALTER TABLE "pharmacy_fulfillment_fundings" ADD CONSTRAINT "FK_pharmacy_funding_hospital_beneficiary" FOREIGN KEY ("hospital_beneficiary_provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT`,
    );
    await q.query(
      `ALTER TABLE "pharmacy_fulfillment_fundings" ADD CONSTRAINT "CHK_pharmacy_funding_money" CHECK ("medicine_amount_minor" >= 0 AND "delivery_fee_minor" >= 0 AND "gross_amount_minor" = "medicine_amount_minor" + "delivery_fee_minor" + "doctor_coordination_amount_minor" + "hospital_coordination_amount_minor" AND "commission_amount_minor" >= 0 AND "provider_share_minor" >= 0 AND "commission_amount_minor" + "provider_share_minor" = "medicine_amount_minor" + "delivery_fee_minor")`,
    );
    await q.query(
      `ALTER TABLE "pharmacy_fulfillment_fundings" ADD CONSTRAINT "CHK_pharmacy_funding_coordination" CHECK ("doctor_coordination_bps" BETWEEN 0 AND 10000 AND "hospital_coordination_bps" BETWEEN 0 AND 10000 AND "doctor_coordination_amount_minor" >= 0 AND "hospital_coordination_amount_minor" >= 0 AND (("hospital_coordination_amount_minor" = 0 AND "hospital_beneficiary_provider_id" IS NULL) OR ("hospital_coordination_amount_minor" > 0 AND "hospital_beneficiary_provider_id" IS NOT NULL)))`,
    );
    await q.query(
      `CREATE TYPE "pharmacy_coordination_allocation_type_enum" AS ENUM ('DOCTOR','HOSPITAL')`,
    );
    await q.query(
      `CREATE TYPE "pharmacy_coordination_allocation_status_enum" AS ENUM ('HELD','PAYABLE','SETTLED','REVERSED')`,
    );
    await q.query(`CREATE TABLE "pharmacy_coordination_allocations" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "funding_id" uuid NOT NULL,
      "payment_transaction_id" uuid,
      "wallet_entry_id" uuid,
      "type" "pharmacy_coordination_allocation_type_enum" NOT NULL,
      "beneficiary_user_id" uuid,
      "beneficiary_provider_id" uuid,
      "source_order_reference" varchar(32) NOT NULL,
      "source_fulfillment_reference" varchar(32) NOT NULL,
      "basis_amount_minor" bigint NOT NULL,
      "bps_snapshot" smallint NOT NULL,
      "amount_minor" bigint NOT NULL,
      "currency" char(3) NOT NULL,
      "status" "pharmacy_coordination_allocation_status_enum" NOT NULL,
      "payable_at" timestamptz,
      "settled_at" timestamptz,
      "reversed_at" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_pharmacy_coordination_allocations" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_pharmacy_coordination_allocation_type" UNIQUE ("funding_id","type"),
      CONSTRAINT "CHK_pharmacy_coordination_beneficiary" CHECK (("type" = 'DOCTOR' AND "beneficiary_user_id" IS NOT NULL AND "beneficiary_provider_id" IS NULL) OR ("type" = 'HOSPITAL' AND "beneficiary_provider_id" IS NOT NULL AND "beneficiary_user_id" IS NULL)),
      CONSTRAINT "CHK_pharmacy_coordination_amount" CHECK ("basis_amount_minor" >= 0 AND "bps_snapshot" BETWEEN 0 AND 10000 AND "amount_minor" > 0),
      CONSTRAINT "CHK_pharmacy_coordination_settlement_source" CHECK ((CASE WHEN "payment_transaction_id" IS NULL THEN 0 ELSE 1 END + CASE WHEN "wallet_entry_id" IS NULL THEN 0 ELSE 1 END) = 1),
      CONSTRAINT "CHK_pharmacy_coordination_currency" CHECK ("currency" ~ '^[A-Z]{3}$'),
      CONSTRAINT "FK_pharmacy_coordination_funding" FOREIGN KEY ("funding_id") REFERENCES "pharmacy_fulfillment_fundings"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_pharmacy_coordination_transaction" FOREIGN KEY ("payment_transaction_id") REFERENCES "payment_transactions"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_pharmacy_coordination_wallet_entry" FOREIGN KEY ("wallet_entry_id") REFERENCES "patient_wallet_entries"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_pharmacy_coordination_user" FOREIGN KEY ("beneficiary_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_pharmacy_coordination_provider" FOREIGN KEY ("beneficiary_provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT
    )`);
    await q.query(
      `CREATE INDEX "IDX_pharmacy_coordination_user_status" ON "pharmacy_coordination_allocations"("beneficiary_user_id","status")`,
    );
    await q.query(
      `CREATE INDEX "IDX_pharmacy_coordination_provider_status" ON "pharmacy_coordination_allocations"("beneficiary_provider_id","status")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "IDX_pharmacy_coordination_provider_status"`);
    await q.query(`DROP INDEX "IDX_pharmacy_coordination_user_status"`);
    await q.query(`DROP TABLE "pharmacy_coordination_allocations"`);
    await q.query(`DROP TYPE "pharmacy_coordination_allocation_status_enum"`);
    await q.query(`DROP TYPE "pharmacy_coordination_allocation_type_enum"`);
    await q.query(
      `ALTER TABLE "pharmacy_fulfillment_fundings" DROP CONSTRAINT "CHK_pharmacy_funding_coordination"`,
    );
    await q.query(
      `ALTER TABLE "pharmacy_fulfillment_fundings" DROP CONSTRAINT "CHK_pharmacy_funding_money"`,
    );
    await q.query(
      `ALTER TABLE "pharmacy_fulfillment_fundings" DROP CONSTRAINT "FK_pharmacy_funding_hospital_beneficiary"`,
    );
    await q.query(
      `ALTER TABLE "pharmacy_fulfillment_fundings" DROP CONSTRAINT "FK_pharmacy_funding_doctor_beneficiary"`,
    );
    await q.query(
      `ALTER TABLE "pharmacy_fulfillment_fundings" DROP COLUMN "delivery_address_snapshot"`,
    );
    await q.query(
      `ALTER TABLE "pharmacy_fulfillment_fundings" DROP COLUMN "fulfillment_method"`,
    );
    await q.query(
      `ALTER TABLE "pharmacy_fulfillment_fundings" DROP COLUMN "hospital_beneficiary_provider_id"`,
    );
    await q.query(
      `ALTER TABLE "pharmacy_fulfillment_fundings" DROP COLUMN "hospital_coordination_amount_minor"`,
    );
    await q.query(
      `ALTER TABLE "pharmacy_fulfillment_fundings" DROP COLUMN "hospital_coordination_bps"`,
    );
    await q.query(
      `ALTER TABLE "pharmacy_fulfillment_fundings" DROP COLUMN "doctor_beneficiary_user_id"`,
    );
    await q.query(
      `ALTER TABLE "pharmacy_fulfillment_fundings" DROP COLUMN "doctor_coordination_amount_minor"`,
    );
    await q.query(
      `ALTER TABLE "pharmacy_fulfillment_fundings" DROP COLUMN "doctor_coordination_bps"`,
    );
    await q.query(
      `ALTER TABLE "pharmacy_fulfillment_fundings" DROP COLUMN "delivery_fee_minor"`,
    );
    await q.query(
      `ALTER TABLE "pharmacy_fulfillment_fundings" DROP COLUMN "medicine_amount_minor"`,
    );
    await q.query(
      `ALTER TABLE "pharmacy_fulfillment_fundings" ADD CONSTRAINT "CHK_pharmacy_funding_money" CHECK ("gross_amount_minor" >= 0 AND "commission_amount_minor" >= 0 AND "provider_share_minor" >= 0 AND "commission_amount_minor" + "provider_share_minor" = "gross_amount_minor")`,
    );
    await q.query(
      `UPDATE "pharmacy_dispensings" SET "fulfillment_method" = 'PICKUP' WHERE "fulfillment_method" <> 'PICKUP'`,
    );
    await q.query(
      `ALTER TYPE "pharmacy_fulfillment_method_enum" RENAME TO "pharmacy_fulfillment_method_enum_old"`,
    );
    await q.query(
      `CREATE TYPE "pharmacy_fulfillment_method_enum" AS ENUM ('PICKUP')`,
    );
    await q.query(
      `ALTER TABLE "pharmacy_dispensings" ALTER COLUMN "fulfillment_method" TYPE "pharmacy_fulfillment_method_enum" USING "fulfillment_method"::text::"pharmacy_fulfillment_method_enum"`,
    );
    await q.query(`DROP TYPE "pharmacy_fulfillment_method_enum_old"`);
    await q.query(
      `ALTER TABLE "pharmacy_quotes" DROP COLUMN "fulfillment_options_snapshot"`,
    );
  }
}
