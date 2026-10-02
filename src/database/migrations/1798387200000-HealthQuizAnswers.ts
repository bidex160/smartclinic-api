import { MigrationInterface, QueryRunner } from "typeorm";

export class HealthQuizAnswers1798387200000 implements MigrationInterface {
  name = "HealthQuizAnswers1798387200000";
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "health_quiz_answers" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "patient_id" uuid NOT NULL,
      "local_date" date NOT NULL,
      "question_id" varchar(60) NOT NULL,
      "choice_index" smallint NOT NULL,
      "correct" boolean NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_health_quiz_answers" PRIMARY KEY ("id"),
      CONSTRAINT "FK_health_quiz_answers_patient" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE,
      CONSTRAINT "CHK_health_quiz_answers_choice" CHECK ("choice_index" BETWEEN 0 AND 9)
    )`);
    await q.query(`CREATE UNIQUE INDEX "UQ_health_quiz_answers_patient_date" ON "health_quiz_answers" ("patient_id", "local_date")`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "health_quiz_answers"`);
  }
}
