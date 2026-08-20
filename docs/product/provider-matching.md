# Provider Matching

## Domain boundary

Provider matching is a separate concern from the booking lifecycle. It selects and secures a capable provider for a booking after the booking is eligible for fulfilment. Matching decisions must be recorded independently because multiple providers may be considered or decline before one accepts.

## Implemented capability foundation

`ProviderService` is the stable capability record for one provider, Health Check package, and fulfilment mode. The tuple is unique; operational retirement and restoration change `is_active` rather than creating duplicate rows. A capability is eligible for discovery only when the provider has `ACTIVE` status and is not deleted, and the capability, package, and fulfilment mode are all active.

`ProviderLocation` stores a provider-owned named physical service location with a minimally structured address, uppercase ISO 3166-1 alpha-2 country code, optional validated coordinates, and active state. `provider_service_locations` links a `PROVIDER_LOCATION` capability to one or more locations. Ownership is checked by the service and enforced by composite database foreign keys. Unlinking deletes the join row because it has no independent audit meaning; provider services and locations themselves are not physically deleted during normal operations.

`ProviderAvailability` records recurring weekly blocks using a named weekday, local start/end `time`, and an IANA timezone. A block may apply to the whole provider or be scoped to a provider service and/or location. Scoped records must refer to active resources owned by the same active provider when created or activated. Overnight blocks are not supported; they must be represented as two blocks.

Active weekly blocks for the same provider, weekday, service scope, and location scope cannot overlap. Adjacent half-open intervals are allowed. The application checks this for clear conflict responses, and PostgreSQL enforces it with an exclusion constraint for concurrency safety.

One-off `provider_availability_exceptions` may be `UNAVAILABLE` or `AVAILABLE`, and may be full-day (both times null) or partial-day (both times present, start before end). They use the same optional service/location scoping and exact IANA-timezone policy as weekly availability. Within the same provider/date/service/location/timezone scope, active exception ranges may not overlap—even across types—so contradictory definitions cannot introduce implicit priority. Adjacent ranges remain valid. Operations can deactivate records rather than deleting them.

`ProviderCapabilitiesService.findEligibleProviders(packageId, modeId, window?)` performs capability discovery only. Without a window it retains capability-only behavior. With a requested date, local start/end, and explicit IANA timezone, a covering active weekly block establishes the baseline, or a covering `AVAILABLE` exception adds a one-off baseline. Any applicable full-day or overlapping partial `UNAVAILABLE` exception then removes eligibility. Finally, an overlapping `HELD` or `CONFIRMED` provider booking reservation removes the provider from the result. Inactive exceptions and released/cancelled reservations are ignored. V1 compares the exact availability timezone identifier rather than silently converting zones. Location-scoped records must use an active location linked to the matching capability. Ranking and assignment remain separate concerns.

For `PROVIDER_LOCATION`, active linked locations are included in the capability response. Physical locations cannot be linked to `HOME_VISIT`; home-visit service areas, distance/routing, offer policy, and assignment remain deferred.

Capability and location management is exposed only under `/api/v1/admin` with JWT authentication and the `ADMIN` or `OPERATIONS` role. These administrative endpoints return explicit response DTOs rather than persistence entities.

Exception management follows the same boundary at `/api/v1/admin/providers/:providerId/availability-exceptions` and `/api/v1/admin/provider-availability-exceptions/:id`. Full calendar recurrence, overnight intervals, cross-timezone conversion, and automatic holiday feeds remain deferred.

Bookings now store an optional IANA `preferredTimezone`. A focused adapter produces availability-discovery input only when date, both times, and timezone are complete; older or incomplete records return an explicit not-ready result. Availability discovery can therefore consume complete booking schedule context without assigning or ranking providers.

Location matching remains deferred. `PROVIDER_LOCATION` may require a selected provider location or geographic preference. `HOME_VISIT` will require a structured visit address and service-area logic. The free-text booking location note is not interpreted as either.

The implemented v1 approach is **hybrid**: the system discovers eligible providers while authorised operations staff initiate matching and confirm an accepted assignment. It deliberately does not rank providers or automatically make a final assignment.

## Sequential offer workflow

