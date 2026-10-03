import { MigrationInterface, QueryRunner } from 'typeorm';

/** "This word reads wrong" reports from people using the app in their language. */
export class LanguageFeedback1798905600000 implements MigrationInterface {
  name = 'LanguageFeedback1798905600000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "language_feedback" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(), "language" varchar(8) NOT NULL, "shown_text" varchar(300) NOT NULL,
      "suggestion" varchar(300), "page" varchar(200), "catalog_keys" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "status" varchar(12) NOT NULL DEFAULT 'OPEN', "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_language_feedback" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_language_feedback_status" CHECK ("status" IN ('OPEN','FIXED','DISMISSED')))`);
    await q.query(`CREATE INDEX "IDX_language_feedback_status_language" ON "language_feedback" ("status", "language")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "language_feedback"`);
  }
}
