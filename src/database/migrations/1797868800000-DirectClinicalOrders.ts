import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Lets providers send prescriptions and test requests by SmartClinic ID,
 * without a SmartClinic appointment. Existing rows keep their appointment
 * links and become origin APPOINTMENT.
 */
export class DirectClinicalOrders1797868800000 implements MigrationInterface {
  name = "DirectClinicalOrders1797868800000";
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "clinical_orders" ADD "origin" varchar(20) NOT NULL DEFAULT 'APPOINTMENT'`);
    await q.query(`ALTER TABLE "clinical_orders" ADD "patient_response" varchar(20)`);
    await q.query(`ALTER TABLE "clinical_orders" ADD "patient_responded_at" timestamptz`);
    await q.query(`ALTER TABLE "clinical_orders" ALTER COLUMN "care_request_id" DROP NOT NULL`);
    await q.query(`ALTER TABLE "clinical_orders" ALTER COLUMN "care_appointment_id" DROP NOT NULL`);
    await q.query(`ALTER TABLE "clinical_orders" ADD CONSTRAINT "CHK_clinical_orders_origin" CHECK (
      ("origin" = 'APPOINTMENT' AND "care_request_id" IS NOT NULL AND "care_appointment_id" IS NOT NULL AND "patient_response" IS NULL)
      OR ("origin" = 'DIRECT' AND "care_appointment_id" IS NULL AND "patient_response" IS NOT NULL AND "patient_response" IN ('PENDING','APPROVED','DECLINED'))
    )`);
    await q.query(`CREATE INDEX "IDX_clinical_orders_provider_origin_created" ON "clinical_orders" ("ordering_provider_id", "origin", "created_at")`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "IDX_clinical_orders_provider_origin_created"`);
    await q.query(`ALTER TABLE "clinical_orders" DROP CONSTRAINT "CHK_clinical_orders_origin"`);
    await q.query(`ALTER TABLE "clinical_orders" ALTER COLUMN "care_appointment_id" SET NOT NULL`);
    await q.query(`ALTER TABLE "clinical_orders" ALTER COLUMN "care_request_id" SET NOT NULL`);
    await q.query(`ALTER TABLE "clinical_orders" DROP COLUMN "patient_responded_at"`);
    await q.query(`ALTER TABLE "clinical_orders" DROP COLUMN "patient_response"`);
    await q.query(`ALTER TABLE "clinical_orders" DROP COLUMN "origin"`);
  }
}
