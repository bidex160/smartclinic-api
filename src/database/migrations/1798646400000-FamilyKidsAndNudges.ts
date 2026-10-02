import { MigrationInterface, QueryRunner } from 'typeorm';

/** Kids corner (tasks, stars, kids question) and daily nudge settings. */
export class FamilyKidsAndNudges1798646400000 implements MigrationInterface {
  name = 'FamilyKidsAndNudges1798646400000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "child_daily_tasks" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(), "child_patient_id" uuid NOT NULL, "created_by_user_id" uuid NOT NULL,
      "task_key" varchar(40) NOT NULL, "enabled" boolean NOT NULL DEFAULT true, "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_child_daily_tasks" PRIMARY KEY ("id"),
      CONSTRAINT "FK_child_daily_task_child" FOREIGN KEY ("child_patient_id") REFERENCES "patients"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_child_daily_task_creator" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT)`);
    await q.query(`CREATE UNIQUE INDEX "UQ_child_daily_task_child_key" ON "child_daily_tasks" ("child_patient_id", "task_key")`);
    await q.query(`CREATE TABLE "child_task_completions" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(), "task_id" uuid NOT NULL, "child_patient_id" uuid NOT NULL,
      "local_date" date NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_child_task_completions" PRIMARY KEY ("id"),
      CONSTRAINT "FK_child_task_completion_task" FOREIGN KEY ("task_id") REFERENCES "child_daily_tasks"("id") ON DELETE CASCADE)`);
    await q.query(`CREATE UNIQUE INDEX "UQ_child_task_completion_day" ON "child_task_completions" ("task_id", "local_date")`);
    await q.query(`CREATE INDEX "IDX_child_task_completion_child_date" ON "child_task_completions" ("child_patient_id", "local_date")`);
    await q.query(`CREATE TABLE "child_quiz_answers" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(), "child_patient_id" uuid NOT NULL, "local_date" date NOT NULL,
      "question_id" varchar(20) NOT NULL, "choice_index" smallint NOT NULL, "correct" boolean NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_child_quiz_answers" PRIMARY KEY ("id"),
      CONSTRAINT "FK_child_quiz_answer_child" FOREIGN KEY ("child_patient_id") REFERENCES "patients"("id") ON DELETE CASCADE)`);
    await q.query(`CREATE UNIQUE INDEX "UQ_child_quiz_answer_day" ON "child_quiz_answers" ("child_patient_id", "local_date")`);
    await q.query(`CREATE TABLE "nudge_settings" (
      "user_id" uuid NOT NULL, "enabled" boolean NOT NULL DEFAULT true, "local_time" varchar(5) NOT NULL DEFAULT '08:00',
      "timezone" varchar(64) NOT NULL DEFAULT 'Africa/Lagos', "language" varchar(8) NOT NULL DEFAULT 'en', "whatsapp" boolean NOT NULL DEFAULT false,
      "last_sent_date" date, "last_nudged_date" date, "ignored_in_a_row" integer NOT NULL DEFAULT 0, "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_nudge_settings" PRIMARY KEY ("user_id"),
      CONSTRAINT "FK_nudge_settings_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "nudge_settings"`);
    await q.query(`DROP TABLE "child_quiz_answers"`);
    await q.query(`DROP TABLE "child_task_completions"`);
    await q.query(`DROP TABLE "child_daily_tasks"`);
  }
}
