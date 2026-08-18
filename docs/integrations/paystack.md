# Paystack integration

Select Paystack explicitly with `PAYMENT_PROVIDER=paystack`. Production additionally requires `PAYSTACK_SECRET_KEY`; the optional callback URL is sent only during transaction initialization. `PAYSTACK_PUBLIC_KEY` is reserved for a future frontend checkout design and is not currently used or returned.

The backend initializes `/transaction/initialize` with payer email, the server-authoritative funding amount converted to subunits, currency, a unique `SC-PAY-...` reference, and minimal booking-reference metadata. Only the hosted authorization URL is exposed to the public client.

The webhook endpoint is `/api/v1/payments/paystack/webhook`. It requires `x-paystack-signature`, calculated as HMAC-SHA512 over the exact raw body using the secret key. A signed `charge.success` is independently checked through `/transaction/verify/:reference`; only verified `success` with matching reference, amount, and currency settles funding. Retries are idempotent through attempt/transaction uniqueness and transactional status checks.

Callback redirects, refunds, subscriptions, transfers, raw event retention, and reconciliation jobs are not implemented. A callback must never be treated as proof of payment.
