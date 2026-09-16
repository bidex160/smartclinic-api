import { MigrationInterface, QueryRunner } from 'typeorm';

export class NotificationsOutbox1794931200000 implements MigrationInterface {
  name = 'NotificationsOutbox1794931200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "reference" character varying(40) NOT NULL,
        "user_id" uuid NOT NULL,
        "type" character varying(80) NOT NULL,
        "title" character varying(160) NOT NULL,
        "message" text NOT NULL,
        "entity_type" character varying(80) NOT NULL,
        "entity_reference" character varying(120) NOT NULL,
        "action_type" character varying(40) NOT NULL,
        "metadata" jsonb,
        "idempotency_key" character varying(220),
        "read_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notifications_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_notifications_reference" ON "notifications" ("reference")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_notifications_idempotency_key" ON "notifications" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_notifications_user_created" ON "notifications" ("user_id", "created_at" DESC)`);
    await queryRunner.query(`CREATE INDEX "IDX_notifications_user_read_created" ON "notifications" ("user_id", "read_at", "created_at" DESC)`);

    await queryRunner.query(`
      CREATE TABLE "notification_outbox" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "notification_id" uuid NOT NULL,
        "channel" character varying(40) NOT NULL,
        "status" character varying(40) NOT NULL,
        "attempt_count" integer NOT NULL DEFAULT 0,
        "next_attempt_at" TIMESTAMP WITH TIME ZONE,
        "last_attempt_at" TIMESTAMP WITH TIME ZONE,
        "error_code" character varying(120),
        "idempotency_key" character varying(240) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_outbox" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notification_outbox_notification" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_notification_outbox_idempotency_key" ON "notification_outbox" ("idempotency_key")`);
    await queryRunner.query(`CREATE INDEX "IDX_notification_outbox_pending" ON "notification_outbox" ("status", "next_attempt_at", "created_at")`);
    await queryRunner.query(`CREATE INDEX "IDX_notification_outbox_processing" ON "notification_outbox" ("status", "last_attempt_at", "created_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_notification_outbox_processing"`);
    await queryRunner.query(`DROP INDEX "IDX_notification_outbox_pending"`);
    await queryRunner.query(`DROP INDEX "UQ_notification_outbox_idempotency_key"`);
    await queryRunner.query(`DROP TABLE "notification_outbox"`);
    await queryRunner.query(`DROP INDEX "IDX_notifications_user_read_created"`);
    await queryRunner.query(`DROP INDEX "IDX_notifications_user_created"`);
    await queryRunner.query(`DROP INDEX "UQ_notifications_idempotency_key"`);
    await queryRunner.query(`DROP INDEX "UQ_notifications_reference"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
  }
}
