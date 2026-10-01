import { MigrationInterface, QueryRunner } from "typeorm";

/** API keys and signed webhooks so a facility's own system (EMR, LIS, pharmacy software) can connect. */
export class ProviderIntegrations1798214400000 implements MigrationInterface {
  name = "ProviderIntegrations1798214400000";
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "provider_api_keys" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "provider_id" uuid NOT NULL,
      "name" varchar(80) NOT NULL,
      "key_prefix" varchar(16) NOT NULL,
      "key_hash" varchar(64) NOT NULL,
      "created_by_user_id" uuid NOT NULL,
      "last_used_at" timestamptz,
      "revoked_at" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_provider_api_keys" PRIMARY KEY ("id"),
      CONSTRAINT "FK_provider_api_keys_provider" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE
    )`);
    await q.query(`CREATE UNIQUE INDEX "UQ_provider_api_keys_prefix" ON "provider_api_keys" ("key_prefix")`);
    await q.query(`CREATE INDEX "IDX_provider_api_keys_provider" ON "provider_api_keys" ("provider_id", "revoked_at")`);

    await q.query(`CREATE TABLE "provider_webhooks" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "provider_id" uuid NOT NULL,
      "url" varchar(500) NOT NULL,
      "secret_ciphertext" text NOT NULL,
      "secret_iv" varchar(32) NOT NULL,
      "secret_auth_tag" varchar(32) NOT NULL,
      "is_active" boolean NOT NULL DEFAULT true,
      "created_by_user_id" uuid NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_provider_webhooks" PRIMARY KEY ("id"),
      CONSTRAINT "FK_provider_webhooks_provider" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE,
      CONSTRAINT "CHK_provider_webhooks_https" CHECK ("url" LIKE 'https://%')
    )`);
    await q.query(`CREATE UNIQUE INDEX "UQ_provider_webhooks_provider" ON "provider_webhooks" ("provider_id")`);

    await q.query(`CREATE TABLE "provider_webhook_deliveries" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "webhook_id" uuid NOT NULL,
      "event_type" varchar(60) NOT NULL,
      "payload" jsonb NOT NULL,
      "status" varchar(20) NOT NULL,
      "attempt_count" integer NOT NULL DEFAULT 0,
      "next_attempt_at" timestamptz,
      "last_status_code" integer,
      "delivered_at" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_provider_webhook_deliveries" PRIMARY KEY ("id"),
      CONSTRAINT "FK_provider_webhook_deliveries_webhook" FOREIGN KEY ("webhook_id") REFERENCES "provider_webhooks"("id") ON DELETE CASCADE,
      CONSTRAINT "CHK_provider_webhook_deliveries_status" CHECK ("status" IN ('PENDING','DELIVERED','FAILED'))
    )`);
    await q.query(`CREATE INDEX "IDX_provider_webhook_deliveries_due" ON "provider_webhook_deliveries" ("status", "next_attempt_at")`);
    await q.query(`CREATE INDEX "IDX_provider_webhook_deliveries_webhook_created" ON "provider_webhook_deliveries" ("webhook_id", "created_at")`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "provider_webhook_deliveries"`);
    await q.query(`DROP TABLE "provider_webhooks"`);
    await q.query(`DROP TABLE "provider_api_keys"`);
  }
}
