import { MigrationInterface, QueryRunner } from 'typeorm';

export class CareRequestPreferredTimezone1796400000000 implements MigrationInterface {
  name='CareRequestPreferredTimezone1796400000000';
  async up(q:QueryRunner):Promise<void>{
    await q.query(`ALTER TABLE "care_requests" ADD "preferred_timezone" varchar(80)`);
    await q.query(`UPDATE "care_requests" SET "preferred_timezone"='Africa/Lagos' WHERE "preferred_date" IS NOT NULL AND "preferred_time" IS NOT NULL`);
  }
  async down(q:QueryRunner):Promise<void>{await q.query(`ALTER TABLE "care_requests" DROP COLUMN "preferred_timezone"`);}
}
