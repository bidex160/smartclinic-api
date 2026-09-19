import { MigrationInterface, QueryRunner } from 'typeorm';
export class HospitalServicePasses1795449600000 implements MigrationInterface {
 name='HospitalServicePasses1795449600000';
 public async up(q:QueryRunner):Promise<void>{
  await q.query(`CREATE TYPE "hospital_service_pass_status_enum" AS ENUM ('VALID','PARTIALLY_USED','USED','VOID')`);
  await q.query(`CREATE TABLE "hospital_service_passes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "reference" varchar(32) NOT NULL, "connection_id" uuid NOT NULL, "patient_id" uuid NOT NULL, "provider_id" uuid NOT NULL, "amount_minor" bigint NOT NULL, "currency" char(3) NOT NULL, "status" "hospital_service_pass_status_enum" NOT NULL, "covered_services" jsonb NOT NULL, "verification_token_hash" varchar(64) NOT NULL, "paid_at" TIMESTAMPTZ NOT NULL, "expires_at" TIMESTAMPTZ, "last_verified_at" TIMESTAMPTZ, "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(), "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(), CONSTRAINT "CHK_hospital_service_passes_amount" CHECK ("amount_minor">=0), CONSTRAINT "UQ_hospital_service_passes_reference" UNIQUE ("reference"), CONSTRAINT "PK_hospital_service_passes" PRIMARY KEY ("id"))`);
  await q.query(`CREATE INDEX "IDX_hospital_service_passes_provider_status" ON "hospital_service_passes" ("provider_id","status")`);
  await q.query(`ALTER TABLE "hospital_service_passes" ADD CONSTRAINT "FK_hospital_service_pass_connection" FOREIGN KEY ("connection_id") REFERENCES "patient_provider_connections"("id") ON DELETE RESTRICT`);
  await q.query(`ALTER TABLE "hospital_service_passes" ADD CONSTRAINT "FK_hospital_service_pass_patient" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT`);
  await q.query(`ALTER TABLE "hospital_service_passes" ADD CONSTRAINT "FK_hospital_service_pass_provider" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT`);
 }
 public async down(q:QueryRunner):Promise<void>{
  await q.query(`ALTER TABLE "hospital_service_passes" DROP CONSTRAINT "FK_hospital_service_pass_provider"`);
  await q.query(`ALTER TABLE "hospital_service_passes" DROP CONSTRAINT "FK_hospital_service_pass_patient"`);
  await q.query(`ALTER TABLE "hospital_service_passes" DROP CONSTRAINT "FK_hospital_service_pass_connection"`);
  await q.query(`DROP INDEX "IDX_hospital_service_passes_provider_status"`);
  await q.query(`DROP TABLE "hospital_service_passes"`);
  await q.query(`DROP TYPE "hospital_service_pass_status_enum"`);
 }
}