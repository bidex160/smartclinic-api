import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserPhoneLoginIdentity1793116800000 implements MigrationInterface {
  name = 'UserPhoneLoginIdentity1793116800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "phone_normalized" varchar`);
    await queryRunner.query(`
      WITH source AS (
        SELECT
          patient.user_id,
          CASE
            WHEN regexp_replace(btrim(patient.phone), '[[:space:]()-]', '', 'g') ~ '^0[1-9][0-9]{9}$'
              THEN '+234' || substring(regexp_replace(btrim(patient.phone), '[[:space:]()-]', '', 'g') FROM 2)
            WHEN regexp_replace(btrim(patient.phone), '[[:space:]()-]', '', 'g') ~ '^234[1-9][0-9]{9}$'
              THEN '+' || regexp_replace(btrim(patient.phone), '[[:space:]()-]', '', 'g')
            WHEN regexp_replace(btrim(patient.phone), '[[:space:]()-]', '', 'g') ~ '^\\+[1-9][0-9]{7,14}$'
              THEN regexp_replace(btrim(patient.phone), '[[:space:]()-]', '', 'g')
            ELSE NULL
          END AS normalized
        FROM patients patient
        WHERE patient.user_id IS NOT NULL AND patient.phone IS NOT NULL
      ), unambiguous AS (
        SELECT normalized
        FROM source
        WHERE normalized IS NOT NULL
        GROUP BY normalized
        HAVING COUNT(*) = 1
      )
      UPDATE users account
      SET phone_normalized = source.normalized
      FROM source
      INNER JOIN unambiguous ON unambiguous.normalized = source.normalized
      WHERE account.id = source.user_id
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_users_phone_normalized"
      ON "users" ("phone_normalized")
      WHERE "phone_normalized" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."UQ_users_phone_normalized"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "phone_normalized"`);
  }
}
