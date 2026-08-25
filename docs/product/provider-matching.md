# Provider Matching

## Domain boundary

Provider matching is a separate concern from the booking lifecycle. It selects and secures a capable provider for a booking after the booking is eligible for fulfilment. Matching decisions must be recorded independently because multiple providers may be considered or decline before one accepts.

## Implemented capability foundation

`ProviderService` is the stable capability record for one provider, Health Check package, and fulfilment mode. The tuple is unique; operational retirement and restoration change `is_active` rather than creating duplicate rows. A capability is eligible for discovery only when the provider has `ACTIVE` status and is not deleted, and the capability, package, and fulfilment mode are all active.

`ProviderLocation` stores a provider-owned named physical service location with a minimally structured address, uppercase ISO 3166-1 alpha-2 country code, optional validated coordinates, and active state. `provider_service_locations` links a `PROVIDER_LOCATION` capability to one or more locations. Ownership is checked by the service and enforced by composite database foreign keys. Unlinking deletes the join row because it has no independent audit meaning; provider services and locations themselves are not physically deleted during normal operations.

`ProviderAvailability` records recurring weekly blocks using a named weekday, local start/end `time`, an optional `bookingStopTime`, and an IANA timezone. `bookingStopTime` is the exclusive latest time at which a new appointment may start and must satisfy `startTime < bookingStopTime <= endTime`; when null, `endTime` is the exclusive start cutoff. A start before the cutoff is eligible even when the package-derived appointment end extends beyond weekly `endTime` (the v1 “bank closing” policy). A block may apply to the whole provider or be scoped to a provider service and/or location. Scoped records must refer to active resources owned by the same active provider when created or activated. Overnight blocks are not supported.

Active weekly blocks for the same provider, weekday, service scope, and location scope cannot overlap. Adjacent half-open intervals are allowed. The application checks this for clear conflict responses, and PostgreSQL enforces it with an exclusion constraint for concurrency safety.

One-off `provider_availability_exceptions` may be `UNAVAILABLE` or `AVAILABLE`, and may be full-day (both times null) or partial-day (both times present, start before end). They use the same optional service/location scoping and exact IANA-timezone policy as weekly availability. Within the same provider/date/service/location/timezone scope, active exception ranges may not overlap—even across types—so contradictory definitions cannot introduce implicit priority. Adjacent ranges remain valid. Operations can deactivate records rather than deleting them.

Booking eligibility builds a server-side interval from the patient-selected start plus `HealthCheckPackage.estimatedDurationMinutes`. Partial `UNAVAILABLE` overlap, one-off `AVAILABLE` coverage, and active reservation overlap all use that derived interval. Client-supplied legacy preferred end values are ignored. Provider acceptance creates the HELD reservation with the same derived end, so capacity and eligibility share one authority.

`ProviderCapabilitiesService.findEligibleProviders(packageId, modeId, window?)` performs capability discovery only. Without a window it retains capability-only behavior. With a requested date, local start/end, and explicit IANA timezone, a covering active weekly block establishes the baseline, or a covering `AVAILABLE` exception adds a one-off baseline. Any applicable full-day or overlapping partial `UNAVAILABLE` exception then removes eligibility. Finally, an overlapping `HELD` or `CONFIRMED` provider booking reservation removes the provider from the result. Inactive exceptions and released/cancelled reservations are ignored. V1 compares the exact availability timezone identifier rather than silently converting zones. Location-scoped records must use an active location linked to the matching capability. Ranking and assignment remain separate concerns.

For `PROVIDER_LOCATION`, active linked locations are included in the capability response. Physical locations cannot be linked to `HOME_VISIT`; home-visit service areas, distance/routing, offer policy, and assignment remain deferred.

Capability and location management is exposed only under `/api/v1/admin` with JWT authentication and the `ADMIN` or `OPERATIONS` role. These administrative endpoints return explicit response DTOs rather than persistence entities.

Exception management follows the same boundary at `/api/v1/admin/providers/:providerId/availability-exceptions` and `/api/v1/admin/provider-availability-exceptions/:id`. Full calendar recurrence, overnight intervals, cross-timezone conversion, and automatic holiday feeds remain deferred.

Bookings now store an optional IANA `preferredTimezone`. A focused adapter produces availability-discovery input only when date, both times, and timezone are complete; older or incomplete records return an explicit not-ready result. Availability discovery can therefore consume complete booking schedule context without assigning or ranking providers.

