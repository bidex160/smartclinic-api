import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialDomainSchema1786896000000 implements MigrationInterface {
  name = 'InitialDomainSchema1786896000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await queryRunner.query(`CREATE TYPE "user_status_enum" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED', 'DEACTIVATED')`);
    await queryRunner.query(`CREATE TYPE "patient_status_enum" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED')`);
    await queryRunner.query(`CREATE TYPE "provider_status_enum" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'INACTIVE')`);
    await queryRunner.query(`CREATE TYPE "organisation_status_enum" AS ENUM ('ACTIVE', 'SUSPENDED', 'INACTIVE')`);
    await queryRunner.query(`CREATE TYPE "booking_status_enum" AS ENUM ('DRAFT', 'AWAITING_FUNDING', 'PENDING_PROVIDER_MATCH', 'PROVIDER_ASSIGNED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'UNFULFILLABLE', 'CANCELLED', 'EXPIRED')`);
    await queryRunner.query(`CREATE TYPE "booking_funding_source_type_enum" AS ENUM ('SELF', 'FAMILY', 'SPONSOR', 'ORGANISATION', 'OTHER')`);
    await queryRunner.query(`CREATE TYPE "booking_funding_status_enum" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'EXPIRED', 'CANCELLED', 'SETTLED')`);
    await queryRunner.query(`CREATE TYPE "payment_attempt_status_enum" AS ENUM ('CREATED', 'AWAITING_CUSTOMER_ACTION', 'PENDING_CONFIRMATION', 'SUCCEEDED', 'FAILED', 'CANCELLED')`);
    await queryRunner.query(`CREATE TYPE "payment_transaction_type_enum" AS ENUM ('COLLECTION', 'REFUND')`);
    await queryRunner.query(`CREATE TYPE "payment_transaction_status_enum" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED')`);
    await queryRunner.query(`CREATE TYPE "provider_assignment_status_enum" AS ENUM ('OFFERED', 'ACCEPTED', 'CONFIRMED', 'DECLINED', 'EXPIRED', 'CANCELLED')`);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" varchar,
        "email_normalized" varchar,
        "display_name" varchar,
        "status" "user_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_users_email_normalized" ON "users" ("email_normalized") WHERE "email_normalized" IS NOT NULL`);

    await queryRunner.query(`
      CREATE TABLE "patients" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid,
        "given_name" varchar NOT NULL,
        "family_name" varchar NOT NULL,
        "date_of_birth" date,
        "phone" varchar,
        "email" varchar,
        "status" "patient_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_patients" PRIMARY KEY ("id"),
        CONSTRAINT "FK_patients_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_patients_user_id" ON "patients" ("user_id") WHERE "user_id" IS NOT NULL`);

    await queryRunner.query(`
      CREATE TABLE "providers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid,
        "display_name" varchar NOT NULL,
        "professional_reference" varchar,
        "status" "provider_status_enum" NOT NULL DEFAULT 'PENDING',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_providers" PRIMARY KEY ("id"),
        CONSTRAINT "FK_providers_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_providers_user_id" ON "providers" ("user_id") WHERE "user_id" IS NOT NULL`);

    await queryRunner.query(`
      CREATE TABLE "organisations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar NOT NULL,
        "public_code" varchar NOT NULL,
        "status" "organisation_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_organisations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_organisations_public_code" UNIQUE ("public_code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "health_check_packages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" varchar NOT NULL,
        "name" varchar NOT NULL,
        "description" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_health_check_packages" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_health_check_packages_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "fulfilment_modes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" varchar NOT NULL,
        "name" varchar NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_fulfilment_modes" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_fulfilment_modes_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "bookings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "booking_reference" varchar NOT NULL,
        "booker_user_id" uuid NOT NULL,
        "participant_patient_id" uuid NOT NULL,
        "organisation_context_id" uuid,
        "health_check_package_id" uuid NOT NULL,
        "fulfilment_mode_id" uuid NOT NULL,
        "status" "booking_status_enum" NOT NULL DEFAULT 'DRAFT',
        "quoted_amount" numeric(12,2),
        "currency" char(3),
        "preferred_date" date,
        "preferred_time_window_start" time,
        "preferred_time_window_end" time,
        "preferred_location_note" text,
        "scheduled_starts_at" timestamptz,
        "scheduled_ends_at" timestamptz,
        "cancellation_reason" text,
        "expires_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bookings" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_bookings_booking_reference" UNIQUE ("booking_reference"),
        CONSTRAINT "CHK_bookings_quoted_amount_non_negative" CHECK ("quoted_amount" IS NULL OR "quoted_amount" >= 0),
        CONSTRAINT "CHK_bookings_currency_format" CHECK ("currency" IS NULL OR "currency" ~ '^[A-Z]{3}$'),
        CONSTRAINT "CHK_bookings_preferred_time_window" CHECK ("preferred_time_window_start" IS NULL OR "preferred_time_window_end" IS NULL OR "preferred_time_window_end" > "preferred_time_window_start"),
        CONSTRAINT "FK_bookings_booker_user" FOREIGN KEY ("booker_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_bookings_participant_patient" FOREIGN KEY ("participant_patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_bookings_organisation_context" FOREIGN KEY ("organisation_context_id") REFERENCES "organisations"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_bookings_health_check_package" FOREIGN KEY ("health_check_package_id") REFERENCES "health_check_packages"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_bookings_fulfilment_mode" FOREIGN KEY ("fulfilment_mode_id") REFERENCES "fulfilment_modes"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_bookings_participant_created_at" ON "bookings" ("participant_patient_id", "created_at" DESC)`);
    await queryRunner.query(`CREATE INDEX "IDX_bookings_booker_created_at" ON "bookings" ("booker_user_id", "created_at" DESC)`);
    await queryRunner.query(`CREATE INDEX "IDX_bookings_status_preferred_date" ON "bookings" ("status", "preferred_date")`);

    await queryRunner.query(`
      CREATE TABLE "booking_status_history" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "booking_id" uuid NOT NULL,
        "from_status" "booking_status_enum",
        "to_status" "booking_status_enum" NOT NULL,
        "actor_user_id" uuid,
        "reason_code" varchar,
        "reason_note" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_booking_status_history" PRIMARY KEY ("id"),
        CONSTRAINT "FK_booking_status_history_booking" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_booking_status_history_actor_user" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_booking_status_history_booking_created_at" ON "booking_status_history" ("booking_id", "created_at" DESC)`);

    await queryRunner.query(`
      CREATE TABLE "booking_funding" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "booking_id" uuid NOT NULL,
        "source_type" "booking_funding_source_type_enum" NOT NULL,
        "responsible_user_id" uuid,
        "responsible_organisation_id" uuid,
        "amount" numeric(12,2),
        "percentage" numeric(5,2),
        "currency" char(3) NOT NULL,
        "status" "booking_funding_status_enum" NOT NULL DEFAULT 'PENDING',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_booking_funding" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_booking_funding_responsible_party" CHECK ("responsible_user_id" IS NULL OR "responsible_organisation_id" IS NULL),
        CONSTRAINT "CHK_booking_funding_source_party_type" CHECK (("source_type" = 'ORGANISATION' AND "responsible_organisation_id" IS NOT NULL AND "responsible_user_id" IS NULL) OR ("source_type" IN ('SELF', 'FAMILY', 'SPONSOR') AND "responsible_user_id" IS NOT NULL AND "responsible_organisation_id" IS NULL) OR "source_type" = 'OTHER'),
        CONSTRAINT "CHK_booking_funding_amount_non_negative" CHECK ("amount" IS NULL OR "amount" >= 0),
        CONSTRAINT "CHK_booking_funding_percentage_range" CHECK ("percentage" IS NULL OR ("percentage" > 0 AND "percentage" <= 100)),
        CONSTRAINT "CHK_booking_funding_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$'),
        CONSTRAINT "FK_booking_funding_booking" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_booking_funding_responsible_user" FOREIGN KEY ("responsible_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_booking_funding_responsible_organisation" FOREIGN KEY ("responsible_organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_booking_funding_booking_status" ON "booking_funding" ("booking_id", "status")`);

    await queryRunner.query(`
      CREATE TABLE "payment_attempts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "booking_funding_id" uuid NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "currency" char(3) NOT NULL,
        "status" "payment_attempt_status_enum" NOT NULL DEFAULT 'CREATED',
        "idempotency_key" varchar NOT NULL,
        "provider_code" varchar,
        "provider_reference" varchar,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payment_attempts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payment_attempts_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "CHK_payment_attempts_amount_non_negative" CHECK ("amount" >= 0),
        CONSTRAINT "CHK_payment_attempts_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$'),
        CONSTRAINT "FK_payment_attempts_booking_funding" FOREIGN KEY ("booking_funding_id") REFERENCES "booking_funding"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_payment_attempts_funding_status" ON "payment_attempts" ("booking_funding_id", "status")`);

    await queryRunner.query(`
      CREATE TABLE "payment_transactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "payment_attempt_id" uuid,
        "parent_transaction_id" uuid,
        "transaction_type" "payment_transaction_type_enum" NOT NULL,
        "status" "payment_transaction_status_enum" NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "currency" char(3) NOT NULL,
        "provider_reference" varchar,
        "occurred_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payment_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_payment_transactions_amount_non_negative" CHECK ("amount" >= 0),
        CONSTRAINT "CHK_payment_transactions_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$'),
        CONSTRAINT "FK_payment_transactions_payment_attempt" FOREIGN KEY ("payment_attempt_id") REFERENCES "payment_attempts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_payment_transactions_parent_transaction" FOREIGN KEY ("parent_transaction_id") REFERENCES "payment_transactions"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_payment_transactions_attempt_status" ON "payment_transactions" ("payment_attempt_id", "status")`);

    await queryRunner.query(`
      CREATE TABLE "provider_assignments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "booking_id" uuid NOT NULL,
        "provider_id" uuid NOT NULL,
        "status" "provider_assignment_status_enum" NOT NULL,
        "offered_at" timestamptz NOT NULL,
        "responded_at" timestamptz,
        "accepted_at" timestamptz,
        "confirmed_at" timestamptz,
        "expires_at" timestamptz,
        "reason_code" varchar,
        "reason_note" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_provider_assignments" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_provider_assignments_time_order" CHECK ("responded_at" IS NULL OR "responded_at" >= "offered_at"),
        CONSTRAINT "FK_provider_assignments_booking" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_provider_assignments_provider" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_provider_assignments_booking_status" ON "provider_assignments" ("booking_id", "status")`);
    await queryRunner.query(`CREATE INDEX "IDX_provider_assignments_provider_id" ON "provider_assignments" ("provider_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_provider_assignments_confirmed_booking" ON "provider_assignments" ("booking_id") WHERE "status" = 'CONFIRMED'`);

    await queryRunner.query(`
      CREATE TABLE "provider_assignment_history" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "provider_assignment_id" uuid NOT NULL,
        "from_status" "provider_assignment_status_enum",
        "to_status" "provider_assignment_status_enum" NOT NULL,
        "actor_user_id" uuid,
        "reason_code" varchar,
        "reason_note" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_provider_assignment_history" PRIMARY KEY ("id"),
        CONSTRAINT "FK_provider_assignment_history_assignment" FOREIGN KEY ("provider_assignment_id") REFERENCES "provider_assignments"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_provider_assignment_history_actor_user" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_provider_assignment_history_assignment_created_at" ON "provider_assignment_history" ("provider_assignment_id", "created_at" DESC)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "provider_assignment_history"');
    await queryRunner.query('DROP TABLE "provider_assignments"');
    await queryRunner.query('DROP TABLE "payment_transactions"');
    await queryRunner.query('DROP TABLE "payment_attempts"');
    await queryRunner.query('DROP TABLE "booking_funding"');
    await queryRunner.query('DROP TABLE "booking_status_history"');
    await queryRunner.query('DROP TABLE "bookings"');
    await queryRunner.query('DROP TABLE "fulfilment_modes"');
    await queryRunner.query('DROP TABLE "health_check_packages"');
    await queryRunner.query('DROP TABLE "organisations"');
    await queryRunner.query('DROP TABLE "providers"');
    await queryRunner.query('DROP TABLE "patients"');
    await queryRunner.query('DROP TABLE "users"');
    await queryRunner.query('DROP TYPE "provider_assignment_status_enum"');
    await queryRunner.query('DROP TYPE "payment_transaction_status_enum"');
    await queryRunner.query('DROP TYPE "payment_transaction_type_enum"');
    await queryRunner.query('DROP TYPE "payment_attempt_status_enum"');
    await queryRunner.query('DROP TYPE "booking_funding_status_enum"');
    await queryRunner.query('DROP TYPE "booking_funding_source_type_enum"');
    await queryRunner.query('DROP TYPE "booking_status_enum"');
    await queryRunner.query('DROP TYPE "organisation_status_enum"');
    await queryRunner.query('DROP TYPE "provider_status_enum"');
    await queryRunner.query('DROP TYPE "patient_status_enum"');
    await queryRunner.query('DROP TYPE "user_status_enum"');
  }
}
