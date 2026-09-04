import { MigrationInterface, QueryRunner } from "typeorm";

export class CohortContactSubmissions1788493834000 implements MigrationInterface {
    name = 'CohortContactSubmissions1788493834000'

    public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."cohort_contact_submissions_status_enum"
      AS ENUM ('NEW', 'IN_PROGRESS', 'RESOLVED')
    `);

    await queryRunner.query(`
      CREATE TABLE "cohort_contact_submissions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(120) NOT NULL,
        "email" character varying(254) NOT NULL,
        "phone" character varying(30),
        "organisation" character varying(160),
        "subject" character varying(160) NOT NULL,
        "message" text NOT NULL,
        "status" "public"."cohort_contact_submissions_status_enum"
          NOT NULL DEFAULT 'NEW',
        "email_notification_sent" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cohort_contact_submissions" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE "cohort_contact_submissions"
    `);

    await queryRunner.query(`
      DROP TYPE "public"."cohort_contact_submissions_status_enum"
    `);
  }

}
