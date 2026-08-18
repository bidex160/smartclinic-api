# Proposed Database Model

## Scope and status

This document describes the relational design as it evolves. Health-result/clinical-record tables, booking groups, organisation programmes, and payment-provider event tables remain outside the current model.

Use `uuid` internal primary keys for all tables. Store timestamps as `timestamptz`; use `created_at` and `updated_at` unless a record is immutable or append-only. Names below are database names and do not prescribe TypeScript class names.

## 1. Entity overview

| Domain | Proposed table | Purpose |
| --- | --- | --- |
| Core identity | `users` | Platform identities; authentication details are added later. |
| Core identity | `patients` | People receiving care, whether or not they have user accounts. |
| Core identity | `providers` | Provider profile and operational eligibility. |
| Core identity | `organisations` | Organisation identity and future programme/funding context. |
| Catalogue | `health_check_packages` | Configurable Health Check package definitions. |
| Catalogue | `fulfilment_modes` | Configurable delivery modes. |
| Catalogue | `package_prices` | Effective-dated public catalogue prices by package and fulfilment mode. |
| Booking | `bookings` | One request to deliver one package to exactly one participant. |
| Booking | `booking_contacts` | Immutable public-booker contact snapshot for bookings created without an account. |
| Booking | `booking_status_history` | Append-only booking lifecycle transitions. |
| Funding | `booking_funding` | One or more funding obligations/sources for a booking. |
| Payments | `payment_attempts` | Provider-neutral attempts to collect a funding obligation. |
| Payments | `payment_transactions` | Financial movements resulting from attempts or refunds. |
| Provider matching | `provider_assignments` | Provider offers and accepted/confirmed assignments over time. |
| Provider matching | `provider_assignment_history` | Append-only provider-offer/assignment transitions. |
| Provider capability | `provider_services` | Stable provider/package/fulfilment-mode capability. |
| Provider capability | `provider_locations` | Provider-owned physical service locations. |
| Provider capability | `provider_service_locations` | Availability of a location-based capability at a physical location. |
| Provider availability | `provider_availability` | Recurring weekly provider availability, optionally scoped to service/location. |
| Provider availability | `provider_availability_exceptions` | One-off full-day or partial-day additions/removals, optionally scoped to service/location. |
| Provider capacity | `provider_booking_reservations` | Booking-derived provider capacity held or confirmed through assignment workflow. |

## 2. Entity-by-entity fields

### Core identity

#### `users`

| Field | Proposed type / nullability | Notes |
| --- | --- | --- |
| `id` | `uuid`, primary key | Internal identifier. |
| `email` | `varchar`, nullable | Sensitive contact identifier. It may be absent until authentication/onboarding is implemented. |
| `email_normalized` | `varchar`, nullable | Lower-cased/canonical form for a unique lookup; avoid database-specific case comparisons in application code. |
| `display_name` | `varchar`, nullable | Minimal identity display value, not a patient clinical record. |
| `status` | enum or constrained `varchar`, non-null | `ACTIVE` is required for authentication; `SUSPENDED`, `DEACTIVATED`, and deleted users are denied. |
| `roles` | `user_role_enum[]`, non-null | Values: `USER`, `ADMIN`, `OPERATIONS`, `PROVIDER`; public registration still assigns only `USER`. |
| `created_at`, `updated_at`, `deleted_at` | `timestamptz`; first two non-null, latter nullable | Soft deletion/deactivation requires a later retention policy. |

`user_credentials` holds a one-to-one bcrypt `password_hash` separate from user profile data. JWT access tokens are not persisted in v1; future refresh-token and login-audit requirements need separate security records.

#### `patients`

| Field | Proposed type / nullability | Notes |
| --- | --- | --- |
| `id` | `uuid`, primary key | Internal participant identifier. |
| `user_id` | `uuid`, nullable FK to `users` | Optional one-to-one link for a registered patient. |
| `given_name`, `family_name` | `varchar`, non-null | Sensitive personal data. |
| `date_of_birth` | `date`, nullable | Sensitive personal data; collect only when product/clinical requirements require it. |
| `phone`, `email` | `varchar`, nullable | Sensitive contact data, distinct from any linked user account. |
| `status` | enum or constrained `varchar`, non-null | Suggested: `ACTIVE`, `INACTIVE`, `ARCHIVED`. |
| `created_at`, `updated_at`, `deleted_at` | `timestamptz`; first two non-null, latter nullable | Retention must be decided before use. |