Matching starts only for a booking already in `PENDING_PROVIDER_MATCH`, or as an authorised retry from `UNFULFILLABLE`. `DRAFT` and `AWAITING_FUNDING` are rejected because funding/lifecycle policy has not made them matchable. Complete date, time-window, and timezone context is required.

ADMIN and OPERATIONS can inspect the read-only matching queue at `GET /api/v1/admin/bookings/matching-queue`. With no status filter it selects `PENDING_PROVIDER_MATCH` bookings whose SELF funding is `SETTLED`, ordered by `created_at ASC` then booking reference for deterministic oldest-first handling. Reading the queue never starts matching; `POST /api/v1/admin/bookings/:reference/matching/start` remains the explicit command.

Queue readiness is derived operational metadata, not a booking status. It distinguishes ready records, incomplete funding or scheduling, active offers, accepted offers awaiting confirmation, unfulfillable bookings, and already assigned bookings. Explicit status filters may inspect blocked or progressed records, but inconsistent unpaid `PENDING_PROVIDER_MATCH` development rows are excluded from the default queue and are never repaired by this read.

The current assignment is the most recently created assignment for the booking, tie-broken by assignment ID. This is sufficient for the current sequential workflow. A future matching-cycle entity would be required to distinguish separate rematching cycles or derive a reliable cycle-level `matchingStartedAt`, so that field is intentionally omitted.

ADMIN and OPERATIONS can inspect a single minimized operational record at `GET /api/v1/admin/bookings/:reference`. It uses the same latest-assignment ordering and shared readiness derivation as the queue, but adds the booker contact, quote, summarized SELF funding, latest payment attempt, and successful payment time needed to operate the booking. It does not expose histories, candidates, health data, provider credentials, or payment-provider internals.

V1 offers are sequential. Eligibility query order provides a deterministic candidate order without a ranking score. One `OFFERED`, `ACCEPTED`, or `CONFIRMED` assignment may be active in the service workflow at a time; offer creation locks the booking and rechecks active assignments. Providers previously offered the booking are excluded when selecting the next candidate.

The offer expiry is `offered_at + PROVIDER_OFFER_TTL_MINUTES`, configured through the environment. Expiry is processed by an explicit operations command for now; scheduled execution is deferred. Expiry or decline appends assignment history, leaves the booking pending, and attempts the next eligible provider. If none remains, the booking moves to `UNFULFILLABLE` with booking history; it is never automatically cancelled.

Provider acceptance changes the assignment from `OFFERED` to `ACCEPTED` but does not advance the booking. An `ADMIN` or `OPERATIONS` user confirms it separately, changing the assignment to `CONFIRMED` and the booking to `PROVIDER_ASSIGNED`. Every assignment and booking state change appends the corresponding history record.

`POST /api/v1/admin/bookings/:reference/schedule` is the separate ADMIN/OPERATIONS appointment-confirmation command. It accepts a complete local date/time/IANA-timezone window, revalidates the confirmed provider through capability, recurring availability, exception, and active-capacity discovery, reconciles the assignment's confirmed reservation, and advances `PROVIDER_ASSIGNED → SCHEDULED` with `BOOKING_SCHEDULED` history. An identical repeat is idempotent; a different repeat is a conflict and must use the rescheduling workflow.

`PROVIDER_LOCATION` scheduling additionally requires an active location owned by that provider and linked to the eligible `ProviderService`. `HOME_VISIT` rejects a provider location and still lacks structured patient-address and geographic service-area validation. Preferred booking fields remain unchanged; `scheduled_*` fields are the authoritative appointment context after scheduling.

Acceptance also creates a `HELD` capacity reservation from the booking's preferred date, complete local time window, and IANA timezone. Arbitrary client-selected reservation times are not accepted. The eligibility check is repeated before acceptance and the reservation plus assignment transition occur in one transaction. PostgreSQL rejects concurrent overlapping active reservations, so a capacity conflict leaves the assignment `OFFERED`. Operations confirmation promotes the same reservation to `CONFIRMED` transactionally with assignment and booking transitions.

