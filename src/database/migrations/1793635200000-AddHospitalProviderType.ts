import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHospitalProviderType1793635200000 implements MigrationInterface {
  name = 'AddHospitalProviderType1793635200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "provider_type_enum" ADD VALUE IF NOT EXISTS 'HOSPITAL'`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM providers WHERE provider_type::text = 'HOSPITAL') THEN
          RAISE EXCEPTION 'Cannot remove HOSPITAL provider type while providers use it';
        END IF;
      END $$
    `);
    await queryRunner.query(`ALTER TYPE "provider_type_enum" RENAME TO "provider_type_enum_old"`);
    await queryRunner.query(`CREATE TYPE "provider_type_enum" AS ENUM ('INDIVIDUAL', 'CLINIC', 'DIAGNOSTIC_CENTRE', 'PHARMACY', 'OTHER')`);
    await queryRunner.query(`ALTER TABLE "providers" ALTER COLUMN "provider_type" DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE "providers" ALTER COLUMN "provider_type" TYPE "provider_type_enum" USING "provider_type"::text::"provider_type_enum"`);
    await queryRunner.query(`ALTER TABLE "providers" ALTER COLUMN "provider_type" SET DEFAULT 'OTHER'`);
    await queryRunner.query(`DROP TYPE "provider_type_enum_old"`);
  }
}
