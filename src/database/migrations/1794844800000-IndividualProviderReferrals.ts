import {
  MigrationInterface,
  QueryRunner,
} from 'typeorm';

export class IndividualProviderReferrals1794844800000
  implements MigrationInterface
{
  name =
    'IndividualProviderReferrals1794844800000';

  /**
   * PostgreSQL requires a newly-added enum value
   * to be committed before it can be used.
   *
   * This migration adds INDIVIDUAL and then uses it
   * in reward_level_requirements, so this migration
   * must not run inside one transaction.
   */
  transaction = false;

  async up(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "referral_target_type_enum"
      ADD VALUE IF NOT EXISTS 'INDIVIDUAL'
    `);

    await queryRunner.query(`
      INSERT INTO "reward_rules" (
        "code",
        "points",
        "is_active"
      )
      VALUES (
        'INDIVIDUAL_PROVIDER_QUALIFIED',
        7,
        true
      )
      ON CONFLICT ("code")
      DO UPDATE SET
        "points" = EXCLUDED."points",
        "is_active" = true,
        "updated_at" = now()
    `);

    await queryRunner.query(`
      INSERT INTO "reward_level_requirements" (
        "level_id",
        "target_type",
        "required_count"
      )
      SELECT
        "id",
        'INDIVIDUAL'::"referral_target_type_enum",
        "ordinal" * 2
      FROM "reward_level_definitions"
      WHERE "is_active" = true
      ON CONFLICT ("level_id", "target_type")
      DO UPDATE SET
        "required_count" =
          EXCLUDED."required_count"
    `);
  }

  async down(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "reward_level_requirements"
      WHERE "target_type" =
        'INDIVIDUAL'::"referral_target_type_enum"
    `);

    await queryRunner.query(`
      UPDATE "reward_rules"
      SET
        "is_active" = false,
        "updated_at" = now()
      WHERE "code" =
        'INDIVIDUAL_PROVIDER_QUALIFIED'
    `);

    /**
     * PostgreSQL does not safely support removing
     * an enum value with ALTER TYPE ... DROP VALUE.
     *
     * Leave INDIVIDUAL in the enum on rollback.
     */
  }
}