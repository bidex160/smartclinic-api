import { MigrationInterface, QueryRunner } from "typeorm";

export class RelaxCareAppointmentProviderOverlap1790870400000
  implements MigrationInterface
{
  name = "RelaxCareAppointmentProviderOverlap1790870400000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "care_appointments"
      DROP CONSTRAINT IF EXISTS "EX_care_appointments_provider_overlap"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // IMPORTANT:
    // Paste the EXACT original ADD CONSTRAINT SQL here.
    // Do not invent/reconstruct the exclusion expression.

    await queryRunner.query(`
      ALTER TABLE "care_appointments"
      ADD CONSTRAINT "EX_care_appointments_provider_overlap"
      EXCLUDE USING gist (
        ...
      )
      WHERE (...)
    `);
  }
}