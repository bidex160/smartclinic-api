# Backend Architecture

## System boundary

The SmartClinic API is a standalone backend service. It exposes a REST API to the separately maintained frontend and, later, authorised provider, organisation, and payment-provider integrations. It is not a monorepo and does not contain frontend code.

## Technology baseline

| Concern | Initial choice |
| --- | --- |
| Framework | NestJS 11 / TypeScript |
| API style | REST |
| API contract documentation | Swagger / OpenAPI |
| Persistence | PostgreSQL via TypeORM |
| Request validation and transformation | class-validator and class-transformer |

## Implemented technical foundation

The API includes a local email/password authentication foundation: `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, and authenticated `GET /api/v1/auth/me`. Credentials are separate from user profiles, access tokens are short-lived JWTs, and reusable authentication/roles guards are available for future protected modules.

All API endpoints are prefixed with `/api/v1`. Swagger/OpenAPI documentation is available at `/api/docs` and already declares bearer authentication for the future authentication module.

The application uses a global validation pipe with whitelisting, transformation, and rejection of non-whitelisted input. CORS permits the configured frontend origin and enables credentials for future authenticated browser requests. A minimal global exception filter returns predictable JSON errors without client stack traces, while Nest's built-in logger provides more detail in development.

## Module-oriented design

The application will be organised into NestJS modules aligned to product domains:

```text
API application
├── Authentication
├── Users
├── Patients
├── Providers
├── Health Checks
├── Bookings
├── Payments
├── Sponsorships
├── Organisations
└── Notifications
```

Each module should keep its controller, service, DTOs, persistence entities, and tests close together. Modules collaborate through explicit service interfaces or domain-level contracts rather than through controller calls or direct cross-domain database manipulation.

The Providers module owns provider service capabilities, physical locations, recurring weekly availability (including an optional exclusive booking-start cutoff), one-off scheduling exceptions, booking-derived provider capacity reservations, eligibility discovery, and provider-offer/assignment state. Eligibility derives appointment end from Health Check package duration, applies date-specific additions/removals after the weekly start-time baseline, and excludes overlapping held/confirmed work. Reservation creation/promotion is transactional with assignment acceptance/confirmation. The Health Checks module continues to own package, duration, fulfilment-mode, and commercial pricing data; capability, availability, and reservation rows never store price.

Physical-location matching uses the booking's structured origin address to filter active linked ProviderLocations by normalized country/state/city and optional postal narrowing. It selects deterministically by location creation time and ID, then persists that branch on the offer's HELD reservation. HOME_VISIT continues through ProviderServiceArea instead and never receives a physical provider location. No distance, routing, geocoding, or GIS claim is made.

Dashboard summaries are count-only read projections. They use database aggregate queries rather than loading entity collections or deriving global totals from paginated responses. Provider appointment date aggregation compares `scheduled_date` with the database current timestamp converted through each appointment's own IANA `scheduled_timezone`; it does not use server-local or browser-local dates.

The matching workflow is automatic and sequential: after verified payment settlement commits, eligibility discovery supplies the first candidate and creates one offer. Provider acceptance revalidates eligibility, confirms the reservation and assignment, derives the appointment end from package duration, and advances the booking to `SCHEDULED` in one transaction. Operations performs audited retry/manual/reassignment intervention and legacy confirmation recovery; authenticated providers list/respond only through their `User → Provider` link. Automated ranking, notifications, and scheduled expiry execution remain outside this foundation.

Operational booking cancellation and rescheduling are coordinated by the Bookings module. Each command locks the booking and atomically closes actionable provider assignments, releases or cancels active capacity reservations, records histories, and updates booking state/scheduling context. Rescheduling never moves an existing reservation to a client-supplied slot or automatically initiates matching.

The Payments module owns quote-backed self-funding initialisation, provider-neutral attempts, verified collection transactions, and the adapter boundary. Successful confirmation settles funding and advances the booking transactionally; after commit it invokes the Providers matching service through an in-process orchestration boundary. Matching failure cannot undo payment. Provider identifiers remain in payment records, and production fails closed without an explicitly configured real adapter.

Public booking creation also creates an expiring booking-scoped session transactionally. Its raw token is delivered only through an HttpOnly cookie while a hash is persisted. Public reads and guest funding resolve the cookie to the exact booking; guest funding identifies its payer through the booking contact snapshot rather than a fabricated account.

Paystack implements the Payments adapter boundary, not the Booking domain. It owns HTTP authentication, subunit conversion, response/status normalization, signature validation, and server-side verification. The payment service remains responsible for immutable attempt/funding expectations and transactional idempotent settlement.

The admin matching queue is an operational read model composed in the Providers/matching boundary from Booking, SELF funding, catalogue, participant-name, and latest-assignment data. It exposes explicit DTOs and performs no lifecycle mutations. Pagination and deterministic oldest-first ordering support intervention for unfulfillable, active-offer, accepted, and assigned work; READY no longer implies that every booking needs a manual start command.

The admin booking-detail read model extends that projection for one booking with authorized operational contact and summarized payment context. Public booking DTOs remain deliberately narrower and never gain contact or internal workflow fields through this endpoint.

Provider offer controllers use the `PROVIDER` role plus an active-provider resolver. The role alone is insufficient without a live provider link, and administrative roles do not inherit provider access. Provider-facing read models intentionally expose only minimal operational booking data.

Provider records exist independently of login accounts and now carry operational identity plus a separate onboarding lifecycle. ADMIN/OPERATIONS creation persists a `PENDING`/`INVITED` Provider and its initial invitation in one transaction, then attempts provider-neutral email delivery after commit. Public self-registration transactionally creates the User, bcrypt credential, `PROVIDER` role, linked Provider, and a `PENDING`/`DRAFT` application. Invitation acceptance also enters `DRAFT` so configuration readiness is checked deliberately at submission. Neither path grants operational activation.

Provider review uses `DRAFT`, `INVITED`, `SUBMITTED`, `APPROVED`, and `REJECTED`, independently from operational `PENDING`, `ACTIVE`, `SUSPENDED`, and `INACTIVE`. A dedicated configuration-context resolver lets linked pending/rejected providers manage only their own capabilities, locations, links, weekly availability, and exceptions without weakening the ACTIVE-only offer resolver. Suspended/inactive providers may inspect configuration but cannot mutate it. ADMIN/OPERATIONS approval uses the same derived profile/capability/location/availability readiness policy as provider submission, then atomically sets onboarding `APPROVED` and operational `ACTIVE`. Rejection retains the account and configuration for correction/resubmission. The legacy activate route only restores an already approved provider; it cannot bypass review.

Provider linking is supported by a separate read-only Users-domain search endpoint. It queries only normalized email and display name, returns a minimized identity plus nullable Provider link, and performs no role or relationship mutation. The provider link command remains the sole authority for eligibility checks and changes.

Provider invitations are a Providers-domain onboarding mechanism, not a generic User invitation system. A Provider-owned invitation stores normalized email, expiry/lifecycle state, creator, and a SHA-256 lookup hash of a one-time opaque token. Acceptance transactionally creates an ACTIVE provider-only User and bcrypt credential, links the Provider, moves a complete new provider profile to `SUBMITTED`, keeps operational status `PENDING`, and consumes the invitation; no session is issued. A legacy provider already backfilled as `APPROVED`/`ACTIVE` retains that reviewed state when its account is linked.

Transactional email is a narrow Notifications-domain port. Provider invitation logic composes provider-neutral text/HTML and calls the selected adapter only after persistence commits. The unavailable, capture-only test, and production Resend adapters share the same contract; future adapters can be added without changing onboarding logic. Delivery results are transient, so no email-delivery schema or vendor identifier is introduced.

Clinical capture is a Health Checks-domain boundary. A booking owns at most one encounter, which is scoped by a composite foreign key to its confirmed assignment/provider/booking tuple. Current structured measurements remain separate from Booking; append-only encounter and measurement histories retain lifecycle and value-change audit context. Provider controllers map explicit DTOs and never return persistence entities or audit rows.

Patient result reads remain in the Health Checks boundary but use different authorization paths from provider writes. Registered reads derive ownership from User → Patient → Booking participant. Guest reads resolve a dedicated hashed access grant to one completed encounter/Patient. Public booking sessions are deliberately absent from this dependency path, so booking and funding authority cannot become clinical authority accidentally.

The account-linking application service bridges these boundaries only for an explicit claim: JWT supplies the current User, while either the booking-session service or result-access service resolves the target Patient from a valid guest proof. Its transaction updates the existing Patient link and revokes guest result grants; it does not transfer records or expand booking/payment permissions.

The patient Health Check history is a separate read projection over Patient-owned bookings, their single encounter, and confirmed assignment provider display name. It applies patient ownership in the database query before pagination, selects no clinical measurements or financial/contact data, and computes result availability from encounter state rather than booking state.

Administrative assignment reads use a separate operational DTO from both persistence entities and provider-facing offers. ADMIN/OPERATIONS users can filter assignments by booking reference, provider, or status, inspect the safe booking/provider context, and invoke the same transactional confirmation service used by matching commands.

## Layer responsibilities

```text
HTTP request
  → controller: routing, guards, HTTP mapping
  → DTO: transformation and validation of external input
  → service: business rules and use-case orchestration
  → repository/entity: persistence in PostgreSQL
