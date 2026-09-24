import { MigrationInterface,QueryRunner } from 'typeorm';
export class ProviderAffiliationGovernance1796486400000 implements MigrationInterface{name='ProviderAffiliationGovernance1796486400000';async up(q:QueryRunner):Promise<void>{
 await q.query(`CREATE TYPE "provider_practice_affiliation_status_enum" AS ENUM ('PENDING','APPROVED','REJECTED')`);
 await q.query(`ALTER TABLE "provider_practice_affiliations" ADD COLUMN "status" "provider_practice_affiliation_status_enum" NOT NULL DEFAULT 'PENDING'`);
 await q.query(`ALTER TABLE "provider_practice_affiliations" ADD COLUMN "reviewed_at" timestamptz`);
 await q.query(`ALTER TABLE "provider_practice_affiliations" ADD COLUMN "reviewed_by_user_id" uuid`);
 await q.query(`ALTER TABLE "provider_practice_affiliations" ADD CONSTRAINT "FK_provider_practice_affiliations_reviewer" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL`);
 await q.query(`CREATE UNIQUE INDEX "UQ_provider_locations_id_provider" ON "provider_locations" ("id","provider_id")`);
 await q.query(`ALTER TABLE "provider_practice_affiliations" ADD CONSTRAINT "FK_provider_practice_affiliations_host_location_owner" FOREIGN KEY ("host_location_id","host_provider_id") REFERENCES "provider_locations"("id","provider_id") ON DELETE CASCADE`);
 await q.query(`UPDATE "provider_practice_affiliations" SET "status"='APPROVED', "reviewed_at"=now() WHERE "is_active"=true`);
 await q.query(`CREATE INDEX "IDX_provider_practice_affiliations_host_virtual" ON "provider_practice_affiliations" ("host_provider_id","status","is_active","allows_virtual_care")`);
 }async down(q:QueryRunner):Promise<void>{
 await q.query(`DROP INDEX "public"."IDX_provider_practice_affiliations_host_virtual"`);
 await q.query(`ALTER TABLE "provider_practice_affiliations" DROP CONSTRAINT "FK_provider_practice_affiliations_host_location_owner"`);
 await q.query(`DROP INDEX "public"."UQ_provider_locations_id_provider"`);
 await q.query(`ALTER TABLE "provider_practice_affiliations" DROP CONSTRAINT "FK_provider_practice_affiliations_reviewer"`);
 await q.query(`ALTER TABLE "provider_practice_affiliations" DROP COLUMN "reviewed_by_user_id"`);
 await q.query(`ALTER TABLE "provider_practice_affiliations" DROP COLUMN "reviewed_at"`);
 await q.query(`ALTER TABLE "provider_practice_affiliations" DROP COLUMN "status"`);
 await q.query(`DROP TYPE "provider_practice_affiliation_status_enum"`);
 }}