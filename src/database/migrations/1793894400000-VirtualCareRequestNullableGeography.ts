import { MigrationInterface, QueryRunner } from 'typeorm';

export class VirtualCareRequestNullableGeography1793894400000 implements MigrationInterface {
  name = 'VirtualCareRequestNullableGeography1793894400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "care_requests" ALTER COLUMN "country_code" DROP NOT NULL, ALTER COLUMN "state_or_region" DROP NOT NULL, ALTER COLUMN "city" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "care_requests" ADD CONSTRAINT "CHK_care_requests_delivery_geography" CHECK ("delivery_mode" = 'VIRTUAL' OR ("country_code" IS NOT NULL AND "state_or_region" IS NOT NULL AND "city" IS NOT NULL))`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "care_requests" DROP CONSTRAINT "CHK_care_requests_delivery_geography"`);
    await queryRunner.query(`ALTER TABLE "care_requests" ALTER COLUMN "country_code" SET NOT NULL, ALTER COLUMN "state_or_region" SET NOT NULL, ALTER COLUMN "city" SET NOT NULL`);
  }
}
