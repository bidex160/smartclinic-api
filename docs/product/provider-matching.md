# Provider Matching

## Domain boundary

Provider matching is a separate concern from the booking lifecycle. It selects and secures a capable provider for a booking after the booking is eligible for fulfilment. Matching decisions must be recorded independently because multiple providers may be considered or decline before one accepts.

## Implemented capability foundation

`ProviderService` is the stable capability record for one provider, Health Check package, and fulfilment mode. The tuple is unique; operational retirement and restoration change `is_active` rather than creating duplicate rows. A capability is eligible for discovery only when the provider has `ACTIVE` status and is not deleted, and the capability, package, and fulfilment mode are all active.

`ProviderLocation` stores a provider-owned named physical service location with a minimally structured address, uppercase ISO 3166-1 alpha-2 country code, optional validated coordinates, and active state. `provider_service_locations` links a `PROVIDER_LOCATION` capability to one or more locations. Ownership is checked by the service and enforced by composite database foreign keys. Unlinking deletes the join row because it has no independent audit meaning; provider services and locations themselves are not physically deleted during normal operations.

`ProviderAvailability` records recurring weekly blocks using a named weekday, local start/end `time`, and an IANA timezone. A block may apply to the whole provider or be scoped to a provider service and/or location. Scoped records must refer to active resources owned by the same active provider when created or activated. Overnight blocks are not supported; they must be represented as two blocks.

Active blocks for the same provider, weekday, service scope, and location scope cannot overlap. Adjacent half-open intervals are allowed. The application checks this for clear conflict responses, and PostgreSQL enforces it with an exclusion constraint for concurrency safety. Date-specific leave, holidays, blackout dates, emergency closures, and other exceptions remain deferred.

`ProviderCapabilitiesService.findEligibleProviders(packageId, modeId, window?)` performs capability discovery only. Without a window it retains capability-only behavior. With a requested date, local start/end, and explicit IANA timezone, it requires an active weekly block where requested start is at or after block start and requested end is at or before block end. V1 compares blocks in the same timezone identifier rather than silently converting between zones. Location-scoped availability must use an active location linked to the matching capability. It does not rank, reserve, offer, assign, or schedule a provider.

For `PROVIDER_LOCATION`, active linked locations are included in the capability response. Physical locations cannot be linked to `HOME_VISIT`; home-visit service areas, distance/routing, offer policy, and assignment remain deferred.

Capability and location management is exposed only under `/api/v1/admin` with JWT authentication and the `ADMIN` or `OPERATIONS` role. These administrative endpoints return explicit response DTOs rather than persistence entities.

Bookings now store an optional IANA `preferredTimezone`. A focused adapter produces availability-discovery input only when date, both times, and timezone are complete; older or incomplete records return an explicit not-ready result. Availability discovery can therefore consume complete booking schedule context without assigning or ranking providers.

Location matching remains deferred. `PROVIDER_LOCATION` may require a selected provider location or geographic preference. `HOME_VISIT` will require a structured visit address and service-area logic. The free-text booking location note is not interpreted as either.

The implemented v1 approach is **hybrid**: the system discovers eligible providers while authorised operations staff initiate matching and confirm an accepted assignment. It deliberately does not rank providers or automatically make a final assignment.

## Sequential offer workflow

Matching starts only for a booking already in `PENDING_PROVIDER_MATCH`, or as an authorised retry from `UNFULFILLABLE`. `DRAFT` and `AWAITING_FUNDING` are rejected because funding/lifecycle policy has not made them matchable. Complete date, time-window, and timezone context is required.

V1 offers are sequential. Eligibility query order provides a deterministic candidate order without a ranking score. One `OFFERED`, `ACCEPTED`, or `CONFIRMED` assignment may be active in the service workflow at a time; offer creation locks the booking and rechecks active assignments. Providers previously offered the booking are excluded when selecting the next candidate.

The offer expiry is `offered_at + PROVIDER_OFFER_TTL_MINUTES`, configured through the environment. Expiry is processed by an explicit operations command for now; scheduled execution is deferred. Expiry or decline appends assignment history, leaves the booking pending, and attempts the next eligible provider. If none remains, the booking moves to `UNFULFILLABLE` with booking history; it is never automatically cancelled.

Provider acceptance changes the assignment from `OFFERED` to `ACCEPTED` but does not advance the booking. An `ADMIN` or `OPERATIONS` user confirms it separately, changing the assignment to `CONFIRMED` and the booking to `PROVIDER_ASSIGNED`. Every assignment and booking state change appends the corresponding history record.

Provider accept/decline operations exist at the service layer with provider ownership and expiry checks. They are not exposed over HTTP because there is no authenticated `PROVIDER` role/guard context yet. Administrative start, confirm, and stale-expiry commands are protected under `/api/v1/admin`.

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
