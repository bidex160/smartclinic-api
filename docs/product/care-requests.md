# Care Requests

After provider acceptance, the provider explicitly creates a distinct Care Appointment. Patient preferred date/time remains a preference, not a confirmed schedule. See [Care Appointments](care-appointments.md).

A Care Request is a lightweight authenticated-patient request to be connected to an existing SmartClinic Provider for a centrally defined Find Care service. It is separate from Health Check Booking and does not create funding, reservations, confirmed schedules, encounters, or FastTrack behavior.

The authoritative relationship is `User -> SELF Patient -> CareRequest -> CareServiceDefinition`, with optional preferred and assigned `Provider` plus the exact `ProviderCareService` offering. Composite database foreign keys guarantee that stored offerings belong to both the stored Provider and selected service definition.

## Creation and matching

`POST /api/v1/me/care-requests` accepts service code, explicit country/state/city, optional Provider public reference, optional preferred date/time, contact method, and notes. It accepts no internal User, Patient, Provider, or service IDs.

When no Provider is preferred, the request is created atomically in `MATCHING`. V1 deliberately does not select the first database result or silently assign a candidate. Admin/Operations use the same deterministic eligibility rules as Find Care—active and approved Provider, active definition/offering, appointment requests enabled, and exact authoritative geography—to assign a Provider later.

When a preferred Provider is supplied, that Provider and exact offering are revalidated inside the creation transaction. An eligible request enters `AWAITING_PROVIDER_RESPONSE`; an ineligible reference returns a conflict without creating a request.

## Lifecycle

The persisted status enum supports `SUBMITTED`, `MATCHING`, `PROVIDER_SELECTED`, `AWAITING_PROVIDER_RESPONSE`, `PROVIDER_ACCEPTED`, `SCHEDULED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `DECLINED`, and `UNFULFILLABLE`. V1 actively drives:

- no preference -> `MATCHING`
- preferred/admin assignment -> `AWAITING_PROVIDER_RESPONSE`
- provider accept -> `PROVIDER_ACCEPTED`
- provider decline -> `DECLINED`
- patient cancellation -> `CANCELLED`
- operations exhaustion -> `UNFULFILLABLE`

Acceptance does not automatically schedule. Later scheduling/appointment policy owns the remaining forward states. Declined and unfulfillable requests may be operationally reassigned. Every initial state and transition is appended to `care_request_status_history` with actor and reason semantics.

## APIs and security

Authenticated SELF Patient:

- `POST|GET /api/v1/me/care-requests`
- `GET /api/v1/me/care-requests/:reference`
- `POST /api/v1/me/care-requests/:reference/cancel`

Assigned/preferred Provider:

- `GET /api/v1/provider/care-requests`
- `GET /api/v1/provider/care-requests/:reference`
- `POST .../:reference/accept|decline`

Admin/Operations:

- list/detail with status, service, Provider, and geography filters
- assign/reassign an eligible Provider
- mark unfulfillable with a reason

Patient ownership resolves exclusively through JWT User to active SELF Patient. Provider reads are scoped to the linked active/approved Provider. Cross-owner reference changes return a narrow not-found response. Provider DTOs include request delivery context but no Patient contact, Patient reference, User identity, medical history, payments, or admin data. Provider responses contain only safe Provider public identity.

Mutable commands lock the Care Request row and re-check state inside a transaction. Provider acceptance and admin assignment also lock/revalidate the exact Provider offering, Provider, and definition. This prevents stale cancellation/acceptance and competing assignment transitions.

Guest recovery, private codes, payments, automatic ranking, appointment slots, notifications, FastTrack, external appointments, and maps/distance matching remain deferred.
