import { MigrationInterface, QueryRunner } from 'typeorm';

/** Daily Health Word games, friend challenges and their players. */
export class HealthWordAndChallenges1798732800000 implements MigrationInterface {
  name = 'HealthWordAndChallenges1798732800000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "health_word_games" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(), "patient_id" uuid NOT NULL, "local_date" date NOT NULL,
      "puzzle_number" integer NOT NULL, "word_id" varchar(10) NOT NULL, "guesses" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "solved" boolean NOT NULL DEFAULT false, "finished" boolean NOT NULL DEFAULT false,
      "started_at" timestamptz NOT NULL, "finished_at" timestamptz,
      CONSTRAINT "PK_health_word_games" PRIMARY KEY ("id"),
      CONSTRAINT "FK_health_word_game_patient" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE)`);
    await q.query(`CREATE UNIQUE INDEX "UQ_health_word_game_patient_date" ON "health_word_games" ("patient_id", "local_date")`);
    await q.query(`CREATE TABLE "health_challenges" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(), "code" varchar(12) NOT NULL, "created_by_user_id" uuid NOT NULL,
      "theme" varchar(20) NOT NULL, "mode" varchar(10) NOT NULL, "start_date" date NOT NULL, "end_date" date NOT NULL,
      "timezone" varchar(64) NOT NULL DEFAULT 'Africa/Lagos', "max_participants" integer NOT NULL,
      "results_sent_at" timestamptz, "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_health_challenges" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_health_challenges_code" UNIQUE ("code"),
      CONSTRAINT "CHK_health_challenges_dates" CHECK ("end_date" >= "start_date"),
      CONSTRAINT "FK_health_challenge_creator" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE)`);
    await q.query(`CREATE INDEX "IDX_health_challenges_results_due" ON "health_challenges" ("end_date") WHERE "results_sent_at" IS NULL`);
    await q.query(`CREATE TABLE "health_challenge_participants" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(), "challenge_id" uuid NOT NULL, "user_id" uuid NOT NULL, "patient_id" uuid NOT NULL,
      "joined_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_health_challenge_participants" PRIMARY KEY ("id"),
      CONSTRAINT "FK_health_challenge_participant_challenge" FOREIGN KEY ("challenge_id") REFERENCES "health_challenges"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_health_challenge_participant_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_health_challenge_participant_patient" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE)`);
    await q.query(`CREATE UNIQUE INDEX "UQ_health_challenge_participant" ON "health_challenge_participants" ("challenge_id", "user_id")`);
    await q.query(`CREATE INDEX "IDX_health_challenge_participant_user" ON "health_challenge_participants" ("user_id")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "health_challenge_participants"`);
    await q.query(`DROP TABLE "health_challenges"`);
    await q.query(`DROP TABLE "health_word_games"`);
  }
}
