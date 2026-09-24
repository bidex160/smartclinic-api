import { MigrationInterface, QueryRunner } from 'typeorm';
export class ProviderGrowthInvites1796313600000 implements MigrationInterface{
 name='ProviderGrowthInvites1796313600000';
 async up(q:QueryRunner):Promise<void>{
  await q.query(`CREATE TYPE "provider_growth_invite_status_enum" AS ENUM ('INVITED','CLAIMED','ACTIVATED','EXPIRED','CANCELLED')`);
  await q.query(`CREATE TABLE "provider_growth_invites"(
   "id" uuid NOT NULL DEFAULT uuid_generate_v4(),"reference" varchar(32) NOT NULL,"token_hash" varchar(64) NOT NULL,
   "inviter_user_id" uuid NOT NULL,"target_type" "referral_target_type_enum" NOT NULL,
   "business_name" varchar(180) NOT NULL,"contact_name" varchar(160),"email" varchar(254),"phone" varchar(40),
   "country_code" char(2) NOT NULL,"state_or_region" varchar(120) NOT NULL,"city" varchar(120) NOT NULL,"address" text,
   "status" "provider_growth_invite_status_enum" NOT NULL DEFAULT 'INVITED',"referred_provider_id" uuid,
   "referrer_share_bps" smallint NOT NULL DEFAULT 100,"claimed_at" timestamptz,"activated_at" timestamptz,
   "created_at" timestamptz NOT NULL DEFAULT now(),"updated_at" timestamptz NOT NULL DEFAULT now(),
   CONSTRAINT "PK_provider_growth_invites" PRIMARY KEY("id"),CONSTRAINT "UQ_provider_growth_invites_reference" UNIQUE("reference"),
   CONSTRAINT "UQ_provider_growth_invites_token_hash" UNIQUE("token_hash"),
   CONSTRAINT "CHK_provider_growth_invites_share" CHECK("referrer_share_bps">=0 AND "referrer_share_bps"<=1000),
   CONSTRAINT "FK_provider_growth_invites_inviter" FOREIGN KEY("inviter_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
   CONSTRAINT "FK_provider_growth_invites_provider" FOREIGN KEY("referred_provider_id") REFERENCES "providers"("id") ON DELETE SET NULL
  )`);
  await q.query(`CREATE INDEX "IDX_provider_growth_invites_inviter_status" ON "provider_growth_invites"("inviter_user_id","status")`);
  await q.query(`CREATE TABLE "provider_referral_commission_ledger"(
   "id" uuid NOT NULL DEFAULT uuid_generate_v4(),"invite_id" uuid NOT NULL,"referrer_user_id" uuid NOT NULL,
   "provider_id" uuid NOT NULL,"earning_id" uuid NOT NULL,"currency" char(3) NOT NULL,"eligible_amount_minor" bigint NOT NULL,
   "share_bps" smallint NOT NULL,"amount_minor" bigint NOT NULL,"status" varchar(20) NOT NULL DEFAULT 'HELD',
   "created_at" timestamptz NOT NULL DEFAULT now(),"payable_at" timestamptz,
   CONSTRAINT "PK_provider_referral_commission_ledger" PRIMARY KEY("id"),CONSTRAINT "UQ_provider_referral_commission_earning" UNIQUE("earning_id","invite_id"),
   CONSTRAINT "CHK_provider_referral_commission_money" CHECK("eligible_amount_minor">=0 AND "amount_minor">=0),
   CONSTRAINT "FK_provider_referral_commission_invite" FOREIGN KEY("invite_id") REFERENCES "provider_growth_invites"("id") ON DELETE RESTRICT,
   CONSTRAINT "FK_provider_referral_commission_referrer" FOREIGN KEY("referrer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
   CONSTRAINT "FK_provider_referral_commission_provider" FOREIGN KEY("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT,
   CONSTRAINT "FK_provider_referral_commission_earning" FOREIGN KEY("earning_id") REFERENCES "provider_earnings"("id") ON DELETE RESTRICT
  )`);
  await q.query(`CREATE INDEX "IDX_provider_referral_commission_referrer" ON "provider_referral_commission_ledger"("referrer_user_id","status","currency")`);
 }
 async down(q:QueryRunner):Promise<void>{await q.query('DROP TABLE "provider_referral_commission_ledger"');await q.query('DROP TABLE "provider_growth_invites"');await q.query('DROP TYPE "provider_growth_invite_status_enum"');}
}