# Security and Data Principles

## Security baseline

SmartClinic handles sensitive health-related information. Features should be designed with authentication, role-based authorization, validated input, minimal data exposure, secure configuration, and auditability in mind.

- Authenticate callers before access to protected resources.
- Authorise actions by role and relationship to the resource; a role alone may not always be sufficient for patient data access.
- Use DTOs with `class-validator` and `class-transformer` at API boundaries.
- Return the minimum data needed for each API use case.
- Avoid placing health details, credentials, tokens, or other sensitive values in logs and error responses.
- Store secrets only in environment-managed configuration, never in source control.
- Record auditable events for material data access and important state changes when those capabilities are implemented.

## Future access-control boundaries

Authorisation is not implemented yet. It must eventually distinguish access to patient health information, booking information, payment information, provider information, and organisation information; access to one category does not automatically grant access to another.

Booking on behalf of another person also requires future authority and consent rules. These must address adult participants, minors, and dependent participants. Being the booker or funder does not automatically grant access to the participant's health information.

Package-price creation, scheduling, listing, and deactivation are operations/admin functions. They are available at `/api/v1/admin/package-prices` only with JWT authentication and an explicit `ADMIN` or `OPERATIONS` role.

Provider capability and provider-location reads and mutations are likewise administrative. Routes under `/api/v1/admin/providers`, `/api/v1/admin/provider-services`, and `/api/v1/admin/provider-locations` require both JWT authentication and an explicit `ADMIN` or `OPERATIONS` role. They expose dedicated response DTOs and do not make provider capability management public.

Provider availability management under `/api/v1/admin/providers/:providerId/availability` and `/api/v1/admin/provider-availability` has the same JWT and `ADMIN`/`OPERATIONS` requirement. Availability is operational network data and is not exposed publicly.

Provider matching commands to start/retry matching, confirm accepted assignments, and expire stale offers are restricted to authenticated `ADMIN` or `OPERATIONS` users under `/api/v1/admin`. Provider accept/decline behavior exists only as ownership-checking service operations; it has no HTTP route until a provider-authenticated role and resource relationship are available.

## Authentication foundation

Email/password accounts use a normalized-email unique lookup and a separate credential record containing only a bcrypt password hash. Authentication returns a short-lived JWT access token configured with `JWT_SECRET` and `JWT_EXPIRES_IN`; no secret is hardcoded for runtime environments. Protected routes verify both the token and that the current user remains `ACTIVE` and not deleted.

Login creates a server-side refresh session with only a hash of a cryptographically random opaque token. The raw refresh token is delivered only in an HttpOnly cookie, rotates on every refresh, and is never returned in JSON. Logout revokes the current session; logout-all revokes the authenticated user's sessions. Browser clients must send credentialed requests to the configured frontend origin.

Initial roles are `USER`, `ADMIN`, and `OPERATIONS`. The reusable `@Roles()` decorator and roles guard protect the package-price management routes and support future administrative APIs.

## Data handling

- Keep database entities distinct from API DTOs.
- Use PostgreSQL and TypeORM migrations for durable schema changes.
- Do not enable TypeORM schema synchronisation in production.
- Use production-like data only when properly authorised and protected; never add real patient data to the repository.

## Claims and scope

These principles describe engineering intent. They do not establish, imply, or certify compliance with any health, privacy, payment, or security regulation.
