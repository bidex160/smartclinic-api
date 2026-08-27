# Referrals and rewards

SmartClinic referral codes are stable, server-generated identifiers such as `SC-AB12CD`. They are case-normalized, non-sequential, and never authorize account, booking, payment, provider, or clinical-data access.

Levels 1–5 support direct referrals only. Requirements are cumulative totals, not additional referrals per level:

| Level | Patients | Clinics | Laboratories | Pharmacies |
| --- | ---: | ---: | ---: | ---: |
| Level 1 | 10 | 2 | 2 | 2 |
| Level 2 | 20 | 4 | 4 | 4 |
| Level 3 | 30 | 6 | 6 | 6 |
| Level 4 | 40 | 8 | 8 | 8 |
| Level 5 | 50 | 10 | 10 | 10 |

Only referrals made directly by the member count at every level. There are no referral trees, generations, downline counts, inherited rewards, or network commissions.

Referral destinations are represented by frontend-relative links:

- Patient: `/register?ref=CODE`
- Clinic: `/provider/register?ref=CODE&type=CLINIC`
- Laboratory: `/provider/register?ref=CODE&type=LABORATORY`
- Pharmacy: `/provider/register?ref=CODE&type=PHARMACY`

The URL type is display/navigation context, not classification proof. Provider qualification uses the persisted provider type: `CLINIC` maps to Clinic, `DIAGNOSTIC_CENTRE` maps to Laboratory, and `PHARMACY` maps to Pharmacy. Individual and Other providers are not qualified referral targets.

An explicit malformed, unknown, inactive, self, or conflicting referral code rejects registration. Existing accounts cannot be claimed retroactively. Registration creates a `REGISTERED` direct referral and awards no points.

A patient referral becomes `QUALIFIED` after that Patient's first completed Health Check encounter. Provider referrals qualify only after onboarding is approved and the non-deleted Provider is operationally `ACTIVE` with the authoritative matching provider type. Qualification is historical and happens once; later provider status changes do not automatically revoke it.

Reward amounts come from active `reward_rules`, while the awarded amount is snapshotted as an append-only `reward_points_ledger` entry. Unique business event keys, referral locking, referrer locking, and database uniqueness prevent duplicate referral credits and level bonuses. Level requirements live in `reward_level_definitions` and `reward_level_requirements`; each achievement is persisted once in `reward_level_achievements`. A member satisfying a higher threshold during reconciliation receives every missing consecutive achievement. Level-completion bonus rules exist independently and default to inactive/zero.

`GET /api/v1/me/referrals` returns the member's code, relative links, ledger-derived balance, direct-referral totals, and `levelProgress` containing the historical current level, next configured level, and next-level requirements. Legacy Level 1-shaped fields remain temporarily for additive compatibility. `GET /api/v1/me/referrals/history` returns only target/status/timestamps/points and no referred Patient health information. Provider dashboards include current/next level and next requirements. Admin dashboard metrics aggregate achievements by configured level.

Achievements are historical once earned and are not automatically downgraded if a referral is later reversed or requirements change. Current direct counts may therefore differ from historical achievement. The internal `recalculateReferralAchievements(userId)` service operation repairs missing achievements without deleting history or duplicating bonus credits. Level 5 is currently the highest configured level.

`reward_conversion_rates` provides configurable points-to-currency conversion without assuming points equal Naira. No rate is seeded until the business approves one.

## Manual cash withdrawal V1

An authenticated `USER` may create and read only their own requests through `/api/v1/me/rewards/withdrawals`. The request snapshots the active conversion rate and submitted bank details. Account numbers are masked in user responses; authorized Admin/Operations detail responses contain the snapshot required for manual transfer.

`REQUESTED` and `PROCESSING` requests reserve points and reduce `availablePoints` without a permanent ledger debit. `PAID` consumes the reservation and appends one immutable `WITHDRAWAL_PAID` debit. `FAILED` and `CANCELLED` release the reservation without compensating entries. Users may cancel only `REQUESTED` requests. Admin/Operations manage manual settlement through `/api/v1/admin/reward-withdrawals`.

Conversion uses integer minor-unit arithmetic. There is no hard-coded rate or additional V1 minimum beyond a positive point amount; withdrawal creation is unavailable until an active rate is configured. SmartClinic does not verify accounts or send funds. An operator transfers outside SmartClinic, records the external reference, and marks the request paid. Automated payouts, payout retries, downlines, fraud reversals, and retroactive claiming remain deferred.

## Health Check points redemption

Authenticated `USER` patients may preview and apply points only to a Health Check owned through their SELF Patient identity. Guests and provider-only authority cannot redeem points. The server loads the active conversion rate, booking quote, currency, and reservation-aware balance; clients submit only a positive point count. Requests exceeding either available points or the maximum useful booking value are rejected rather than clamped.

`reward_booking_redemptions` snapshots the rate and integer minor-unit value. `RESERVED` redemptions reduce `availablePoints` alongside withdrawal reservations but do not debit the ledger. A points-only redemption settles immediately, creates one `HEALTH_CHECK_REDEMPTION` debit, settles funding, and starts matching after commit. Split redemption reduces the existing SELF/Paystack obligation; Popup and Payment Link initialize for only the remaining external amount. Paystack verification consumes the reservation and settles combined funding atomically.

Failed or abandoned provider attempts retain the reservation for retry. A user may explicitly release it only while no active external attempt exists. Booking cancellation changes an active redemption to `CANCELLED` without a debit. There is currently no independent booking-expiry command; any future expiry transition must use the same release rule. Points are a funding source, not a wallet, and are never represented as Paystack transactions.
