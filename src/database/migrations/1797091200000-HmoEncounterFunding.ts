import { MigrationInterface, QueryRunner } from "typeorm";

export class HmoEncounterFunding1797091200000 implements MigrationInterface {
  name = "HmoEncounterFunding1797091200000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE "care_request_funding" ADD "funding_route" varchar(20) NOT NULL DEFAULT \'SELF_PAY\'',
    );
    await q.query('ALTER TABLE "care_request_funding" ADD "hmo_case_id" uuid');
    await q.query(
      'ALTER TABLE "care_request_funding" ADD "hmo_coverage_id" uuid',
    );
    await q.query(
      'ALTER TABLE "care_request_funding" ADD "hmo_authorization_id" uuid',
    );
    await q.query(
      'ALTER TABLE "care_request_funding" ADD "hmo_approved_amount_minor" bigint',
    );
    await q.query(
      'ALTER TABLE "care_request_funding" ADD "hmo_snapshot" jsonb',
    );
    await q.query(
      'CREATE UNIQUE INDEX "UQ_hmo_cases_care_request" ON "hmo_cases" ("care_request_id")',
    );
    await q.query(
      'ALTER TABLE "care_request_funding" ADD CONSTRAINT "FK_care_funding_hmo_case" FOREIGN KEY ("hmo_case_id") REFERENCES "hmo_cases"("id") ON DELETE RESTRICT',
    );
    await q.query(
      'ALTER TABLE "care_request_funding" ADD CONSTRAINT "FK_care_funding_hmo_coverage" FOREIGN KEY ("hmo_coverage_id") REFERENCES "patient_hmo_coverages"("id") ON DELETE RESTRICT',
    );
    await q.query(
      'ALTER TABLE "care_request_funding" ADD CONSTRAINT "FK_care_funding_hmo_authorization" FOREIGN KEY ("hmo_authorization_id") REFERENCES "hmo_authorizations"("id") ON DELETE RESTRICT',
    );
    await q.query(
      'ALTER TABLE "care_request_funding" DROP CONSTRAINT "CHK_care_funding_total"',
    );
    await q.query(
      'ALTER TABLE "care_request_funding" ADD CONSTRAINT "CHK_care_funding_total" CHECK (("funding_route" = \'SELF_PAY\' AND "amount_minor" = "base_amount_minor" + "programme_surcharge_minor") OR ("funding_route" = \'HMO\' AND "programme_surcharge_minor" = 0 AND "amount_minor" >= 0))',
    );
    await q.query(
      'ALTER TABLE "care_request_funding" ADD CONSTRAINT "CHK_care_funding_route" CHECK (("funding_route" = \'SELF_PAY\' AND "hmo_case_id" IS NULL AND "hmo_coverage_id" IS NULL AND "hmo_snapshot" IS NULL) OR ("funding_route" = \'HMO\' AND "hmo_case_id" IS NOT NULL AND "hmo_coverage_id" IS NOT NULL AND "hmo_snapshot" IS NOT NULL AND "partner_family_id" IS NULL))',
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE "care_request_funding" DROP CONSTRAINT "CHK_care_funding_route"',
    );
    await q.query(
      'ALTER TABLE "care_request_funding" DROP CONSTRAINT "CHK_care_funding_total"',
    );
    await q.query(
      'ALTER TABLE "care_request_funding" ADD CONSTRAINT "CHK_care_funding_total" CHECK ("amount_minor" = "base_amount_minor" + "programme_surcharge_minor")',
    );
    await q.query(
      'ALTER TABLE "care_request_funding" DROP CONSTRAINT "FK_care_funding_hmo_authorization"',
    );
    await q.query(
      'ALTER TABLE "care_request_funding" DROP CONSTRAINT "FK_care_funding_hmo_coverage"',
    );
    await q.query(
      'ALTER TABLE "care_request_funding" DROP CONSTRAINT "FK_care_funding_hmo_case"',
    );
    await q.query('DROP INDEX "UQ_hmo_cases_care_request"');
    for (const column of [
      "hmo_snapshot",
      "hmo_approved_amount_minor",
      "hmo_authorization_id",
      "hmo_coverage_id",
      "hmo_case_id",
      "funding_route",
    ])
      await q.query(
        `ALTER TABLE "care_request_funding" DROP COLUMN "${column}"`,
      );
  }
}
