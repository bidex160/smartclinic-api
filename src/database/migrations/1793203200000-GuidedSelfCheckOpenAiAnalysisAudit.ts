import { MigrationInterface, QueryRunner } from 'typeorm';

export class GuidedSelfCheckOpenAiAnalysisAudit1793203200000 implements MigrationInterface {
  name = 'GuidedSelfCheckOpenAiAnalysisAudit1793203200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "guided_self_check_analyses" ADD "prompt_version" varchar(80)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "guided_self_check_analyses" DROP COLUMN "prompt_version"`);
  }
}
