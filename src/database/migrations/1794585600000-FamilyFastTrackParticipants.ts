import { MigrationInterface, QueryRunner } from 'typeorm';

export class FamilyFastTrackParticipants1794585600000 implements MigrationInterface {
  name = 'FamilyFastTrackParticipants1794585600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "fasttrack_requests" DROP CONSTRAINT "FK_fasttrack_patient_user"`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "fasttrack_requests" ADD CONSTRAINT "FK_fasttrack_patient_user" FOREIGN KEY ("patient_id", "user_id") REFERENCES "patients"("id", "user_id") ON DELETE RESTRICT`);
  }
}
