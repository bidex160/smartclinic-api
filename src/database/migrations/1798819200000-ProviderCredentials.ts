import { MigrationInterface, QueryRunner } from 'typeorm';

/** Licences: what a doctor or facility is registered as, and whether staff have checked it. */
export class ProviderCredentials1798819200000 implements MigrationInterface {
  name = 'ProviderCredentials1798819200000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "provider_credentials" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(), "provider_id" uuid NOT NULL,
      "regulator" varchar(20) NOT NULL, "licence_number" varchar(60) NOT NULL,
      "status" varchar(20) NOT NULL DEFAULT 'SUBMITTED',
      "document_public_id" varchar(300), "document_resource_type" varchar(20), "document_version" varchar(40),
      "document_format" varchar(20), "document_mime_type" varchar(100), "document_uploaded_at" timestamptz,
      "submitted_at" timestamptz NOT NULL, "verified_at" timestamptz, "reviewed_by_user_id" uuid,
      "checked_via" varchar(120), "review_note" varchar(500),
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_provider_credentials" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_provider_credentials_provider" UNIQUE ("provider_id"),
      CONSTRAINT "CHK_provider_credentials_status" CHECK ("status" IN ('NOT_SUBMITTED','SUBMITTED','VERIFIED','REJECTED')),
      CONSTRAINT "CHK_provider_credentials_verified_at" CHECK ("status" <> 'VERIFIED' OR "verified_at" IS NOT NULL),
      CONSTRAINT "FK_provider_credentials_provider" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_provider_credentials_reviewer" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL)`);
    await q.query(`CREATE INDEX "IDX_provider_credentials_status" ON "provider_credentials" ("status")`);
    // Licence numbers are unique per regulator, so one licence can't back two accounts.
    await q.query(`CREATE UNIQUE INDEX "UQ_provider_credentials_regulator_number" ON "provider_credentials" ("regulator", "licence_number") WHERE "regulator" <> 'OTHER'`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "provider_credentials"`);
  }
}
