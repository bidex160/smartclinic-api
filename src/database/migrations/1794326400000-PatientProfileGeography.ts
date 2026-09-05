import { MigrationInterface, QueryRunner } from 'typeorm';

export class PatientProfileGeography1794326400000
  implements MigrationInterface
{
  name = 'PatientProfileGeography1794326400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "patients"
      ADD COLUMN "country_code" char(2)
    `);

    await queryRunner.query(`
      ALTER TABLE "patients"
      ADD COLUMN "state_or_region" varchar(120)
    `);

    await queryRunner.query(`
      ALTER TABLE "patients"
      ADD COLUMN "city" varchar(120)
    `);

    await queryRunner.query(`
      ALTER TABLE "patients"
      ADD CONSTRAINT "CHK_patients_country_code"
      CHECK (
        "country_code" IS NULL
        OR "country_code" ~ '^[A-Z]{2}$'
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "patients"
      DROP CONSTRAINT "CHK_patients_country_code"
    `);

    await queryRunner.query(`
      ALTER TABLE "patients"
      DROP COLUMN "city"
    `);

    await queryRunner.query(`
      ALTER TABLE "patients"
      DROP COLUMN "state_or_region"
    `);

    await queryRunner.query(`
      ALTER TABLE "patients"
      DROP COLUMN "country_code"
    `);
  }
}