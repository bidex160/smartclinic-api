import { MigrationInterface, QueryRunner } from "typeorm";

export class MultiLevelReferralProgression1789315200000 implements MigrationInterface {
  name = "MultiLevelReferralProgression1789315200000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`INSERT INTO reward_level_definitions (id, code, name, ordinal, is_active) VALUES
      ('10000000-0000-4000-8000-000000000002', 'LEVEL_2', 'Level 2', 2, true),
      ('10000000-0000-4000-8000-000000000003', 'LEVEL_3', 'Level 3', 3, true),
      ('10000000-0000-4000-8000-000000000004', 'LEVEL_4', 'Level 4', 4, true),
      ('10000000-0000-4000-8000-000000000005', 'LEVEL_5', 'Level 5', 5, true)
      ON CONFLICT (code) DO NOTHING`);
    await queryRunner.query(`INSERT INTO reward_level_requirements (level_id, target_type, required_count)
      SELECT level.id, values.target_type::referral_target_type_enum, values.required_count
      FROM (VALUES
        ('LEVEL_1', 'PATIENT', 10), ('LEVEL_1', 'CLINIC', 2), ('LEVEL_1', 'LABORATORY', 2), ('LEVEL_1', 'PHARMACY', 2),
        ('LEVEL_2', 'PATIENT', 20), ('LEVEL_2', 'CLINIC', 4), ('LEVEL_2', 'LABORATORY', 4), ('LEVEL_2', 'PHARMACY', 4),
        ('LEVEL_3', 'PATIENT', 30), ('LEVEL_3', 'CLINIC', 6), ('LEVEL_3', 'LABORATORY', 6), ('LEVEL_3', 'PHARMACY', 6),
        ('LEVEL_4', 'PATIENT', 40), ('LEVEL_4', 'CLINIC', 8), ('LEVEL_4', 'LABORATORY', 8), ('LEVEL_4', 'PHARMACY', 8),
        ('LEVEL_5', 'PATIENT', 50), ('LEVEL_5', 'CLINIC', 10), ('LEVEL_5', 'LABORATORY', 10), ('LEVEL_5', 'PHARMACY', 10)
      ) AS values(level_code, target_type, required_count)
      INNER JOIN reward_level_definitions level ON level.code = values.level_code
      ON CONFLICT (level_id, target_type) DO UPDATE SET required_count = EXCLUDED.required_count`);
    await queryRunner.query(`INSERT INTO reward_rules (code, points, is_active) VALUES
      ('LEVEL_2_COMPLETED', 0, false), ('LEVEL_3_COMPLETED', 0, false),
      ('LEVEL_4_COMPLETED', 0, false), ('LEVEL_5_COMPLETED', 0, false)
      ON CONFLICT (code) DO NOTHING`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM reward_rules WHERE code IN ('LEVEL_2_COMPLETED', 'LEVEL_3_COMPLETED', 'LEVEL_4_COMPLETED', 'LEVEL_5_COMPLETED')`);
    await queryRunner.query(`DELETE FROM reward_level_achievements achievement USING reward_level_definitions level WHERE achievement.level_id = level.id AND level.code IN ('LEVEL_2', 'LEVEL_3', 'LEVEL_4', 'LEVEL_5')`);
    await queryRunner.query(`DELETE FROM reward_level_definitions WHERE code IN ('LEVEL_2', 'LEVEL_3', 'LEVEL_4', 'LEVEL_5')`);
  }
}
