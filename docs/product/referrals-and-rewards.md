# Referrals and rewards

SmartClinic referral codes are stable, server-generated identifiers such as `SC-AB12CD`. They are case-normalized, non-sequential, and never authorize account, booking, payment, provider, or clinical-data access.

Level 1 supports direct referrals only:

- 10 qualified patients
- 2 qualified clinics
- 2 qualified laboratories
- 2 qualified pharmacies

Referral destinations are represented by frontend-relative links:

- Patient: `/register?ref=CODE`
- Clinic: `/provider/register?ref=CODE&type=CLINIC`
- Laboratory: `/provider/register?ref=CODE&type=LABORATORY`
- Pharmacy: `/provider/register?ref=CODE&type=PHARMACY`

The URL type is display/navigation context, not classification proof. Provider qualification uses the persisted provider type: `CLINIC` maps to Clinic, `DIAGNOSTIC_CENTRE` maps to Laboratory, and `PHARMACY` maps to Pharmacy. Individual and Other providers are not qualified referral targets.

An explicit malformed, unknown, inactive, self, or conflicting referral code rejects registration. Existing accounts cannot be claimed retroactively. Registration creates a `REGISTERED` direct referral and awards no points.

A patient referral becomes `QUALIFIED` after that Patient's first completed Health Check encounter. Provider referrals qualify only after onboarding is approved and the non-deleted Provider is operationally `ACTIVE` with the authoritative matching provider type. Qualification is historical and happens once; later provider status changes do not automatically revoke it.

Reward amounts come from active `reward_rules`, while the awarded amount is snapshotted as an append-only `reward_points_ledger` entry. Unique business event keys, referral locking, referrer locking, and database uniqueness prevent duplicate referral credits and Level 1 bonuses. Level requirements live in `reward_level_definitions` and `reward_level_requirements`; achievement is persisted once in `reward_level_achievements`.

`GET /api/v1/me/referrals` returns the member's code, relative links, ledger-derived balance, direct-referral totals, and aggregate Level 1 progress. `GET /api/v1/me/referrals/history` returns only target/status/timestamps/points and no referred Patient health information. Provider dashboards include the same safe reward summary through their linked User. Admin/Operations use `GET /api/v1/admin/referrals` and aggregate dashboard metrics.

`reward_conversion_rates` provides a configurable points-to-currency concept without assuming points equal Naira. No rate is seeded until the business approves one. Cash withdrawals, point reservation, bank/Paystack transfers, reward-funded booking credits, mixed reward/Paystack funding, Level 2/downlines, fraud reversals, and retroactive referral claiming are deferred. A future withdrawal domain must use `REQUESTED → PROCESSING → PAID/FAILED/CANCELLED`, reserve points while outstanding, and snapshot the conversion rate. A future Health Check redemption must integrate with `BookingFunding` without mutating historical ledger entries.
