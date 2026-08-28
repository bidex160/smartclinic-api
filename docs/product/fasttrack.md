# FastTrack foundation

FastTrack is a paid administrative-priority service. It can reduce SmartClinic/provider administrative waiting, but it is not clinical triage, emergency prioritisation, or a guarantee that a patient will bypass a clinically determined queue. Clinical urgency always takes precedence.

FastTrack confirmation does not schedule care. SmartClinic-source FastTrack exposes an existing Care Appointment through the shared Care Request when the provider has separately scheduled one; external FastTrack remains external.

## Sources

- `SMARTCLINIC_CARE_REQUEST` is created only from an authenticated patient's owned Care Request after its exact provider offering has been accepted. Provider, service, fee, and currency are derived by the backend. It begins `READY_FOR_PAYMENT`.
- `EXTERNAL_APPOINTMENT` identifies a direct appointment with a participating SmartClinic provider. The authenticated patient supplies the provider public reference, service code, provider appointment reference and appointment date. It begins `VERIFYING`; the owning provider must verify it before payment can start.

The provider offering owns `supportsFastTrack`, `fastTrackFeeMinor`, and `fastTrackCurrency`. The fee/currency are snapshotted onto the FastTrack request and later configuration changes do not alter the request.

## Lifecycle and payment

The initial lifecycle is `VERIFYING → READY_FOR_PAYMENT → PAYMENT_PENDING → PAID → CONFIRMED`, with `REJECTED`, `CANCELLED`, and `EXPIRED` exception states. SmartClinic-originated requests skip manual verification. Payment is initialized only from `READY_FOR_PAYMENT` and uses the existing provider-neutral payment adapter and Paystack webhook verification. Browser callbacks are navigation only and never prove payment.

The payment attempt has exactly one obligation: booking funding or a FastTrack request. Provider reference, amount, currency, transaction uniqueness, and status are validated under database locks. Successful verification records one collection transaction and atomically records `PAID → CONFIRMED`. Duplicate webhook or browser verification is idempotent.

Cancellation is allowed before payment initialization. Paid cancellation/refunds are deferred because there is no general refund domain yet.

## API summary

- `POST /api/v1/me/care-requests/:reference/fasttrack`
- `POST /api/v1/me/fasttrack-requests/external`
- `GET /api/v1/me/fasttrack-requests[/:reference]`
- `POST /api/v1/me/fasttrack-requests/:reference/cancel`
- `POST|GET /api/v1/me/fasttrack-requests/:reference/funding[/initialize|/verify]`
- `GET /api/v1/provider/fasttrack-requests[/:reference]`
- `POST /api/v1/provider/fasttrack-requests/:reference/verify|reject`
- `GET /api/v1/admin/fasttrack-requests[/:reference]`
- admin `reject`, `cancel`, and `expire` commands.

Public Find Care service DTOs include only FastTrack availability and the public fee/currency. Patient/provider/admin reads remain JWT- and ownership-scoped; internal UUIDs are not request authority.

## Deferred

Clinical triage, emergency priority, guaranteed queue bypass, appointment-slot automation, external provider API verification, guest/magic-link access, post-payment refunds, wallet/organisation funding, and frontend work are not part of this foundation.
