import {
  MigrationInterface,
  QueryRunner,
} from 'typeorm';

export class AddUserNetworkRole1790000000000
  implements MigrationInterface
{
  name = 'AddUserNetworkRole1790000000000';

  public async up(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "user_network_role_enum"
      AS ENUM (
        'BUILDER',
        'AMBASSADOR'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "network_role"
      "user_network_role_enum"
      NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_users_network_role"
      ON "users" ("network_role")
      WHERE "network_role" IS NOT NULL
    `);
  }

  public async down(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_users_network_role"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "network_role"
    `);

    await queryRunner.query(`
      DROP TYPE "user_network_role_enum"
    `);
  }
}