A patient may be a registered user, an invited family member, a dependent, or another person booked on behalf of. Therefore `patients.user_id` is nullable. Where present, make it unique so one user has at most one direct patient profile in v1. Do not require a patient to have a user record to create a booking.

#### `providers`

| Field | Proposed type / nullability | Notes |
| --- | --- | --- |
| `id` | `uuid`, primary key | Internal provider identifier. |
| `user_id` | `uuid`, nullable FK to `users`, unique when present | Provider account linkage is optional until provider authentication/onboarding is implemented. |
| `display_name` | `varchar`, non-null | Name presented to authorised operations/users. |
| `professional_reference` | `varchar`, nullable | Sensitive/confidential registration or licence reference; scope and verification are future decisions. |
| `status` | enum or constrained `varchar`, non-null | Suggested: `PENDING`, `ACTIVE`, `SUSPENDED`, `INACTIVE`. |
| `created_at`, `updated_at`, `deleted_at` | `timestamptz`; first two non-null, latter nullable | Do not hard-delete providers with assignment history. |

Services and physical locations are separate provider-domain tables and matching inputs, not fields to overpack into this profile. Availability/scheduling, home-visit service areas, and verification records remain future work.

#### `provider_services`, `provider_locations`, and `provider_service_locations`

`provider_services` uniquely identifies `(provider_id, health_check_package_id, fulfilment_mode_id)` and carries `is_active` plus creation/update timestamps. Foreign keys use `RESTRICT`; matching-oriented indexes begin with package/mode/active and provider/active. Prices are deliberately absent.

`provider_locations` contains the provider, display name, two address lines (the second optional), city, state, two-letter uppercase country code, optional latitude/longitude, active flag, and timestamps. Database checks enforce country-code shape and coordinate ranges without introducing premature address normalization.

`provider_service_locations` contains the service, location, provider-owner key, and creation time. Its composite foreign keys require both referenced rows to have the same provider, while the application service also validates ownership and the `PROVIDER_LOCATION` mode for clearer errors. The service/location pair is unique. Removing a link deletes this join row only; normal provider service and location lifecycle uses activation/deactivation.

#### `provider_availability`

Each row contains provider, optional provider-service and provider-location scopes, a named `day_of_week_enum`, local start/end `time`, IANA timezone, active flag, and timestamps. Composite foreign keys prevent cross-provider service or location references. A check requires start before end, so v1 blocks cannot cross midnight.

Active overlaps are prohibited for the same provider/day/service-scope/location-scope using a GiST exclusion constraint over half-open time ranges. Null service and location values are normalized only inside that constraint so general-scope blocks compare consistently. Adjacent blocks are permitted. IANA validity is checked by API DTO validation because PostgreSQL does not provide a stable built-in IANA identifier constraint.

#### `provider_availability_exceptions`

Each row belongs to a provider and date, has an IANA timezone, an `AVAILABLE` or `UNAVAILABLE` type, optional service/location scope, optional reason, active flag and timestamps. Null start/end together mean the whole local date; otherwise both are required and start must precede end. Composite foreign keys ensure scoped services and locations belong to the same provider. Matching uses recurring coverage or a covering `AVAILABLE` exception as its baseline, then excludes any overlapping `UNAVAILABLE` exception. A GiST exclusion constraint prevents overlapping active rows in an identical scope and timezone, while permitting adjacent half-open ranges.

#### `provider_booking_reservations`

A reservation links exactly one provider assignment to its provider and booking, with an optional owned provider location. Its scheduled date, start/end times, and timezone are copied from complete booking scheduling context at provider acceptance. Status is `HELD`, `CONFIRMED`, `RELEASED`, or `CANCELLED`; release time is retained separately. Pricing, patient, and clinical data are not duplicated.

