import { MigrationInterface, QueryRunner } from "typeorm";

/** Staff logins at a facility, each with a role (doctor, lab scientist, pharmacist…). */
export class ProviderTeamMembers1797955200000 implements MigrationInterface {
  name = "ProviderTeamMembers1797955200000";
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "provider_members" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "provider_id" uuid NOT NULL,
      "user_id" uuid,
      "email_normalized" varchar(320) NOT NULL,
      "display_name" varchar(120),
      "role" varchar(30) NOT NULL,
      "status" varchar(20) NOT NULL,
      "invite_token_hash" varchar(64),
      "invite_expires_at" timestamptz,
      "invited_by_user_id" uuid NOT NULL,
      "joined_at" timestamptz,
      "removed_at" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_provider_members" PRIMARY KEY ("id"),
      CONSTRAINT "FK_provider_members_provider" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_provider_members_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL,
      CONSTRAINT "CHK_provider_members_role" CHECK ("role" IN ('ADMIN','DOCTOR','NURSE','LAB_SCIENTIST','PHARMACIST','FRONT_DESK')),
      CONSTRAINT "CHK_provider_members_status" CHECK (
        ("status" = 'INVITED' AND "user_id" IS NULL AND "invite_token_hash" IS NOT NULL AND "invite_expires_at" IS NOT NULL)
        OR ("status" = 'ACTIVE' AND "user_id" IS NOT NULL AND "joined_at" IS NOT NULL)
        OR ("status" = 'REMOVED' AND "removed_at" IS NOT NULL)
      )
    )`);
    await q.query(`CREATE UNIQUE INDEX "UQ_provider_members_open_email" ON "provider_members" ("provider_id", "email_normalized") WHERE "status" <> 'REMOVED'`);
    await q.query(`CREATE UNIQUE INDEX "UQ_provider_members_active_user" ON "provider_members" ("user_id") WHERE "status" = 'ACTIVE'`);
    await q.query(`CREATE UNIQUE INDEX "UQ_provider_members_invite_token" ON "provider_members" ("invite_token_hash") WHERE "invite_token_hash" IS NOT NULL`);
    await q.query(`CREATE INDEX "IDX_provider_members_provider_status" ON "provider_members" ("provider_id", "status")`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "provider_members"`);
  }
}
