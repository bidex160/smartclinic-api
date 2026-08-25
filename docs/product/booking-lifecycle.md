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

In the normal automatic-matching path, provider acceptance finalizes and schedules the work atomically: assignment history records `OFFERED → ACCEPTED → CONFIRMED`, reservation capacity becomes `CONFIRMED`, and booking history records `PENDING_PROVIDER_MATCH → PROVIDER_ASSIGNED → SCHEDULED`. `ACCEPTED` remains an auditable intermediate assignment event, not an operations queue state. Encounter start continues to require the resulting `SCHEDULED` booking and the owning confirmed assignment.

Automatic provider acceptance now crosses the scheduling boundary after revalidation. Only the authenticated Provider owning the confirmed assignment may then start the encounter, moving `SCHEDULED` to `IN_PROGRESS` with history. Encounter completion requires all six structured measurements and atomically moves the booking from `IN_PROGRESS` to `COMPLETED` with history. The direct `PROVIDER_ASSIGNED → IN_PROGRESS` shortcut remains invalid.

## Rejection and failure handling

Provider rejection is not normally a booking rejection: it records a declined provider offer and returns the booking to `PENDING_PROVIDER_MATCH`. If matching cannot find a suitable provider, the booking moves to `UNFULFILLABLE`, not automatically to `CANCELLED`. Operations may later retry matching, change fulfilment details, or cancel it in line with policy.

In the implemented sequential workflow, verified payment moves the booking to `PENDING_PROVIDER_MATCH` and triggers matching after settlement commits. Matching never starts from `DRAFT` or `AWAITING_FUNDING`. Provider acceptance records the assignment-level `ACCEPTED` event and automatically proceeds to `CONFIRMED` and `SCHEDULED`. Decline and processed offer expiry automatically try the next eligible provider. Exhausting eligible providers moves the booking to `UNFULFILLABLE`, never `CANCELLED`.

Funding rejection or payment failure is likewise not a booking state. It updates the funding summary and leaves the booking in `AWAITING_FUNDING` until paid, re-funded, cancelled, or expired.

The implemented self-funded v1 flow initialises exactly one quote-backed `SELF` obligation while moving `DRAFT → AWAITING_FUNDING`. A provider-verified successful collection atomically settles that obligation and moves `AWAITING_FUNDING → PENDING_PROVIDER_MATCH`; a failed attempt leaves both funding and booking awaiting payment. Repeated initialisation and confirmation do not duplicate lifecycle transitions.

The operational matching queue is a read-only projection over booking, settled funding, scheduling context, and the latest assignment. Its readiness labels are not persisted lifecycle states. The default queue is oldest-funded `PENDING_PROVIDER_MATCH` first, but READY now means recoverable/eligible matching context rather than a mandatory human start action. Operations use the queue for active offers, accepted confirmation, `UNFULFILLABLE` retry, and exceptional intervention.

The admin booking-detail endpoint is also read-only. It summarizes current lifecycle, funding, latest payment, and latest assignment state without returning the underlying histories or changing any status.

## Configurable operating policies

Cancellation, rescheduling, no-show, expiry, and refund outcomes are policy concerns, not additional hardcoded lifecycle rules. When the relevant modules are implemented, policies can define permitted actors, cut-off times, fees, refund eligibility, rescheduling limits, no-show handling, and required operational approval. A policy decision may cause a documented state transition, but it must not be inferred solely from the state name.

## History and auditability

The current booking state is appropriately an enum because it represents one mutually exclusive fulfilment position. It must be accompanied by an append-only relational booking transition history containing at least prior state, new state, actor or system source, timestamp, and reason where applicable. The history is necessary for auditability and must not be reconstructed from mutable timestamps.

## Quote snapshot

Creating a booking resolves an active, effective catalogue price server-side for its package and fulfilment mode, then stores the selected amount and currency on the booking. The snapshot is part of the creation transaction and is retained for historical accuracy; changing or retiring a catalogue price never changes an existing booking's quote. A booking cannot be created when no eligible v1 `NGN` price is available.

## Preferred scheduling context

A new bookable Health Check requires a preferred date, appointment start time, and IANA timezone such as `Africa/Lagos`. The patient does not select an end time. Matching derives the appointment end from the selected package's positive `estimated_duration_minutes`; a missing/invalid catalogue duration is a configuration error and prevents matching. The legacy nullable `preferred_time_to` column remains for compatibility but is not matching authority for new bookings. Date and time values are local to `preferred_timezone`, not server-local or UTC timestamps.

This complete scheduling context can be transformed into provider-availability discovery input. Existing development rows may retain a null timezone, but an incomplete scheduling context produces an explicit “not ready for availability matching” result rather than an assumed zone.

Provider acceptance uses the preferred context to create a `HELD` provider-capacity reservation. Operations assignment confirmation promotes that reservation to `CONFIRMED` while advancing the booking to `PROVIDER_ASSIGNED`. Scheduling records a separate confirmed local date, time range, IANA timezone, actor and timestamp without overwriting the preference. The command revalidates capability, weekly availability, exceptions and capacity; it transactionally reconciles the confirmed reservation to the final appointment window. PostgreSQL's active-reservation exclusion constraint prevents a conflicting replacement.

Operational cancellation is available only to authenticated `ADMIN` and `OPERATIONS` users. It rejects `COMPLETED`, already `CANCELLED`, and `EXPIRED` bookings; expiry is treated as a distinct terminal outcome rather than relabelled as cancellation. Cancellation atomically moves the booking to `CANCELLED`, closes any `OFFERED`, `ACCEPTED`, or `CONFIRMED` assignment, appends both histories, and marks active reservations `CANCELLED`. Payment reversal and refund policy remain separate and deferred.

Operational rescheduling that returns a booking to matching accepts a new local date, start time, and IANA timezone; its matching interval is again derived from package duration. `DRAFT` and `AWAITING_FUNDING` remain in their funding lifecycle state. Other eligible states return to `PENDING_PROVIDER_MATCH`; current offers or assignments are cancelled and held/confirmed reservations become `RELEASED`. The existing provider is not assumed available at the new time and matching is not restarted automatically. `IN_PROGRESS` and terminal bookings cannot be rescheduled. Formal appointment scheduling remains distinct and continues to store explicit confirmed start and end times.

`booking_status_history` supports a same-status row with the `BOOKING_RESCHEDULED` reason code when schedule context changes without a status transition. This is the current audit representation; a richer general booking-event log may replace it later.

For `PROVIDER_LOCATION`, scheduling requires an active location owned by the confirmed provider and linked to the exact package/mode capability. Matching resolves multiple compatible branches by stable creation-time/ID order and persists the selected branch on the held reservation. For `HOME_VISIT`, the confirmed provider location remains null and structured visit-address/service-area coverage is revalidated. `preferred_location_note` is supplemental free text, never matching geography.

Both supported fulfilment modes require a structured `visitAddress`. For HOME_VISIT it is the service destination. For PROVIDER_LOCATION it is the patient origin used to choose a compatible physical branch; the selected ProviderLocation is preserved separately as the confirmed appointment destination. Coordinates remain optional and unused by v1 matching.

## Decisions required before entities

- Is funding always required before matching, or may approved organisation programmes or selected pay-later journeys match first?
- What are the configurable cancellation, rescheduling, no-show, expiry, and refund policies?
- What matching threshold or operational decision moves a booking to `UNFULFILLABLE`?
- Can a completed booking be corrected, reopened, or disputed, and by whom?
- Are staff allowed to override every transition, and what approval/audit requirements apply?