`HELD` and `CONFIRMED` rows participate in a GiST exclusion constraint keyed by provider and scheduled date over a half-open local-time range. Consequently adjacent reservations are valid and overlaps are rejected safely under concurrent acceptance. Released/cancelled rows remain as lifecycle records but do not consume capacity. The assignment FK is unique so one acceptance cannot create multiple reservations.

Booking cancellation changes active reservation rows to `CANCELLED`; operational rescheduling changes them to `RELEASED`. In both cases the related actionable assignment becomes `CANCELLED`, with assignment and booking history appended in the same transaction. Reservation rows are retained rather than deleted. No schema migration is required for these operations because the existing status enums and reason/history fields cover the lifecycle.

#### `organisations`

| Field | Proposed type / nullability | Notes |
| --- | --- | --- |
| `id` | `uuid`, primary key | Internal organisation identifier. |
| `name` | `varchar`, non-null | Legal or operating name. |
| `public_code` | `varchar`, non-null, unique | Stable human/API-facing organisation identifier. |
| `status` | enum or constrained `varchar`, non-null | Suggested: `ACTIVE`, `SUSPENDED`, `INACTIVE`. |
| `created_at`, `updated_at`, `deleted_at` | `timestamptz`; first two non-null, latter nullable | Retire rather than hard-delete funded-history organisations. |

Organisation administrators, programmes, eligibility, and participant membership require future explicit join tables. Do not make `patients.organisation_id` the multi-tenancy model: a patient may participate in multiple programmes over time.

### Catalogue

#### `health_check_packages`

| Field | Proposed type / nullability | Notes |
| --- | --- | --- |
| `id` | `uuid`, primary key | Internal catalogue identifier. |
| `code` | `varchar`, non-null, unique | Initial values: `ESSENTIAL`, `COMPLETE`. Stable machine-readable code. |
| `name` | `varchar`, non-null | Display name. |
| `description` | `text`, nullable | Non-clinical catalogue description. |
| `benefits` | `text[]`, non-null | Public package benefits; an empty list means benefits still need approved catalogue content. |
| `estimated_duration_minutes` | `integer`, nullable | Public estimated duration once approved; must be positive when present. |
| `is_active` | `boolean`, non-null | Retire packages rather than delete them. |
| `created_at`, `updated_at` | `timestamptz`, non-null | Catalogue audit fields. |

#### `fulfilment_modes`

| Field | Proposed type / nullability | Notes |
| --- | --- | --- |
| `id` | `uuid`, primary key | Internal catalogue identifier. |
| `code` | `varchar`, non-null, unique | Initial values: `PROVIDER_LOCATION`, `HOME_VISIT`. |
| `name` | `varchar`, non-null | Display name. |
| `is_active` | `boolean`, non-null | Retire modes rather than delete them. |
| `created_at`, `updated_at` | `timestamptz`, non-null | Catalogue audit fields. |

Home Visit is a fulfilment mode, never a package. Neither table contains a single mutable `price`; `package_prices` provides package/mode/currency/effective-date pricing without implementing a broader pricing engine. Booking creation selects an active/effective v1 NGN price server-side and copies its amount and currency into an immutable booking quote snapshot.

#### `package_prices`

| Field | Proposed type / nullability | Notes |
| --- | --- | --- |
| `id` | `uuid`, primary key | Internal catalogue-price identifier. |
| `health_check_package_id` | `uuid`, non-null FK to `health_check_packages` | Priced package. |
| `fulfilment_mode_id` | `uuid`, non-null FK to `fulfilment_modes` | Priced delivery mode. |
| `amount`, `currency` | `numeric(12,2)`, `char(3)`, non-null | Positive amount and uppercase ISO 4217 currency. |
| `effective_from` | `date`, non-null | Inclusive start date. |
| `effective_to` | `date`, nullable | Exclusive end date; null is open-ended. |
| `is_active` | `boolean`, non-null | Inactive prices are not publicly selectable. |
| `created_at`, `updated_at` | `timestamptz`, non-null | Catalogue audit fields. |