Location matching remains deferred. `PROVIDER_LOCATION` may require a selected provider location or geographic preference. `HOME_VISIT` will require a structured visit address and service-area logic. The free-text booking location note is not interpreted as either.

The implemented v1 approach automatically starts sequential matching after verified payment settlement commits. The system discovers eligible providers and creates the first `OFFERED` assignment; provider acceptance automatically confirms and schedules valid work. Authorised operations staff handle exceptional retry/reassignment and legacy recovery. It deliberately does not rank providers.

## Sequential offer workflow

Matching starts only for a booking already in `PENDING_PROVIDER_MATCH`, or as an authorised retry from `UNFULFILLABLE`. `DRAFT` and `AWAITING_FUNDING` are rejected because funding/lifecycle policy has not made them matchable. Complete date, time-window, and timezone context is required.

ADMIN and OPERATIONS can inspect the read-only matching queue at `GET /api/v1/admin/bookings/matching-queue`. With no status filter it selects `PENDING_PROVIDER_MATCH` bookings whose SELF funding is `SETTLED`, ordered by `created_at ASC` then booking reference for deterministic oldest-first handling. Reading the queue never starts matching. The legacy start command remains a recovery tool, while `/matching/retry` explicitly re-evaluates `UNFULFILLABLE` bookings.

Queue readiness is derived operational metadata, not a booking status. It distinguishes ready records, incomplete funding or scheduling, active offers, accepted offers awaiting confirmation, unfulfillable bookings, and already assigned bookings. Explicit status filters may inspect blocked or progressed records, but inconsistent unpaid `PENDING_PROVIDER_MATCH` development rows are excluded from the default queue and are never repaired by this read.

The current assignment is the most recently created assignment for the booking, tie-broken by assignment ID. This is sufficient for the current sequential workflow. A future matching-cycle entity would be required to distinguish separate rematching cycles or derive a reliable cycle-level `matchingStartedAt`, so that field is intentionally omitted.

ADMIN and OPERATIONS can inspect a single minimized operational record at `GET /api/v1/admin/bookings/:reference`. It uses the same latest-assignment ordering and shared readiness derivation as the queue, but adds the booker contact, quote, summarized SELF funding, latest payment attempt, and successful payment time needed to operate the booking. It does not expose histories, candidates, health data, provider credentials, or payment-provider internals.

V1 offers are sequential. Eligibility query order provides a deterministic candidate order without a ranking score. One `OFFERED`, `ACCEPTED`, or `CONFIRMED` assignment may be active in the service workflow at a time; offer creation locks the booking and rechecks active assignments. Providers previously offered the booking are excluded when selecting the next candidate.

Normal manual selection at `POST /api/v1/admin/bookings/:reference/assign-provider` uses the same capability, provider status, schedule, availability, exception, location, and capacity eligibility discovery as automatic matching. The separate `/assign-provider/override` operation requires a reason and an operationally ACTIVE provider, records `MANUAL_PROVIDER_OVERRIDE`, and never represents the provider as normally eligible. `/reassign-provider` cancels the active assignment with append-only history, releases HELD/CONFIRMED capacity, clears an automatically confirmed schedule when necessary, returns pre-encounter work to matching, and either offers a selected eligible provider or resumes sequential discovery. `IN_PROGRESS`, completed, and terminal bookings remain protected.

The offer expiry is `offered_at + PROVIDER_OFFER_TTL_MINUTES`, configured through the environment. Expiry is processed by an explicit operations command for now; scheduled execution is deferred. Expiry or decline appends assignment history, leaves the booking pending, and attempts the next eligible provider. If none remains, the booking moves to `UNFULFILLABLE` with booking history; it is never automatically cancelled.

Provider acceptance records `OFFERED → ACCEPTED`, then automatically confirms the assignment and schedule in the same transaction. Every assignment and booking state change appends the corresponding history record.

`POST /api/v1/admin/bookings/:reference/schedule` remains an exceptional/manual scheduling command for legacy or deliberately operator-managed assignments. Normal accepted offers are scheduled automatically from the booking preference and package duration.

`PROVIDER_LOCATION` scheduling additionally requires an active location owned by that provider and linked to the eligible `ProviderService`. `HOME_VISIT` rejects a provider location and still lacks structured patient-address and geographic service-area validation. Preferred booking fields remain unchanged; `scheduled_*` fields are the authoritative appointment context after scheduling.

