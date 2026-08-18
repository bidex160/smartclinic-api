# Booking Lifecycle

## Why booking, payment, and matching are separate

The supplied draft lifecycle includes `PENDING_PAYMENT`, `PAYMENT_CONFIRMED`, `PENDING_PROVIDER_MATCH`, `PROVIDER_ASSIGNED`, and `PROVIDER_ACCEPTED`. Those are useful business milestones, but payment and provider decisions have independent retries, failures, and histories. For example, a provider can decline while the booking remains viable, and a payment can be refunded after a completed booking is corrected or cancelled.

The proposed model therefore keeps a concise booking lifecycle, while deriving funding and matching summaries from their own domains. API responses may present all three summaries together for usability; this does not make them one state machine.

## Proposed booking lifecycle

```text
DRAFT
  → AWAITING_FUNDING
  → PENDING_PROVIDER_MATCH
  → PROVIDER_ASSIGNED
  → SCHEDULED
  → IN_PROGRESS
  → COMPLETED

Non-terminal paths:
DRAFT / AWAITING_FUNDING / PENDING_PROVIDER_MATCH / PROVIDER_ASSIGNED / SCHEDULED
  → CANCELLED

AWAITING_FUNDING → EXPIRED
PENDING_PROVIDER_MATCH → EXPIRED             (only if a configured booking expiry policy applies)
PROVIDER_ASSIGNED → PENDING_PROVIDER_MATCH  (provider declines or offer expires)
SCHEDULED → PENDING_PROVIDER_MATCH           (provider withdraws before service, if rematching is allowed)
PENDING_PROVIDER_MATCH → UNFULFILLABLE
UNFULFILLABLE → PENDING_PROVIDER_MATCH       (operations retry or change fulfilment details)
UNFULFILLABLE → CANCELLED
```

`PROVIDER_ASSIGNED` means an assignment has been accepted and is active. The more tentative stages—finding a candidate and waiting for a response—belong to the provider-assignment lifecycle. This avoids treating an unaccepted provider offer as a confirmed appointment.

| Booking state | Meaning | Who may transition it | Important rules | Representation |
| --- | --- | --- | --- | --- |
| `DRAFT` | A proposed booking not yet submitted for funding or fulfilment. | Booker; authorised staff acting for the booker. | Editable while draft. It must identify a participant and requested service before submission. | Enum on booking; transition history record. |
| `AWAITING_FUNDING` | Submitted booking awaiting settlement, sponsorship confirmation, or organisation funding confirmation. | Booking service after submission; Payments, Sponsorships, or Organisations domain through an explicit application action. | No matching starts until funding is sufficient under the chosen policy. Payment failure does not by itself cancel the booking. | Enum on booking; transition history record. |
| `PENDING_PROVIDER_MATCH` | Funding requirement is satisfied and the booking is ready for matching. | Booking service after funding confirmation; authorised operations staff for approved exceptions/rematching. | Requires a valid participant, package, location, and requested time. It is not a provider-offer state. | Enum on booking; transition history record. |
| `PROVIDER_ASSIGNED` | A provider has accepted an active assignment for the booking. | Matching service after provider acceptance; authorised operations staff for a manual assignment. | Exactly one active assignment should be allowed unless a later multi-provider model is approved. | Enum on booking; transition history record. |
| `SCHEDULED` | Appointment details are confirmed and the service is expected to occur. | Booking/matching service after confirmed assignment and schedule; authorised operations staff. | Requires an active accepted provider assignment. A provider withdrawal may return the booking to matching if policy permits. | Enum on booking; transition history record. |
| `IN_PROGRESS` | Service delivery has started. | Assigned provider or authorised operations staff. | Requires a scheduled booking and active assignment. Define whether a check-in or provider action starts it. | Enum on booking; transition history record. |
| `COMPLETED` | The booked service is complete. | Assigned provider or authorised operations staff. | Requires in-progress service; define whether submitted results are required before completion. Terminal for fulfilment, not necessarily for payments/refunds. | Enum on booking; transition history record. |
| `CANCELLED` | The booking has been deliberately cancelled. | Booker within cancellation policy; sponsor/organisation only within defined authority; provider/operations through an explicit cancellation action. | Capture actor, reason, and cancellation time. Determine refund separately in Payments. | Enum on booking; transition history record. |
| `EXPIRED` | The booking lapsed without a required action by its configured expiry deadline. | System automation; authorised operations staff for exceptional expiry. | Capture the policy, reason, and deadline that elapsed. Provider unavailability is represented by `UNFULFILLABLE`, not inferred as expiry. | Enum on booking; transition history record. |
| `UNFULFILLABLE` | The platform has not found a suitable provider under the current fulfilment details and matching policy. | Matching service after configured policy; authorised operations staff. | It is distinct from cancellation. Operations may retry matching, change fulfilment details, or cancel under policy. | Enum on booking; transition history record. |