`OFFERED`, `DECLINED`, and `EXPIRED` assignments hold no capacity. Booking cancellation closes actionable assignments and marks their active reservations `CANCELLED`. Rescheduling closes the old assignment and marks active reservations `RELEASED`, then requires a fresh matching cycle. Both reservation states stop blocking eligibility. Providers cannot respond to the resulting stale `CANCELLED` assignments. No direct reservation mutation API is exposed. V1 has no automatic HELD timeout separate from the accepted-assignment lifecycle.

Provider accept/decline operations are exposed under `/api/v1/provider/offers` only to authenticated users with the explicit `PROVIDER` role and an active, non-deleted `Provider.user_id` link. Provider identity is derived from authentication and is never accepted from request input. Listing and reads are ownership-scoped; an unknown or non-owned offer returns the same 404. Responses contain only the operational booking/package/schedule and minimal participant name needed for the provider decision.

After operations confirms an assignment, that same provider-authenticated boundary owns health-check capture for the booking. Encounter start/save/complete recheck the `CONFIRMED` assignment rather than trusting a provider or assignment identifier from input. Matching and assignment remain responsible only for selecting and confirming the provider; clinical measurements live in the separate Health Checks domain and are never candidate or matching data.

ADMIN/OPERATIONS manage provider onboarding at `/api/v1/admin/providers`. Providers default to `PENDING`, may be activated or suspended explicitly, and can exist without a User. Linking an existing active User grants `PROVIDER`; unlinking removes that role without deleting either record or any capability/location/availability data. Active offers, accepted/confirmed assignments, and held/confirmed reservations block unlinking so operational work cannot be orphaned. Invitation and self-registration workflows remain deferred.

`GET /api/v1/admin/users/search` helps operations select an existing account by partial normalized email or display name. Exact email and prefix matches are ordered before broader matches, with deterministic identity/ID tie-breaking and page/limit bounds. Already-linked users remain visible through a minimal `providerLink`; the search is informational only, and `POST /api/v1/admin/providers/:id/link-user` remains the explicit mutation and final eligibility authority.

For providers without an account, ADMIN/OPERATIONS create a time-limited invitation under `/api/v1/admin/providers/:providerId/invitations`. A provider-neutral email boundary attempts delivery after the invitation transaction commits; Resend is the first production adapter. Successful delivery returns `SENT` without token material; an unavailable or failed provider returns a one-time manual setup link. Public inspection validates the token without exposing IDs, and acceptance creates an ACTIVE User with `PROVIDER`, a bcrypt credential, links the unchanged Provider record, and marks the invitation accepted. Reuse, expiry, revocation, deleted/linked Providers, duplicate pending invitations, and pre-existing User emails are rejected. Successful acceptance does not log the provider in; normal login is required. Generic invitation/account-recovery workflows remain deferred.

Administrative start, confirmation, and stale-expiry commands remain protected under `/api/v1/admin`. Operations initiates and confirms matching; providers may list, accept, or decline only their own offers. Offer expiry rules remain unchanged and expired offers cannot be revived through provider routes.

Operations assignment management also exposes protected list and detail reads at `/api/v1/admin/provider-assignments`. Staff may filter by booking reference, provider, or assignment status and receive a dedicated operational projection containing assignment timestamps, booking/package/schedule state, minimal participant name, and provider display identity. It excludes funding, payments, contacts, credentials, and raw histories. Confirmation reuses the existing transactional command; an accepted provider response remains distinct from operations confirmation, and only confirmation advances the booking to `PROVIDER_ASSIGNED`.

Matching command responses are separate minimized HTTP summaries. Starting matching returns the public booking reference, booking status, `OFFER_CREATED` or `UNFULFILLABLE` outcome, and only the new assignment identifier/status/expiry when present. Stale-offer processing returns counts for expired offers, continued matching, and unfulfillable outcomes. Candidate/provider IDs, internal booking UUIDs, per-candidate results, and transition reason metadata remain inside the domain service.

Future matching may consider:

- Whether the provider offers the requested service or package.
- Service location and travel/service area.
- Provider availability for the requested time.
- Home-visit capability.
- Organisation programme requirements.
- Provider status, including whether the provider is active and eligible to receive work.

## Proposed provider-assignment lifecycle