An exclusion constraint prevents overlapping active date ranges for the same package, fulfilment mode, and currency. Price-management operations create new rows and may close a preceding range; they never rewrite a historical amount or delete a record. Public catalogue responses return only active prices effective on the current date; historical and future prices remain internal. Prices are operational data, are not seeded, and do not require deployment to change.

### Booking

#### `bookings`

| Field | Proposed type / nullability | Notes |
| --- | --- | --- |
| `id` | `uuid`, primary key | Internal identifier. |
| `booking_reference` | `varchar`, non-null, unique | Public-facing reference, separate from `id`. |
| `booker_user_id` | `uuid`, nullable FK to `users` | The person/administrator initiating the booking when a registered account exists. Public bookings leave this null. |
| `participant_patient_id` | `uuid`, non-null FK to `patients` | Exactly one participant per booking. |
| `organisation_context_id` | `uuid`, nullable FK to `organisations` | Optional context for an organisation journey; not a substitute for programme eligibility or funding records. |
| `health_check_package_id` | `uuid`, non-null FK to `health_check_packages` | Selected package. |
| `fulfilment_mode_id` | `uuid`, non-null FK to `fulfilment_modes` | Selected delivery mode. |
| `status` | booking-status enum, non-null | Current fulfilment state only. |
| `quoted_amount` | `numeric(12,2)`, nullable initially | Server-selected monetary snapshot; do not use floating point. Catalogue changes never mutate an existing booking. |
| `currency` | `char(3)`, nullable initially | ISO 4217 code paired with every monetary value. |
| `preferred_date` | `date`, nullable | Requested date before an appointment is confirmed. |
| `preferred_time_window_start`, `preferred_time_window_end` | `time`, nullable | Requested local time range; both values are required together and end must be later. |
| `preferred_timezone` | `varchar`, nullable | IANA timezone used to interpret preferred date/time. Nullable for older/no-preference rows; required by application validation when scheduling preference is supplied. |
| `scheduled_starts_at`, `scheduled_ends_at` | `timestamptz`, nullable | Confirmed appointment values, not required for a draft. |
| `preferred_location_note` | `text`, nullable | Minimum v1 preference field; do not place detailed address/health data here. |
| `cancellation_reason` | `varchar`, nullable | Set only when relevant; policy controls permitted values. |
| `expires_at` | `timestamptz`, nullable | Explicit expiry deadline when an expiry policy applies. |
| `created_at`, `updated_at` | `timestamptz`, non-null | Current-record audit fields. |

The booking has no `payer_id`, payment-provider reference, provider assignment ID, or health-result fields. Payer/funder is represented through `booking_funding`; provider matching through `provider_assignments`; health data belongs to future clinical records. A future `booking_groups`/`orders` table can associate related bookings, but every booking retains one `participant_patient_id`.

#### `booking_contacts`

| Field | Proposed type / nullability | Notes |
| --- | --- | --- |
| `id` | `uuid`, primary key | Internal contact-snapshot identifier. |
| `booking_id` | `uuid`, non-null, unique FK to `bookings` | One public-booker snapshot per booking where one is required. |
| `given_name`, `family_name` | `varchar`, non-null | Name supplied by the person initiating the public booking. |
| `email` | `varchar`, nullable | Optional contact email snapshot. |
| `phone` | `varchar`, non-null | Contact phone snapshot. |
| `created_at` | `timestamptz`, non-null | Snapshot creation time. |

`booking_contacts` is intentionally distinct from `users` and `patients`. It preserves who initiated a public booking at the time it was created; it does not create an account and is not a future account-linking mechanism. A later account-linking flow may explicitly relate an account to a patient or booking under its own consent and authority rules.

#### `booking_status_history`

| Field | Proposed type / nullability | Notes |
| --- | --- | --- |
| `id` | `uuid`, primary key | Internal identifier. |
| `booking_id` | `uuid`, non-null FK to `bookings` | Parent booking. |
| `from_status` | booking-status enum, nullable | Null only for initial creation. |
| `to_status` | booking-status enum, non-null | New state. |
| `actor_user_id` | `uuid`, nullable FK to `users` | Null for an automated/system transition. |
| `reason_code`, `reason_note` | `varchar`/`text`, nullable | Required by policy for cancellation, expiry, and unfulfillable changes. |
| `created_at` | `timestamptz`, non-null | Transition time. |

