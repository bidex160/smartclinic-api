import { MigrationInterface, QueryRunner } from 'typeorm';

export class NativePushNotifications1795017600000 implements MigrationInterface {
  name = 'NativePushNotifications1795017600000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "user_push_devices" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "platform" varchar(20) NOT NULL, "token" text NOT NULL, "installation_id" varchar(160), "is_active" boolean NOT NULL DEFAULT true, "last_seen_at" timestamptz, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_user_push_devices" PRIMARY KEY ("id"), CONSTRAINT "UQ_user_push_devices_token" UNIQUE ("token"), CONSTRAINT "FK_user_push_devices_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE)`);
    await q.query(`CREATE INDEX "IDX_user_push_devices_user_active" ON "user_push_devices" ("user_id", "is_active")`);
    await q.query(`CREATE TABLE "notification_push_outbox" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "notification_id" uuid NOT NULL, "device_id" uuid NOT NULL, "token" text NOT NULL, "payload" jsonb NOT NULL, "status" varchar(40) NOT NULL, "attempt_count" integer NOT NULL DEFAULT 0, "next_attempt_at" timestamptz, "last_attempt_at" timestamptz, "error_code" varchar(120), "idempotency_key" varchar(240) NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_notification_push_outbox" PRIMARY KEY ("id"), CONSTRAINT "UQ_notification_push_outbox_notification_device" UNIQUE ("notification_id", "device_id"), CONSTRAINT "UQ_notification_push_outbox_idempotency" UNIQUE ("idempotency_key"), CONSTRAINT "FK_notification_push_outbox_notification" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE, CONSTRAINT "FK_notification_push_outbox_device" FOREIGN KEY ("device_id") REFERENCES "user_push_devices"("id") ON DELETE CASCADE)`);
    await q.query(`CREATE INDEX "IDX_notification_push_outbox_pending" ON "notification_push_outbox" ("status", "next_attempt_at", "created_at")`);
    await q.query(`CREATE INDEX "IDX_notification_push_outbox_processing" ON "notification_push_outbox" ("status", "last_attempt_at", "created_at")`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "IDX_notification_push_outbox_processing"`); await q.query(`DROP INDEX "IDX_notification_push_outbox_pending"`); await q.query(`DROP TABLE "notification_push_outbox"`);
    await q.query(`DROP INDEX "IDX_user_push_devices_user_active"`); await q.query(`DROP TABLE "user_push_devices"`);
  }
}
