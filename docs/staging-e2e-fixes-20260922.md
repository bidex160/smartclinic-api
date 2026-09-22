# Staging E2E fixes — 22 September 2026

Base: `29c0f05568a114ae50842b86f6bbd1c053eb3495` (`staging`). Local branch: `fix/staging-e2e-20260922`. These changes require deployment; they have not modified the staging database.

## Delivery eligibility

Laboratory and imaging services (`LAB_REQUEST`, `IMAGING_REQUEST`, or definitions producing `LAB_RESULT` / `IMAGING_RESULT`) cannot be requested or configured as `VIRTUAL`. Enforcement covers provider configuration create/update, care request creation, provider eligibility rechecks, and public catalogue/discovery. Existing invalid options are excluded from discovery, not silently converted into an in-person service with an invented price. An administrator must configure valid physical delivery options and geography for those providers.

## Offer expiry

The provider module now schedules offer expiry, using the existing audited matching workflow with a null system actor. Each scan processes up to 100 rows. Offers are locked and their status/expiry rechecked before changing them, so a concurrently accepted or already expired offer is skipped. Booking and held-capacity updates remain transactional. A process cannot overlap its own timer work; row rechecks protect against concurrent workers/admin runs.

- `PROVIDER_OFFER_EXPIRY_ENABLED=false` disables the worker. Otherwise it runs outside the test environment.
- `PROVIDER_OFFER_EXPIRY_INTERVAL_MS` defaults to 60000; minimum 1000.
- `PROVIDER_OFFER_TTL_MINUTES` remains unchanged.

Deploying with the worker enabled will process existing stale offers. Operators should review the backlog as part of staging deployment. No worker has been run against staging by this patch.

## Hospital billing

The companion only counts positive PENDING funding as payable. A cancelled latest fulfillment does not resurrect an older attempt. The existing wallet endpoint now excludes non-issued orders and non-accepted/latest-superseded fulfillment attempts, handles empty selections before SQL IN queries, and rejects unsafe numeric totals.

Grouped wallet settlement remains advertised as unavailable. This patch does not claim that the complete grouped wallet/dispensing/earnings/service-pass lifecycle is ready. Use individual diagnostic/prescription funding flows until that lifecycle is fully validated. In particular, the existing wallet path still needs pharmacy dispensing initialization and commission-snapshot review before it can be advertised as available.

## Module resolution

Source-root `src/...` imports have been replaced with relative imports so the compiled CommonJS application can resolve them without an undeclared runtime alias hook.

## Validation and deployment

Build and focused regression commands/results are in the accompanying E2E report. Broad-suite failures were reproduced on a clean archive of staging. No schema migration is introduced. PostgreSQL integration, concurrent multi-process operation and the deployed clinical/payment lifecycle still require staging verification.
