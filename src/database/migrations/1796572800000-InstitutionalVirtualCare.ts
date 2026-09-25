import { MigrationInterface, QueryRunner } from 'typeorm';
export class InstitutionalVirtualCare1796572800000 implements MigrationInterface{
 name='InstitutionalVirtualCare1796572800000';
 async up(q:QueryRunner):Promise<void>{
  // host_provider_id is created by InstitutionalVirtualCare1796569200000.
  // Its foreign key is also owned by the earlier migration.
  await q.query(`CREATE INDEX IF NOT EXISTS "IDX_care_requests_host_provider" ON "care_requests" ("host_provider_id","status","created_at")`);
  await q.query(`ALTER TABLE "provider_practice_affiliations" ADD "allows_virtual_care" boolean NOT NULL DEFAULT false`);
  await q.query(`ALTER TABLE "provider_practice_affiliations" ADD "virtual_care_price_minor" bigint`);
  await q.query(`ALTER TABLE "provider_practice_affiliations" ADD "virtual_care_currency" char(3)`);
  await q.query(`CREATE INDEX "IDX_provider_practice_affiliations_host_virtual" ON "provider_practice_affiliations" ("host_provider_id","status","is_active","allows_virtual_care")`);
  await q.query(`ALTER TABLE "provider_practice_affiliations" ADD CONSTRAINT "CHK_affiliation_virtual_price" CHECK (("allows_virtual_care"=false AND "virtual_care_price_minor" IS NULL AND "virtual_care_currency" IS NULL) OR ("allows_virtual_care"=true AND "virtual_care_price_minor">=0 AND "virtual_care_currency" ~ '^[A-Z]{3}$'))`);
 }
 async down(q:QueryRunner):Promise<void>{
  await q.query(`ALTER TABLE "provider_practice_affiliations" DROP CONSTRAINT "CHK_affiliation_virtual_price"`);
  await q.query(`DROP INDEX "IDX_provider_practice_affiliations_host_virtual"`);
  await q.query(`ALTER TABLE "provider_practice_affiliations" DROP COLUMN "virtual_care_currency"`);
  await q.query(`ALTER TABLE "provider_practice_affiliations" DROP COLUMN "virtual_care_price_minor"`);
  await q.query(`ALTER TABLE "provider_practice_affiliations" DROP COLUMN "allows_virtual_care"`);
  await q.query(`DROP INDEX "IDX_care_requests_host_provider"`);
  // Earlier migration owns the host-provider foreign key.
  // Earlier migration owns host_provider_id.
 }
}