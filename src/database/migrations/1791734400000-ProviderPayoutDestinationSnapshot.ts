import { MigrationInterface, QueryRunner } from 'typeorm';
export class ProviderPayoutDestinationSnapshot1791734400000 implements MigrationInterface {
  name = 'ProviderPayoutDestinationSnapshot1791734400000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "provider_payouts" ADD "provider_payout_account_id" uuid`);
    await q.query(`ALTER TABLE "provider_payouts" ADD "destination_snapshot" jsonb`);
    await q.query(`ALTER TABLE "provider_payouts" ADD CONSTRAINT "CHK_provider_payouts_destination_snapshot" CHECK ("destination_snapshot" IS NULL OR jsonb_typeof("destination_snapshot") = 'object')`);
    await q.query(`ALTER TABLE "provider_payouts" ADD CONSTRAINT "FK_provider_payouts_payout_account" FOREIGN KEY ("provider_payout_account_id") REFERENCES "provider_payout_accounts"("id") ON DELETE RESTRICT`);
    await q.query(`CREATE INDEX "IDX_provider_payouts_payout_account" ON "provider_payouts"("provider_payout_account_id") WHERE "provider_payout_account_id" IS NOT NULL`);
  }
  async down(q: QueryRunner): Promise<void> { await q.query(`DROP INDEX "IDX_provider_payouts_payout_account"`); await q.query(`ALTER TABLE "provider_payouts" DROP CONSTRAINT "FK_provider_payouts_payout_account"`); await q.query(`ALTER TABLE "provider_payouts" DROP CONSTRAINT "CHK_provider_payouts_destination_snapshot"`); await q.query(`ALTER TABLE "provider_payouts" DROP COLUMN "destination_snapshot"`); await q.query(`ALTER TABLE "provider_payouts" DROP COLUMN "provider_payout_account_id"`); }
}
