import { MigrationInterface, QueryRunner } from 'typeorm';

export class GuidedSelfCheckAiNextActionConstraint1793289600000 implements MigrationInterface {
  name = 'GuidedSelfCheckAiNextActionConstraint1793289600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "guided_self_check_next_actions" DROP CONSTRAINT "CHK_gsc_next_action_source"`);
    await queryRunner.query(`ALTER TABLE "guided_self_check_next_actions" ADD CONSTRAINT "CHK_gsc_next_action_source" CHECK (
      ("source"='CLASSIFICATION' AND "professional_review_id" IS NULL AND "analysis_id" IS NULL AND "selected_by_user_id" IS NULL)
      OR ("source"='AI_ANALYSIS' AND "professional_review_id" IS NULL AND "analysis_id" IS NOT NULL AND "selected_by_user_id" IS NULL)
      OR ("source"='PROFESSIONAL_REVIEW' AND "professional_review_id" IS NOT NULL AND "analysis_id" IS NULL AND "selected_by_user_id" IS NOT NULL)
    )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "guided_self_check_next_actions" DROP CONSTRAINT "CHK_gsc_next_action_source"`);
    await queryRunner.query(`ALTER TABLE "guided_self_check_next_actions" ADD CONSTRAINT "CHK_gsc_next_action_source" CHECK (
      ("source"='CLASSIFICATION' AND "professional_review_id" IS NULL AND "selected_by_user_id" IS NULL)
      OR ("source"='PROFESSIONAL_REVIEW' AND "professional_review_id" IS NOT NULL AND "selected_by_user_id" IS NOT NULL)
    ) NOT VALID`);
  }
}