```

Controllers stay thin. Services contain business decisions. DTOs and TypeORM entities are separate models so database representation does not become the public API contract.

## Payment-provider boundary

Bookings express funding needs in provider-neutral terms. The Payments module owns funding obligations, payment attempts, payment transactions, provider selection, and provider adapters. Bookings do not contain provider-specific identifiers, statuses, SDK details, or webhook payloads.

```text
Bookings service → Payments application interface → provider adapter → external provider
```

Adapters for Paystack, Flutterwave, Moniepoint, or other providers can be added later. A new provider must not require changes to booking business logic.

## Configuration and schema changes

Configuration, credentials, and provider secrets are supplied through environment variables and centralised typed configuration in `src/config`. The provided `.env.example` defines local defaults. Do not access configuration ad hoc throughout domain code.

PostgreSQL is configured with TypeORM, `autoLoadEntities`, a dedicated CLI data source (`src/database/data-source.ts`), and migrations. `migrationsRun` is `false` by default so schema changes remain explicit. Production schema evolution uses reviewed TypeORM migrations; TypeORM `synchronize` is disabled in production and in the migration data source.

`TYPEORM_SYNCHRONIZE=true` is accepted only in the `development` environment, is `false` by default, and must be used only for disposable local development databases. It cannot enable synchronisation in production. The project currently has migration infrastructure only; no business/domain migrations exist.

## Development commands

See [Development guide](development.md) for prerequisites and local setup. The main commands are:

```bash
npm install
npm run start:dev
npm run build
npm run test
npm run test:e2e
```

Migration commands use the dedicated TypeORM data source:

```bash
npm run migration:generate -- src/database/migrations/DescriptiveMigrationName
npm run migration:run
npm run migration:revert
```

## Delivery approach

Build domains incrementally, beginning with the smallest secure vertical slices. Add tests around business-critical rules as those rules are introduced. Avoid creating entities, integrations, or abstractions ahead of an approved feature.