```text
PENDING_MATCH
  → OFFERED
  → ACCEPTED
  → CONFIRMED

OFFERED → DECLINED → PENDING_MATCH
OFFERED → EXPIRED  → PENDING_MATCH
PENDING_MATCH → UNMATCHED
PENDING_MATCH / OFFERED / ACCEPTED / CONFIRMED → CANCELLED
```

`OFFERED` is the proposed-provider state; it should not be called an accepted assignment. `ACCEPTED` records a provider's affirmative response. `CONFIRMED` means the platform has made that accepted assignment active for service delivery. In a simple initial implementation, acceptance and confirmation may be performed atomically, but retaining the distinction protects the model if later operations or participant confirmation is required.

| Assignment state | Meaning | Who may transition it | Important rules | Representation |
| --- | --- | --- | --- | --- |
| `PENDING_MATCH` | The booking is eligible and no provider offer is currently awaiting response. | Matching service; authorised operations staff. | Booking must be in `PENDING_PROVIDER_MATCH` or be returning from an unsuccessful offer. | Enum on a matching request or active matching cycle; history record. |
| `OFFERED` | A provider has been invited to take the booking. | Matching service; authorised operations staff. | Offer must include a response deadline and eligibility snapshot. A provider must not receive conflicting offers beyond approved capacity. | Relational provider-offer record with enum; history/event. |
| `ACCEPTED` | The offered provider accepted. | The offered provider; authorised operations staff acting with authority. | Must be within deadline and the provider must still be eligible/available. Acceptance should be idempotent. | Offer/assignment enum; history/event. |
| `CONFIRMED` | An accepted provider assignment is active. | Matching service; authorised operations staff. | Creates the single active assignment and advances booking to `PROVIDER_ASSIGNED`. | Relational assignment record with enum; history/event. |
| `DECLINED` | The provider rejected the offer. | The offered provider; authorised operations staff. | Capture an optional reason. It does not reject the booking; matching continues. | Terminal enum for that offer; history/event. |
| `EXPIRED` | The provider did not respond by the response deadline. | System automation; authorised operations staff. | Does not reject the booking; matching continues or is escalated. | Terminal enum for that offer; history/event. |
| `UNMATCHED` | Matching ended without an acceptable provider. | Matching service after configured policy; authorised operations staff. | This is a matching result. It moves the related booking to `UNFULFILLABLE`, from which operations may retry, change fulfilment details, or cancel under policy. | Enum on matching cycle; history record. |
| `CANCELLED` | The matching cycle or active assignment ended because the booking changed or was cancelled. | Booking service; authorised operations staff. | Capture whether cancellation occurred before or after confirmation and why. | Enum; history/event. |

## Relationship to the booking lifecycle

When funding is sufficient, the booking moves to `PENDING_PROVIDER_MATCH` and a matching cycle begins in `PENDING_MATCH`. Provider decline or offer expiry remains within matching and keeps the booking in `PENDING_PROVIDER_MATCH`. An `UNMATCHED` result moves the booking to `UNFULFILLABLE`; it is not an automatic cancellation. On an active confirmed assignment, the booking advances to `PROVIDER_ASSIGNED`, then to `SCHEDULED` when appointment details are confirmed.

This intentionally replaces the ambiguous booking milestone `PROVIDER_ACCEPTED` with an assignment-level acceptance event/state. A booking-level `providerMatchingStatus` may be exposed as a read-model summary for clients, but its source of truth should be matching records and history, not a duplicated independent state machine.

## History and auditability

Matching needs relational records, not only a booking enum: a single booking can have multiple matching cycles, provider candidates, offers, declines, expiries, and reassignment actions. Each offer and assignment should preserve actor, timestamps, reason, relevant eligibility snapshot, and state-transition history. Sensitive provider and participant information must be visible only to authorised users and only at the point it is necessary.

## Remaining decisions

- What is the response deadline, and may it differ by package, location, or home visit?
- What participant details can a provider see before accepting an offer?
- Can a participant reject or change an assigned provider, and under what policy?
- Does provider acceptance immediately schedule the appointment, or is participant/operations confirmation required?
- What happens if a confirmed provider withdraws, becomes unavailable, or is suspended?
- What matching threshold or operational review moves a cycle to `UNMATCHED` and the booking to `UNFULFILLABLE`?
