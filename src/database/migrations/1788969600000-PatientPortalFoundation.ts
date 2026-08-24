import { MigrationInterface, QueryRunner } from 'typeorm';

export class PatientPortalFoundation1788969600000 implements MigrationInterface {
  name = 'PatientPortalFoundation1788969600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "patients" ADD "patient_reference" varchar(13)`);
    await queryRunner.query(`UPDATE "patients" SET "patient_reference" = 'SCP-' || upper(substr(md5("id"::text || ':smartclinic-patient-reference'), 1, 4)) || '-' || upper(substr(md5("id"::text || ':smartclinic-patient-reference'), 5, 4))`);
    await queryRunner.query(`ALTER TABLE "patients" ALTER COLUMN "patient_reference" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "patients" ADD CONSTRAINT "UQ_patients_patient_reference" UNIQUE ("patient_reference")`);
    await queryRunner.query(`ALTER TABLE "patients" ADD CONSTRAINT "CHK_patients_patient_reference_format" CHECK ("patient_reference" ~ '^SCP-[A-Z0-9]{4}-[A-Z0-9]{4}$')`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "patients" DROP CONSTRAINT "CHK_patients_patient_reference_format"`);
    await queryRunner.query(`ALTER TABLE "patients" DROP CONSTRAINT "UQ_patients_patient_reference"`);
    await queryRunner.query(`ALTER TABLE "patients" DROP COLUMN "patient_reference"`);
  }
}
