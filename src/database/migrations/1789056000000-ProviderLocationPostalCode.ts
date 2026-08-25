import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProviderLocationPostalCode1789056000000 implements MigrationInterface {
  name = 'ProviderLocationPostalCode1789056000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "provider_locations" ADD "postal_code" character varying(30)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "provider_locations" DROP COLUMN "postal_code"`);
  }
}