This table is append-only: no updates or soft deletes. The current booking status is stored on `bookings` for efficient reads, while this table is the audit trail.

#### `booking_funding`

| Field | Proposed type / nullability | Notes |
| --- | --- | --- |
| `id` | `uuid`, primary key | Internal funding-obligation identifier. |
| `booking_id` | `uuid`, non-null FK to `bookings` | A booking has one or more funding rows. |
| `source_type` | funding-source enum, non-null | Initial: `SELF`, `FAMILY`, `SPONSOR`, `ORGANISATION`, `OTHER`. |
| `responsible_user_id` | `uuid`, nullable FK to `users` | Individual responsible party, when applicable. |
| `responsible_organisation_id` | `uuid`, nullable FK to `organisations` | Organisation responsible party, when applicable. |
| `amount` | `numeric(12,2)`, nullable | Required before actual collection/settlement. |
| `percentage` | `numeric(5,2)`, nullable | Optional allocation expression; range 0–100. |
| `currency` | `char(3)`, non-null | Currency of amount/obligation. |
| `status` | funding-status enum, non-null | Suggested: `PENDING`, `APPROVED`, `DECLINED`, `EXPIRED`, `CANCELLED`, `SETTLED`. |
| `created_at`, `updated_at` | `timestamptz`, non-null | Current funding-obligation audit fields. |

Use explicit nullable foreign keys rather than a generic polymorphic `party_type`/`party_id`. A check constraint should allow at most one of the two current responsible-party FKs and require one for `SELF`, `FAMILY`, `SPONSOR`, and `ORGANISATION` as applicable. Future sponsored programmes should add an explicit programme FK/table rather than overload `OTHER` indefinitely. A funding source may fund 100%, or multiple rows may fund fixed amounts or percentages. Before payment, percentages must resolve to exact amounts against the immutable booking quote.

### Payments

#### `payment_attempts`

| Field | Proposed type / nullability | Notes |
| --- | --- | --- |
| `id` | `uuid`, primary key | Internal identifier. |
| `booking_funding_id` | `uuid`, non-null FK to `booking_funding` | The obligation being collected. |
| `amount`, `currency` | `numeric(12,2)` and `char(3)`, non-null | Immutable collection request snapshot. |
| `status` | payment-attempt enum, non-null | `CREATED`, `AWAITING_CUSTOMER_ACTION`, `PENDING_CONFIRMATION`, `SUCCEEDED`, `FAILED`, `CANCELLED`. |
| `idempotency_key` | `varchar`, non-null, unique | Prevents duplicate attempt creation. |
| `provider_code` | `varchar`, nullable | Selected Payments-domain adapter/integration, not a Booking field. |
| `provider_reference` | `varchar`, nullable | Opaque provider reference permitted only inside Payments. |
| `created_at`, `updated_at` | `timestamptz`, non-null | Attempt audit fields. |

`provider_code` and `provider_reference` are intentionally Payments-domain fields. Named provider IDs, SDK objects, raw webhook payloads, and provider-specific statuses never appear in `bookings`. Protected provider-event/raw-payload storage should be a future Payments-only table with restricted access and retention rules.

#### `payment_transactions`

| Field | Proposed type / nullability | Notes |
| --- | --- | --- |
| `id` | `uuid`, primary key | Internal identifier. |
| `payment_attempt_id` | `uuid`, nullable FK to `payment_attempts` | Source attempt for collections; nullable only for a future finance/reconciliation path that is explicitly designed. |
| `parent_transaction_id` | `uuid`, nullable self-FK | Links a refund to the successful collection it reverses. |
| `transaction_type` | enum, non-null | Initial: `COLLECTION`, `REFUND`; add other types only with a defined accounting need. |
| `status` | transaction-status enum, non-null | `PENDING`, `SUCCEEDED`, `FAILED`. Refund aggregate state is derived from linked transactions. |
| `amount`, `currency` | `numeric(12,2)` and `char(3)`, non-null | Immutable monetary movement. |
| `provider_reference` | `varchar`, nullable | Payments-domain opaque reference only. |
| `occurred_at` | `timestamptz`, nullable | Confirmed provider/finance event time. |
| `created_at` | `timestamptz`, non-null | Record creation time. |

