# Payment Model

## Boundary and responsibility

Payments are a separate domain. Bookings describe the required amount and funding outcome in provider-neutral terms; the Payments domain owns payment attempts, confirmation, refunds, reconciliation, and provider adapters. A booking must never contain a provider SDK identifier, provider-specific status, raw webhook payload, or provider-specific implementation detail.

```text
Bookings → provider-neutral Payments interface → selected provider adapter → payment provider
```

Potential adapters may be added later without changing booking business logic.

The implementation formalises this boundary as `PaymentProviderAdapter`, with provider-neutral initialize, verify, and webhook-authentication operations. Paystack is the first production-capable adapter, selected explicitly with `PAYMENT_PROVIDER=paystack`; the test adapter remains non-production-only and `none` fails closed. Booking and funding logic contain no Paystack fields, so another adapter can be added without changing those domains.

## Funding model

The person receiving care may differ from the person who books or funds it. A parent may pay for a child, a partner may pay for a family member, a person outside Nigeria may sponsor a participant in Nigeria, and an organisation may fund an eligible programme member. These are funding relationships, not assumptions based on user identity.

Mixed funding is supported. A booking is funded through one or more funding obligations/sources; it must not use a single `payerId` as its only funding model.

```text
Booking
  → BookingFunding[]     (funding obligation/source)
  → PaymentAttempt[]     (attempt to collect money)
      → PaymentTransaction[]  (recorded provider or finance movement)
```

`BookingFunding` represents an amount, source, and responsibility to fund the booking. It supports self-funded, family-funded, diaspora-sponsored, organisation-funded, mixed-funding, and future sponsored-programme journeys. `PaymentAttempt` represents a provider-neutral attempt to collect money against a funding obligation. `PaymentTransaction` records the resulting money movement or confirmed provider/finance outcome. These are separate relational records with their own identifiers and histories.

V1 implements one self-funded obligation per booking. Its amount and currency are copied exclusively from the immutable booking quote; callers cannot submit or override them. Initialisation moves `DRAFT` to `AWAITING_FUNDING` once and is safe to retry. Registered funding references a responsible user; guest funding references the same-booking `BookingContact` payer snapshot. No fake User is created.

Payment initiation snapshots the funding amount/currency into an idempotent attempt and moves it to `AWAITING_CUSTOMER_ACTION`. Verified failure marks only the attempt `FAILED`; funding stays `PENDING` and the booking stays `AWAITING_FUNDING`. Verified success creates one successful collection transaction, marks funding `SETTLED`, marks the attempt `SUCCEEDED`, and atomically advances the booking to `PENDING_PROVIDER_MATCH` with history. Only after that transaction commits does the application invoke provider matching. No-provider and matching-technical outcomes can never roll back a successful collection; the former moves the booking to `UNFULFILLABLE`, while the latter leaves the committed booking recoverable for operations retry.

Idempotency is enforced by the attempt idempotency key, unique provider-code/reference pairs, a unique non-null transaction provider reference, and transactional status checks. Repeating confirmation returns the existing successful outcome without another transaction or booking history entry.

The exact cardinality between an attempt and transactions—such as whether an attempt can create multiple transaction records for retries, captures, or refunds—remains a payment-implementation decision. It must not collapse the three concepts into one booking field.

## Two related state views

The requested booking-level terms are best represented as a **funding summary**, derived from payment and funding records, rather than as a payment-provider lifecycle enum on the booking.

