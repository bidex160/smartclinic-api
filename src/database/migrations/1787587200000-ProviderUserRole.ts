import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProviderUserRole1787587200000 implements MigrationInterface {
  name = 'ProviderUserRole1787587200000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "user_role_enum" ADD VALUE IF NOT EXISTS 'PROVIDER'`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "roles" DROP DEFAULT`);
    await queryRunner.query(`ALTER TYPE "user_role_enum" RENAME TO "user_role_enum_with_provider"`);
    await queryRunner.query(`CREATE TYPE "user_role_enum" AS ENUM ('USER', 'ADMIN', 'OPERATIONS')`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "roles" TYPE "user_role_enum"[] USING "roles"::text[]::"user_role_enum"[]`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "roles" SET DEFAULT ARRAY['USER']::"user_role_enum"[]`);
    await queryRunner.query(`DROP TYPE "user_role_enum_with_provider"`);
  }
}