Transactions are immutable financial records: do not soft-delete or rewrite a successful collection to represent a refund. Create a linked refund transaction instead. If a pending transaction needs status updates, retain provider-event/audit evidence in the future Payments event table.

### Provider matching

#### `provider_assignments`

| Field | Proposed type / nullability | Notes |
| --- | --- | --- |
| `id` | `uuid`, primary key | Internal assignment/offer identifier. |
| `booking_id` | `uuid`, non-null FK to `bookings` | A booking has multiple offers/attempts over time. |
| `provider_id` | `uuid`, non-null FK to `providers` | Offered or assigned provider. |
| `status` | assignment-status enum, non-null | `OFFERED`, `ACCEPTED`, `CONFIRMED`, `DECLINED`, `EXPIRED`, `CANCELLED`. |
| `offered_at` | `timestamptz`, non-null | Offer creation time. |
| `responded_at` | `timestamptz`, nullable | Provider response time. |
| `accepted_at`, `confirmed_at` | `timestamptz`, nullable | Distinguish acceptance from confirmed active assignment. |
| `expires_at` | `timestamptz`, nullable | Provider response deadline. |
| `reason_code`, `reason_note` | `varchar`/`text`, nullable | Decline, expiry, cancellation, or operational reason. |
| `created_at`, `updated_at` | `timestamptz`, non-null | Current-record audit fields. |

`PENDING_MATCH` and `UNMATCHED` are matching-cycle outcomes, not a provider's offer status. With this initial table set, the booking's `PENDING_PROVIDER_MATCH`/`UNFULFILLABLE` status records that outcome. A future `provider_matching_cycles` table can capture algorithm/manual search runs and eligibility snapshots without changing assignment history.

The v1 matching application uses these rows as sequential offers. It locks the booking and checks for an existing `OFFERED`, `ACCEPTED`, or `CONFIRMED` row before creating the next offer. The existing partial unique index remains the final database guarantee that a booking has at most one `CONFIRMED` assignment. Offer TTL comes from `PROVIDER_OFFER_TTL_MINUTES`; no additional assignment columns or migration are required.

#### `provider_assignment_history`

| Field | Proposed type / nullability | Notes |
| --- | --- | --- |
| `id` | `uuid`, primary key | Internal identifier. |
| `provider_assignment_id` | `uuid`, non-null FK to `provider_assignments` | Parent offer/assignment. |
| `from_status` | assignment-status enum, nullable | Null only for initial offer creation. |
| `to_status` | assignment-status enum, non-null | New state. |
| `actor_user_id` | `uuid`, nullable FK to `users` | Null for automated transitions. |
| `reason_code`, `reason_note` | `varchar`/`text`, nullable | Reason and supporting note where permitted. |
| `created_at` | `timestamptz`, non-null | Transition time. |

Every initial offer and subsequent accept, decline, expiry, or confirmation appends a row. Operations/admin actors are recorded by user id; provider responses remain service-only and use a null actor until authenticated provider identity is implemented.

This table is append-only: no updates or soft deletes. It records the offer/assignment lifecycle independently of the booking lifecycle.

## 3. Relationships and cardinality

```text
users 0..1 ── 0..1 patients
users 0..1 ── 0..1 providers
users 0..1 ── * bookings                 (registered booker, when present)
bookings 0..1 ── 1 booking_contacts      (public booker snapshot)
patients 1 ─ * bookings                 (participant; exactly one per booking)
organisations 0..1 ─ * bookings         (optional context)
health_check_packages 1 ─ * bookings
fulfilment_modes 1 ─ * bookings
health_check_packages 1 ─ * package_prices
fulfilment_modes 1 ─ * package_prices

bookings 1 ─ * booking_status_history
bookings 1 ─ * booking_funding
booking_funding 1 ─ 0..* payment_attempts
payment_attempts 1 ─ 0..* payment_transactions
payment_transactions 0..1 ─ * payment_transactions  (refund links)
bookings 1 ─ * provider_assignments
provider_assignments 1 ─ * provider_assignment_history
providers 1 ─ * provider_assignments
```

