import { MigrationInterface, QueryRunner } from 'typeorm';

export class FamilyCareRequestParticipants1794672000000 implements MigrationInterface {
  name = 'FamilyCareRequestParticipants1794672000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "care_requests" DROP CONSTRAINT "FK_care_requests_patient_user"`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "care_requests" ADD CONSTRAINT "FK_care_requests_patient_user" FOREIGN KEY ("patient_id", "user_id") REFERENCES "patients"("id", "user_id") ON DELETE RESTRICT`);
  }
}
