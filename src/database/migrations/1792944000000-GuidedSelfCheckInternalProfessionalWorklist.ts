import { MigrationInterface, QueryRunner } from 'typeorm';

export class GuidedSelfCheckInternalProfessionalWorklist1792944000000 implements MigrationInterface {
  name = 'GuidedSelfCheckInternalProfessionalWorklist1792944000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE INDEX "IDX_gsc_review_internal_worklist" ON "guided_self_check_professional_reviews" ("assigned_internal_clinical_professional_id", "status", "priority", "assigned_at", "id")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_gsc_review_internal_worklist"`);
  }
}