Offer creation stores a `HELD` capacity reservation using the booking's preferred date/start/timezone, package-derived end, and selected physical location when applicable. Arbitrary client-selected reservation times are not accepted. Eligibility is repeated before acceptance; acceptance promotes that same hold while assignment, scheduling, and booking transitions share one transaction. PostgreSQL rejects concurrent overlapping active reservations, so a capacity conflict prevents the offer from being created.

`OFFERED` assignments hold capacity until accepted, declined, expired, cancelled, or reassigned. Decline/expiry/reassignment release the hold before continuing matching; booking cancellation marks it `CANCELLED`. Released and cancelled reservations stop blocking eligibility. Providers cannot respond to stale closed assignments, and no direct reservation mutation API is exposed.

Provider accept/decline operations are exposed under `/api/v1/provider/offers` only to authenticated users with the explicit `PROVIDER` role and an active, non-deleted `Provider.user_id` link. Provider identity is derived from authentication and is never accepted from request input. Listing and reads are ownership-scoped; an unknown or non-owned offer returns the same 404. Responses contain only the operational booking/package/schedule and minimal participant name needed for the provider decision.

After acceptance automatically confirms and schedules an assignment, that same provider-authenticated boundary owns health-check capture for the booking. Encounter start/save/complete recheck the `CONFIRMED` assignment rather than trusting a provider or assignment identifier from input. Clinical measurements remain outside matching.

SmartClinic supports two provider onboarding paths. `POST /api/v1/admin/providers` captures the operational provider identity and email, creates a `PENDING`/`INVITED` Provider plus initial invitation, and attempts email delivery without a second invitation form. `POST /api/v1/public/providers/register` creates a provider-only User, credential, linked Provider, and `PENDING`/`DRAFT` application. Invitation acceptance similarly links the new account into `DRAFT`; the provider must configure and explicitly submit before review. Neither path activates it.

Providers inspect/update their permitted profile at `/api/v1/provider/profile` and manage their own capabilities, locations, service-location links, weekly availability, and one-off exceptions under `/api/v1/provider/*`. Identity always comes from the authenticated User-to-Provider link; self-service requests never accept a provider ID. Pending and rejected providers may build configuration incrementally, while suspended/inactive providers have read-only configuration access. Existing ADMIN/OPERATIONS configuration endpoints remain available for support rather than being the normal data-entry path.

Submission through `/api/v1/provider/onboarding/submit` requires a complete profile, at least one active capability, an active linked location for every active `PROVIDER_LOCATION` capability, and at least one active weekly availability row. Exceptions are optional. The same derived readiness check gates ADMIN/OPERATIONS approval through `/api/v1/admin/providers/:id/approve`; `/reject` retains Provider, User, role, and configuration. Approval is the only first-activation path. HOME_VISIT service-area readiness remains deferred and is not falsely reported as booking eligibility.

Onboarding approval is not matching eligibility by itself. Discovery continues to require operational `ProviderStatus.ACTIVE`, an active package/mode capability, required linked physical locations, covering availability and exceptions, and free capacity. `INVITED`, `DRAFT`, `SUBMITTED`, `REJECTED`, and all operationally `PENDING` providers are excluded. HOME_VISIT structured service-area work remains deferred.

`GET /api/v1/admin/users/search` helps operations select an existing account by partial normalized email or display name. Exact email and prefix matches are ordered before broader matches, with deterministic identity/ID tie-breaking and page/limit bounds. Already-linked users remain visible through a minimal `providerLink`; the search is informational only, and `POST /api/v1/admin/providers/:id/link-user` remains the explicit mutation and final eligibility authority.

The existing time-limited invitation endpoints remain available for operations history and explicit replacement workflows. A provider-neutral email boundary attempts delivery after the invitation transaction commits; Resend is the first production adapter. Successful delivery returns `SENT` without token material; an unavailable or failed provider returns a one-time manual setup link. Public inspection validates the token without exposing IDs, and acceptance creates an ACTIVE User account with `PROVIDER`, a bcrypt credential, links the Provider, leaves a new provider operationally `PENDING`, and marks the invitation accepted. Legacy providers already backfilled as reviewed `APPROVED`/`ACTIVE` retain that state during account setup. Reuse, expiry, revocation, deleted/linked Providers, duplicate pending invitations, and pre-existing User emails are rejected. Successful acceptance does not log the provider in; normal login is required.

