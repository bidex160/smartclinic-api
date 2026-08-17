import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserAuthentication1787155200000 implements MigrationInterface {
  name = 'UserAuthentication1787155200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "user_role_enum" AS ENUM ('USER', 'ADMIN', 'OPERATIONS')`);
    await queryRunner.query(`ALTER TABLE "users" ADD "roles" "user_role_enum" array NOT NULL DEFAULT ARRAY['USER']::"user_role_enum"[]`);
    await queryRunner.query(`CREATE TABLE "user_credentials" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "password_hash" varchar NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_user_credentials" PRIMARY KEY ("id"), CONSTRAINT "UQ_user_credentials_user_id" UNIQUE ("user_id"), CONSTRAINT "FK_user_credentials_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT)`);
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "user_credentials"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "roles"`);
    await queryRunner.query(`DROP TYPE "user_role_enum"`);
  }
}