`booking_funding` is the sole initial model for payer/funder responsibility. Its explicit user/organisation relationships ensure the payer is not silently treated as the booker or participant. A user can be booker, linked patient, and funder in a self-funded journey, but those are independently recorded relationships.

## 4. Lifecycle and state ownership

| Concern | Current state owner | History/source of truth |
| --- | --- | --- |
| Booking fulfilment | `bookings.status` | `booking_status_history` append-only transitions. |
| Funding obligation | `booking_funding.status` | Current record plus future funding-event history if approvals become complex. |
| Payment collection attempt | `payment_attempts.status` | Attempt record plus future protected provider-event records. |
| Financial movement | `payment_transactions.status` | Immutable transactions; refunds are linked transactions. |
| Provider offer/assignment | `provider_assignments.status` | `provider_assignment_history` append-only transitions. |

Valid booking transitions are:

```text
DRAFT → AWAITING_FUNDING → PENDING_PROVIDER_MATCH → PROVIDER_ASSIGNED
      → SCHEDULED → IN_PROGRESS → COMPLETED

PENDING_PROVIDER_MATCH → UNFULFILLABLE
UNFULFILLABLE → PENDING_PROVIDER_MATCH | CANCELLED
AWAITING_FUNDING → EXPIRED
PENDING_PROVIDER_MATCH → EXPIRED       (only when expiry policy applies)
DRAFT | AWAITING_FUNDING | PENDING_PROVIDER_MATCH | PROVIDER_ASSIGNED | SCHEDULED
  → CANCELLED
PROVIDER_ASSIGNED | SCHEDULED → PENDING_PROVIDER_MATCH  (approved rematching)
```

The service layer—not a database enum alone—must enforce contextual transition rules, actor authority, funding policy, and required reasons. PostgreSQL enums are suitable for stable, controlled lifecycle values, but constrained `varchar` columns/check constraints are easier to extend through migrations. Prefer PostgreSQL enums for the relatively stable booking/attempt/assignment states only if the team accepts explicit enum-alter migrations; otherwise use constrained `varchar` values and TypeScript enums at the application boundary.

## 5. Indexes, constraints, and data integrity

- Primary-key and all foreign-key columns require indexes appropriate to join/query patterns. PostgreSQL does not automatically index every foreign key.
- Unique constraints: `bookings.booking_reference`; `health_check_packages.code`; `fulfilment_modes.code`; `organisations.public_code`; `payment_attempts.idempotency_key`; and partial unique indexes on non-null `users.email_normalized`, `patients.user_id`, and `providers.user_id`.
- Add a partial unique index on `provider_assignments(booking_id)` where `status = 'CONFIRMED'`, enforcing at most one active confirmed provider assignment per booking. Concurrent `OFFERED` rows remain permitted pending an implementation decision.
- Add query indexes such as `bookings(participant_patient_id, created_at desc)`, `bookings(booker_user_id, created_at desc)`, `bookings(status, preferred_date)`, `booking_funding(booking_id, status)`, `payment_attempts(booking_funding_id, status)`, `payment_transactions(payment_attempt_id, status)`, and `provider_assignments(booking_id, status)`.
- `bookings.participant_patient_id`, package, fulfilment mode, and status are non-null. `booker_user_id` is nullable so a public booking can be created without a registered account; a `booking_contacts` snapshot records the public initiator in that journey. A future authenticated/system actor model remains an explicit design concern.
- Use `ON DELETE RESTRICT` for references from bookings, funding, payments, history, and assignments. Historical records must remain referentially valid. Catalogue records should be retired (`is_active = false`), not deleted.
- Check constraints: non-negative monetary values; ISO currency code format; percentage greater than zero and at most 100; a valid funding-party combination; end time after start time where both values are present; and assignment timestamp ordering where applicable.
- Use `numeric(12,2)` for v1 money, never `float`/`double precision`. Confirm precision/scale and currencies before implementation; retain currency alongside every monetary value. Do not sum mixed currencies without an explicitly documented exchange-rate policy.