Administrative retry, manual assignment, override, reassignment, confirmation, and stale-expiry commands remain protected under `/api/v1/admin`. Normal matching initiation follows payment automatically; providers may list, accept, or decline only their own offers. Offer expiry rules remain unchanged and expired offers cannot be revived through provider routes. Scheduled/background stale-offer execution remains deferred, so the secured explicit expiry command is still required.

Operations assignment management also exposes protected list and detail reads at `/api/v1/admin/provider-assignments`. Staff may filter by booking reference, provider, or assignment status and receive a minimized operational projection. The confirm command remains a recovery tool for legacy `ACCEPTED` rows; routine provider acceptance no longer waits for it.

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

Provider acceptance is the routine business confirmation. A successful response now performs `OFFERED → ACCEPTED → CONFIRMED` and promotes the held reservation to `CONFIRMED` in the same transaction. The booking records both `PENDING_PROVIDER_MATCH → PROVIDER_ASSIGNED` and `PROVIDER_ASSIGNED → SCHEDULED`; no routine ADMIN/OPERATIONS confirmation is required. The admin confirmation endpoint remains available only to recover legacy assignments already left in `ACCEPTED`.

Automatic scheduling uses the booking's preferred date, preferred start time and timezone, and derives the end time from the active Health Check package's `estimatedDurationMinutes`. Legacy `preferredTimeTo` is not authoritative. Same-date reservations remain a v1 limitation, so a derived interval crossing midnight is rejected.

For `PROVIDER_LOCATION`, matching selects one active geographically eligible location linked to the capability using the documented stable ordering and persists it before acceptance. `HOME_VISIT` keeps `providerLocationId = null` and reuses the structured visit-address/service-area eligibility checks.

`PROVIDER_LOCATION` bookings now also require `visitAddress`. For this mode it is the patient's matching origin, not the appointment destination; the confirmed `ProviderLocation` remains a separate record. Physical-location matching requires normalized country, state/region, and city equality. When the booking supplies a postal code, a location with the same postal code or no postal code remains eligible; a conflicting non-null location postal code does not. This is deterministic compatibility matching, not distance or “nearest” selection.

Eligible physical locations are ordered by `ProviderLocation.createdAt ASC`, then `ProviderLocation.id ASC`. The first location in that explicit order is selected, and the OFFERED assignment's HELD reservation stores its ID. Provider acceptance revalidates that exact location, including active ownership, capability linkage, geography, location-scoped availability/exceptions, and provider-wide capacity. It never rediscovers or chooses a branch from an unordered set. Decline, expiry, and reassignment release the old held/confirmed reservation before the next offer selects its own location.

Normal manual eligible assignment uses the same deterministic branch selection. The existing override request has no provider-location input, so PROVIDER_LOCATION override is rejected before creating an offer rather than producing an unlocated or arbitrarily located override. Adding a separately audited explicit override-location contract remains future work.

## History and auditability

Matching needs relational records, not only a booking enum: a single booking can have multiple matching cycles, provider candidates, offers, declines, expiries, and reassignment actions. Each offer and assignment should preserve actor, timestamps, reason, relevant eligibility snapshot, and state-transition history. Sensitive provider and participant information must be visible only to authorised users and only at the point it is necessary.

## Remaining decisions

## Home-visit coverage

Each active `HOME_VISIT` ProviderService must have at least one active ProviderServiceArea before onboarding submission or approval is ready. Providers configure their own areas; ADMIN/OPERATIONS retains support read access. Physical ProviderLocation links are not used for HOME_VISIT.

Coverage is deterministic: country must match exactly, state/region case-insensitively, and any non-null area city or postal code further narrows the match. There is no fuzzy matching, geocoding, radius, routing, or GIS. Automatic matching, ordinary manual assignment, and scheduling all apply this same rule alongside capability, ACTIVE status, availability, exceptions, and capacity. Override assignment may bypass coverage only through the existing reasoned/audited override path; it cannot bypass a missing structured booking address or lifecycle/capacity protections.

Bookings without the required address derive `INCOMPLETE_VISIT_ADDRESS`; they are not made eligible through `locationNote`. The queue shows only city/state/country while booking detail retains the operational address.

- What is the response deadline, and may it differ by package, location, or home visit?
- What participant details can a provider see before accepting an offer?
- Can a participant reject or change an assigned provider, and under what policy?
- What happens if a confirmed provider withdraws, becomes unavailable, or is suspended?
- What matching threshold or operational review moves a cycle to `UNMATCHED` and the booking to `UNFULFILLABLE`?
