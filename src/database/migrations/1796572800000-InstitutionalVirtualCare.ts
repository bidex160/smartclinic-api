import { MigrationInterface, QueryRunner } from 'typeorm';
export class InstitutionalVirtualCare1796572800000 implements MigrationInterface{
 name='InstitutionalVirtualCare1796572800000';
 async up(q:QueryRunner):Promise<void>{
  await q.query(`ALTER TABLE "care_requests" ADD "host_provider_id" uuid`);
  await q.query(`ALTER TABLE "care_requests" ADD CONSTRAINT "FK_care_requests_host_provider" FOREIGN KEY ("host_provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT`);
  await q.query(`CREATE INDEX "IDX_care_requests_host_provider" ON "care_requests" ("host_provider_id","status","created_at")`);
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
  await q.query(`ALTER TABLE "care_requests" DROP CONSTRAINT "FK_care_requests_host_provider"`);
  await q.query(`ALTER TABLE "care_requests" DROP COLUMN "host_provider_id"`);
 }
}