| Booking funding summary | Meaning | Representation |
| --- | --- | --- |
| `UNPAID` | No confirmed funds or active payment attempt cover the obligation. | Derived value or deliberately stored projection; history derives from records. |
| `AWAITING_PAYMENT` | At least one active payment attempt is awaiting completion or confirmation. | Derived/projection. |
| `PARTIALLY_PAID` | Confirmed funds are below the amount required under booking policy. | Derived/projection from allocations. |
| `PAID` | Confirmed external payment allocations fully satisfy the required amount. | Derived/projection from allocations. |
| `SPONSORED` | An approved individual sponsorship fully satisfies the required amount. | Derived/projection from sponsorship allocation. |
| `ORGANISATION_FUNDED` | Approved programme or organisation funding fully satisfies the required amount. | Derived/projection from organisation allocation. |
| `PAYMENT_FAILED` | The latest relevant payment attempt failed and no other active attempt is pending. | Derived/projection; not terminal because retry is possible. |
| `REFUNDED` | Confirmed funds were fully returned and no other allocation satisfies the obligation. | Derived/projection from refund records. |

If more than one source contributes, a single label may hide material information. The API should expose funding allocations and an outstanding amount in addition to the summary. A deterministic precedence rule is required before persisting this as a denormalised field.

## Provider-neutral payment-attempt lifecycle

This lifecycle applies to each payment attempt, not the booking or a payment transaction.

```text
CREATED → AWAITING_CUSTOMER_ACTION → PENDING_CONFIRMATION → SUCCEEDED
                    │                         │
                    └────────→ CANCELLED      └────────→ FAILED
```

| Payment-attempt state | Meaning | Who may transition it | Important rules | Representation |
| --- | --- | --- | --- | --- |
| `CREATED` | A provider-neutral attempt has been created but no customer action has begun. | Payments service; authorised staff for an approved manual flow. | Must have a booking/funding obligation and an immutable amount/currency snapshot. | Enum on payment attempt; append-only event/history. |
| `AWAITING_CUSTOMER_ACTION` | The payer must complete a provider flow, such as authorisation or transfer. | Payments service after adapter initiation. | Expose only a safe provider-neutral next action to the API. Do not put provider credentials or raw payloads on the booking. | Enum; event/history. |
| `PENDING_CONFIRMATION` | Customer action occurred and SmartClinic awaits reliable provider confirmation or reconciliation. | Provider adapter/webhook handler; Payments reconciliation process. | Webhooks and polling must be idempotent. A client redirect alone is not proof of payment. | Enum; provider event records plus normalised history. |
| `SUCCEEDED` | The provider-confirmed amount is available for allocation. | Payments service after verified provider confirmation; authorised finance staff for reconciled offline payment. | Create an immutable allocation to the funding obligation. Repeated confirmations must not double allocate. | Enum; event/history and allocation record. |
| `FAILED` | The attempt cannot succeed as initiated. | Provider adapter/webhook handler; reconciliation process; authorised staff for validated manual failure. | A new attempt may be created. The booking can remain awaiting funding. | Enum; event/history. |
| `CANCELLED` | The attempt was abandoned before success. | Payer before completion where allowed; Payments service on booking expiry/cancellation; authorised staff. | Cannot cancel a succeeded attempt; use refund instead. | Enum; event/history. |

## Payment transactions

A payment transaction is a distinct, provider-neutral record of a provider-confirmed or finance-reconciled movement, such as a collection or refund. It is not the booking funding summary and it is not the customer's payment attempt. Transactions should be immutable financial records, linked to the relevant attempt and funding allocation, with their own normalised status/event history.

| Transaction state | Meaning | Who may transition it | Important rules | Representation |
| --- | --- | --- | --- | --- |
| `PENDING` | A recorded movement awaits provider confirmation or finance reconciliation. | Payments service; provider adapter/webhook handler; reconciliation process. | It must be idempotently linked to its source attempt or refund operation. | Enum on transaction; immutable transaction/event record. |
| `SUCCEEDED` | The movement is confirmed and can affect a funding allocation. | Payments service after verified provider confirmation; authorised finance staff for a reconciled manual movement. | Repeated confirmations must not double allocate or double refund. | Enum; immutable transaction/event record. |
| `FAILED` | The recorded movement did not complete. | Provider adapter/webhook handler; reconciliation process. | It cannot change the funding allocation. | Enum; immutable transaction/event record. |
| `PARTIALLY_REFUNDED` | A successful collection has been partly reversed through one or more successful refund transactions. | Payments service after verified refund processing. | Preserve the collection and refund records; do not rewrite the original collection. | Derived/projection from linked immutable transactions; refund history. |
| `REFUNDED` | A successful collection has been fully reversed through successful refund transactions. | Payments service after verified refund processing. | A refund does not automatically cancel fulfilment; the configured cancellation/refund policy governs booking effects. | Derived/projection from linked immutable transactions; refund history. |

