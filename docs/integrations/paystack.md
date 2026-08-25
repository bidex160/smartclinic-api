# Paystack integration

Select Paystack explicitly with `PAYMENT_PROVIDER=paystack`. Production additionally requires `PAYSTACK_SECRET_KEY`; the optional callback URL is sent only during transaction initialization. `PAYSTACK_PUBLIC_KEY` is reserved for a future frontend checkout design and is not currently used or returned.

The backend initializes `/transaction/initialize` with payer email, the server-authoritative funding amount converted to subunits, currency, a unique `SC-PAY-...` reference, and minimal booking-reference metadata. Only the hosted authorization URL is exposed to the public client.

The webhook endpoint is `/api/v1/payments/paystack/webhook`. It requires `x-paystack-signature`, calculated as HMAC-SHA512 over the exact raw body using the secret key. A signed `charge.success` is independently checked through `/transaction/verify/:reference`; only verified `success` with matching reference, amount, and currency settles funding. Retries are idempotent through attempt/transaction uniqueness and transactional status checks.

The signed webhook is the preferred confirmation path. A guest may read SmartClinic's authoritative state with `GET /api/v1/public/bookings/:reference/payment-status` and deliberately request server-side recovery verification with `POST /api/v1/public/bookings/:reference/payment-status/refresh`; both require the session bound to that booking. Refresh never accepts a reference, amount, or currency from the browser and is throttled durably by `payment_attempts.last_verified_at` and `PAYMENT_VERIFICATION_MIN_INTERVAL_SECONDS`.

Authenticated registered patients use the equivalent `/api/v1/me/health-checks/:reference/payment` status and `/verify` routes after USER → SELF Patient → booking-participant authorization. `PAYSTACK_PATIENT_CALLBACK_URL` can point browser returns at the patient portal; otherwise the existing callback base is retained. The application selects the callback and the Paystack adapter receives only a complete provider-neutral callback URL. Neither callback parameters nor browser state settle a booking.

Status mapping is conservative: `success` maps to `SUCCEEDED`; `failed` maps to `FAILED`; `abandoned` and `reversed` map to `CANCELLED`; `pending`, `processing`, `ongoing`, `queued`, and unknown statuses map to `PENDING_CONFIRMATION`. Only `SUCCEEDED` settles funding.

Callback redirects, refunds, subscriptions, transfers, raw event retention, and scheduled reconciliation jobs are not implemented. A callback or its query parameters must never be treated as proof of payment.