The state sequence maps the earlier suggested milestones as follows: `PENDING_PAYMENT` becomes booking `AWAITING_FUNDING` plus payment/funding state; `PAYMENT_CONFIRMED` is a Payments/Sponsorships/Organisations outcome; `PENDING_PROVIDER_MATCH` remains booking state; `PROVIDER_ASSIGNED` occurs only after acceptance; and the proposed `PROVIDER_ACCEPTED` is an assignment state/event rather than a second booking state.

## Rejection and failure handling

Provider rejection is not normally a booking rejection: it records a declined provider offer and returns the booking to `PENDING_PROVIDER_MATCH`. If matching cannot find a suitable provider, the booking moves to `UNFULFILLABLE`, not automatically to `CANCELLED`. Operations may later retry matching, change fulfilment details, or cancel it in line with policy.

In the implemented sequential workflow, starting matching does not advance `DRAFT` or `AWAITING_FUNDING`; those states are rejected until the funding/lifecycle owner explicitly moves the booking to `PENDING_PROVIDER_MATCH`. Provider acceptance remains an assignment-level `ACCEPTED` state. Only operations/admin confirmation changes it to `CONFIRMED` and advances the booking, with history, to `PROVIDER_ASSIGNED`. Decline and offer expiry leave the booking pending while another eligible provider is tried. Exhausting eligible providers moves it to `UNFULFILLABLE`, never `CANCELLED`.

Funding rejection or payment failure is likewise not a booking state. It updates the funding summary and leaves the booking in `AWAITING_FUNDING` until paid, re-funded, cancelled, or expired.

## Configurable operating policies

Cancellation, rescheduling, no-show, expiry, and refund outcomes are policy concerns, not additional hardcoded lifecycle rules. When the relevant modules are implemented, policies can define permitted actors, cut-off times, fees, refund eligibility, rescheduling limits, no-show handling, and required operational approval. A policy decision may cause a documented state transition, but it must not be inferred solely from the state name.

## History and auditability

The current booking state is appropriately an enum because it represents one mutually exclusive fulfilment position. It must be accompanied by an append-only relational booking transition history containing at least prior state, new state, actor or system source, timestamp, and reason where applicable. The history is necessary for auditability and must not be reconstructed from mutable timestamps.

## Quote snapshot

Creating a booking resolves an active, effective catalogue price server-side for its package and fulfilment mode, then stores the selected amount and currency on the booking. The snapshot is part of the creation transaction and is retained for historical accuracy; changing or retiring a catalogue price never changes an existing booking's quote. A booking cannot be created when no eligible v1 `NGN` price is available.

## Preferred scheduling context

A booking may omit scheduling preference entirely. If a preferred date or either preferred time is supplied, `preferred_timezone` is required and must be an IANA timezone such as `Africa/Lagos` or `Europe/London`. Both preferred times must be supplied together and the end must be after the start. The date and time values are interpreted as local values in `preferred_timezone`; they are not server-local or UTC timestamps.

This complete scheduling context can be transformed into provider-availability discovery input. Existing development rows may retain a null timezone, but an incomplete scheduling context produces an explicit “not ready for availability matching” result rather than an assumed zone.

Provider acceptance uses the same complete context to create a `HELD` provider-capacity reservation. Operations confirmation promotes that reservation to `CONFIRMED` while advancing the booking to `PROVIDER_ASSIGNED`. A future cancellation/rescheduling workflow must release or cancel the reservation before making the provider capacity available again; cancellation policy itself remains deferred.

Location semantics remain separate: `PROVIDER_LOCATION` may later require a selected provider location or geographic preference, while `HOME_VISIT` requires a structured visit address and service-area policy. `preferred_location_note` is free text and must not be treated as a verified or routable address.

## Decisions required before entities

- Is funding always required before matching, or may approved organisation programmes or selected pay-later journeys match first?
- When does a booking become `SCHEDULED`: provider acceptance, participant confirmation, or a separate operations confirmation?
- What are the configurable cancellation, rescheduling, no-show, expiry, and refund policies?
- What matching threshold or operational decision moves a booking to `UNFULFILLABLE`?
- Can a completed booking be corrected, reopened, or disputed, and by whom?
- Are staff allowed to override every transition, and what approval/audit requirements apply?