## 6. Audit and history strategy

All mutable core/catalogue/current-state records have `created_at` and `updated_at`. Add `deleted_at` only to identity/profile records where a future retention policy permits soft deletion.

The following records must be append-only and never soft-deleted:

- `booking_status_history`
- `provider_assignment_history`
- `payment_transactions`
- Future payment provider-event/reconciliation records

`bookings`, `booking_funding`, `payment_attempts`, and `provider_assignments` retain current state for efficient reads, with history/events used to explain material changes. Future audit tables should record actor, timestamp, source (user/system/integration), reason, and correlation/idempotency references. Do not treat `updated_at` as an audit history.

## 7. Security and data sensitivity

Sensitive personal data includes user and patient names, emails, phones, dates of birth, home-visit location notes/addresses, provider professional references, and payment references/amounts. Booking preference/location data may reveal sensitive circumstances even without clinical results.

Health measurements, symptoms, diagnoses, results, and clinical notes must not appear in any table proposed here. They belong in a later Health Checks/clinical model with separately designed access controls. Booking authority or payment responsibility does not by itself grant health-record access.

At the application level, future authorisation must distinguish patient health, booking, payment, provider, and organisation access. Restrict operational and database access to payment provider references and raw provider events; never store payment card data or provider SDK objects in these tables.

## 8. Soft deletion recommendation

Use retirement/status changes before soft deletion wherever a row is referenced by bookings or financial history. `health_check_packages` and `fulfilment_modes` should use `is_active`, not `deleted_at`.

`users`, `patients`, `providers`, and `organisations` may eventually use `deleted_at`/deactivation for privacy and account lifecycle needs, subject to retention and legal requirements. Soft deletion must not break historical foreign keys, and uniqueness rules must define whether contact identifiers may be reused.

Do **not** soft-delete bookings, booking history, funding records with payment history, payment attempts, payment transactions, provider assignments, or assignment history. Use lifecycle statuses, cancellation, expiry, reversal/refund records, or archival controls instead.

## 9. Multi-tenancy and future extension points

This v1 model is not full multi-tenancy. `bookings.organisation_context_id` and `booking_funding.responsible_organisation_id` preserve essential organisation context without asserting that every record belongs to one tenant.

Future organisation work needs explicit `organisation_programmes`, `organisation_memberships`/eligible-participant records, organisation-admin membership, and programme funding-allocation tables. Provider organisations, service locations, availability, and service/package capability need their own provider-network tables. These future records should carry an organisation/programme FK where ownership, eligibility, reporting, or access control requires it; do not add a blanket `organisation_id` to every current table.

Other planned extensions are a booking-group/order table, package-price table, detailed booking-address model, consent/authority records, matching cycles/eligibility snapshots, payment provider events, notification delivery, and clinical health-check/result records.

## 10. Open design decisions before entities

- Is a registered user always required as `booker_user_id`, or must v1 support anonymous/external operational bookings?
- What minimum patient demographics and contact fields are required, and what consent/guardian evidence is required for adults, minors, and dependents?
- Which structured address and service-area model applies to Home Visit scheduling?
- When is a price quoted/locked, and are discounts, taxes, deposits, instalments, or multiple currencies in v1 scope?
- Must a funding row use an amount, percentage, or both; how are rounding and mixed funding reconciled?
- What funding statuses and approval/expiry rules apply to sponsors and organisation programmes?
- Should sequential versus concurrent provider offers be selected per booking, package, or operational policy?
- What matching threshold creates `UNFULFILLABLE`, and what rematching/override permissions apply?
- What booking cancellation, rescheduling, no-show, expiry, and refund policies must be configured?
- Which status storage approach does the team prefer: PostgreSQL enum types or constrained `varchar` columns?
- What public booking-reference format, sequence scope, collision strategy, and retention policy should apply? A format such as `SC-2026-000001` is human-friendly, but it must be generated transactionally, remain unique, never be reused, and never be treated as an authorisation secret. An opaque UUID remains the internal key.