Provider callbacks and reconciliation inputs should also be retained as protected relational provider-event records with provider identifiers, deduplication keys, and processing outcome.

Provider-specific SDK identifiers, statuses, raw webhook payloads, and implementation details stay within Payments and its adapter boundary. They must never be stored or interpreted by the Booking domain.

ADMIN/OPERATIONS test-management endpoints remain available outside production. Public guests may initialize funding, begin Paystack checkout, read status, and request reconciliation only with a booking-bound session cookie. A signed Paystack webhook is the primary production confirmation path. No raw webhook storage is implemented.

Public checkout initiation is now available at `POST /api/v1/public/bookings/:reference/payment/initiate` after session authorization. It initializes/reuses quote-backed funding, resolves payer email from the responsible User or guest BookingContact, generates a retry-specific `SC-PAY-...` reference, and returns only the normalized reference/status/amount/currency/checkout URL. Missing email is a business error; no address is fabricated. A registered-owner initiation route remains deferred because registered booking ownership authorization is not yet sufficiently defined.

Paystack receives amounts in currency subunits. The adapter converts decimal strings using integer arithmetic (`NGN 12500.00 → 1250000`) and never floating point. Paystack status `success` is the only success mapping; `failed`, `abandoned`, `ongoing`, `pending`, `processing`, `queued`, `reversed`, and unknown states remain non-successful until a later verified success.

`POST /api/v1/payments/paystack/webhook` authenticates the exact raw request bytes with HMAC-SHA512 and the server-only secret. `charge.success` triggers an independent `/transaction/verify/:reference` call, followed by reference, expected amount, and currency checks before the existing idempotent settlement transaction. Unsupported signed events are acknowledged without mutation; invalid signatures are rejected. Raw webhook payloads are not retained.

No callback endpoint is implemented. A browser redirect is not proof of payment; future callback/recovery UI must invoke server-side verification or rely on the signed webhook.

Guest payment status is available only to the booking-bound public session at `GET /api/v1/public/bookings/:reference/payment-status`. It reports the application booking, SELF-funding, and latest-attempt state plus the successful transaction time, without internal IDs or raw provider data. A missing attempt is represented explicitly by a null payment status.

`POST /api/v1/public/bookings/:reference/payment-status/refresh` is the deliberate recovery path after checkout. The server selects the latest attempt and its stored reference, calls the configured adapter, validates reference/amount/currency, and reuses the same transactional settlement path as the webhook. Verification is limited to once per attempt per configured minimum interval. The webhook remains the primary asynchronous confirmation mechanism; refresh is not a browser assertion of success.

## Sponsorship and organisation funding

Sponsorship and organisation commitments are not payment-provider attempts. They should be relational funding obligations/allocations with their own approval, eligibility, expiry, and amount rules. When a valid commitment is applied, it contributes to the booking funding summary. An organisation's payment to SmartClinic may itself later produce payment records, but that settlement is distinct from the member booking's funding allocation.

## Decisions required before entities

- Is full funding required before matching, and are deposits or instalments supported?
- Which currencies are supported, and can payment currency differ from booking currency?
- Who can request and approve refunds, and what refund windows apply?
- How are cash, bank transfer, invoices, or manual finance reconciliation handled, if at all?
- What immutable price, tax, discount, and exchange-rate snapshots are required at booking time?
- What should the funding summary be when a booking is funded by a mix of sources?
