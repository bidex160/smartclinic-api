import { MigrationInterface, QueryRunner } from 'typeorm';
export class ProviderProfileImages1794000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "providers" ADD COLUMN "profile_image_url" varchar(1000), ADD COLUMN "profile_image_public_id" varchar(255)');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "providers" DROP COLUMN "profile_image_public_id", DROP COLUMN "profile_image_url"');
  }
}
