import { MigrationInterface, QueryRunner } from "typeorm";

export class SupportCallbackRequests1798300800000 implements MigrationInterface {
  name = "SupportCallbackRequests1798300800000";
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "support_callback_requests" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "reference" varchar(24) NOT NULL,
      "name" varchar(80) NOT NULL,
      "phone" varchar(24) NOT NULL,
      "country_code" varchar(2),
      "topic" varchar(30) NOT NULL,
      "preferred_time" varchar(20) NOT NULL,
      "message" varchar(300),
      "status" varchar(20) NOT NULL,
      "user_id" uuid,
      "handled_by_user_id" uuid,
      "handled_at" timestamptz,
      "staff_note" varchar(500),
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_support_callback_requests" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_support_callback_requests_reference" UNIQUE ("reference"),
      CONSTRAINT "FK_support_callback_requests_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL,
      CONSTRAINT "CHK_support_callback_requests_topic" CHECK ("topic" IN ('BOOK_CHECKUP','SEE_DOCTOR','TEST_OR_RESULTS','MEDICINE','PAYMENT','ACCOUNT','OTHER')),
      CONSTRAINT "CHK_support_callback_requests_time" CHECK ("preferred_time" IN ('ANYTIME','MORNING','AFTERNOON','EVENING')),
      CONSTRAINT "CHK_support_callback_requests_status" CHECK ("status" IN ('OPEN','CALLED','CLOSED'))
    )`);
    await q.query(`CREATE INDEX "IDX_support_callback_requests_status_created" ON "support_callback_requests" ("status", "created_at")`);
    await q.query(`CREATE INDEX "IDX_support_callback_requests_phone_created" ON "support_callback_requests" ("phone", "created_at")`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "support_callback_requests"`);
  }
}
