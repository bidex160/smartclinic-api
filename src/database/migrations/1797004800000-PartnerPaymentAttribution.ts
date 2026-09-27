import { MigrationInterface, QueryRunner } from "typeorm";

export class PartnerPaymentAttribution1797004800000 implements MigrationInterface {
  name = "PartnerPaymentAttribution1797004800000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE "care_request_funding" ADD "base_amount_minor" bigint',
    );
    await q.query(
      'ALTER TABLE "care_request_funding" ADD "programme_surcharge_minor" bigint NOT NULL DEFAULT 0',
    );
    await q.query(
      'ALTER TABLE "care_request_funding" ADD "partner_family_id" uuid',
    );
    await q.query(
      'ALTER TABLE "care_request_funding" ADD "partner_program_id" uuid',
    );
    await q.query(
      'ALTER TABLE "care_request_funding" ADD "programme_snapshot" jsonb',
    );
    await q.query(
      'UPDATE "care_request_funding" SET "base_amount_minor" = "amount_minor" WHERE "base_amount_minor" IS NULL',
    );
    await q.query(
      'ALTER TABLE "care_request_funding" ALTER COLUMN "base_amount_minor" SET NOT NULL',
    );
    await q.query(
      'ALTER TABLE "care_request_funding" ADD CONSTRAINT "FK_care_funding_partner_family" FOREIGN KEY ("partner_family_id") REFERENCES "partner_families"("id") ON DELETE RESTRICT',
    );
    await q.query(
      'ALTER TABLE "care_request_funding" ADD CONSTRAINT "FK_care_funding_partner_program" FOREIGN KEY ("partner_program_id") REFERENCES "partner_programs"("id") ON DELETE RESTRICT',
    );
    await q.query(
      'ALTER TABLE "care_request_funding" ADD CONSTRAINT "CHK_care_funding_programme_attribution" CHECK (("partner_family_id" IS NULL AND "partner_program_id" IS NULL AND "programme_snapshot" IS NULL AND "programme_surcharge_minor" = 0) OR ("partner_family_id" IS NOT NULL AND "partner_program_id" IS NOT NULL AND "programme_snapshot" IS NOT NULL AND "programme_surcharge_minor" > 0))',
    );
    await q.query(
      'ALTER TABLE "care_request_funding" ADD CONSTRAINT "CHK_care_funding_total" CHECK ("amount_minor" = "base_amount_minor" + "programme_surcharge_minor")',
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE "care_request_funding" DROP CONSTRAINT "CHK_care_funding_total"',
    );
    await q.query(
      'ALTER TABLE "care_request_funding" DROP CONSTRAINT "CHK_care_funding_programme_attribution"',
    );
    await q.query(
      'ALTER TABLE "care_request_funding" DROP CONSTRAINT "FK_care_funding_partner_program"',
    );
    await q.query(
      'ALTER TABLE "care_request_funding" DROP CONSTRAINT "FK_care_funding_partner_family"',
    );
    for (const column of [
      "programme_snapshot",
      "partner_program_id",
      "partner_family_id",
      "programme_surcharge_minor",
      "base_amount_minor",
    ])
      await q.query(
        `ALTER TABLE "care_request_funding" DROP COLUMN "${column}"`,
      );
  }
}
