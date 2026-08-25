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

Provider capability and provider-location support routes under `/api/v1/admin/providers`, `/api/v1/admin/provider-services`, and `/api/v1/admin/provider-locations` require both JWT authentication and an explicit `ADMIN` or `OPERATIONS` role. Provider-owned configuration routes under `/api/v1/provider/services` and `/api/v1/provider/locations` instead require `PROVIDER` and derive ownership exclusively from the authenticated User-to-Provider link. Neither boundary exposes raw entities.

Provider availability and exception self-service routes require JWT plus `PROVIDER`, perform ownership checks before every ID-based operation, and return safe 404 responses for foreign records. Pending/rejected providers can configure onboarding; suspended/inactive providers may read but cannot mutate. This resolver is deliberately separate from the ACTIVE-only provider resolver used for offers, encounters, and matching work. Admin availability routes retain their ADMIN/OPERATIONS support boundary, and none of these APIs is public.

Self-service configuration cannot change `Provider.userId`, account roles, operational/onboarding status, or review fields. Configuration changes never activate a provider. Submission and approval share one derived readiness policy, while actual matching independently continues to require operational `ACTIVE` status.

Provider matching intervention commands and assignment-management reads are restricted to authenticated `ADMIN` or `OPERATIONS` users under `/api/v1/admin`. This includes retrying, normally selecting an eligible provider, explicit reason-required override, reassignment, listing/inspection, confirmation, and stale-offer expiry. USER and PROVIDER-only accounts are denied. Override and reassignment persist actor/reason history; no provider self-service route exposes these powers. Assignment read models expose provider/booking operational context but omit contacts, payment/funding data, credentials, broad patient data, and raw histories.

Provider capacity reservations are internal scheduling records created and confirmed transactionally through provider acceptance; operations confirmation remains a legacy recovery path. No public or arbitrary reservation-mutation API is exposed. Cancellation/reassignment must release capacity within the authorised lifecycle transaction.

Booking cancellation and rescheduling commands are restricted to JWT-authenticated `ADMIN` or `OPERATIONS` users at `/api/v1/admin/bookings/:reference/cancel` and `/api/v1/admin/bookings/:reference/reschedule`. Responses contain only the booking reference, resulting status and scheduling context, plus assignment/reservation impact counts. They do not expose histories, funding, payment, patient, or provider internals.

The manual appointment command at `/api/v1/admin/bookings/:reference/schedule` retains its ADMIN/OPERATIONS boundary for exceptional workflows. Routine provider acceptance schedules server-side after revalidating capability, location/service area, availability, exceptions, and capacity. Neither path accepts provider or reservation authority from untrusted client input, and their DTOs exclude contact, payment, reservation IDs, and histories.

Structured booking address is collected for both HOME_VISIT and PROVIDER_LOCATION. HOME_VISIT provider views receive the minimum street address needed to perform owned work. Physical-location provider offer and encounter DTOs do not expose the patient's street address; matching uses it internally and providers receive their own confirmed branch context. Patient `/me` projections expose a geographic origin summary and, after scheduling, the authorized ProviderLocation destination without its internal ID.

Dashboard summary routes return counts only. `/api/v1/provider/dashboard/summary` requires the PROVIDER role and the same active linked Provider resolution as operational offer access; no provider identifier is accepted. `/api/v1/admin/dashboard/summary` requires ADMIN or OPERATIONS. Neither response contains patients, bookings, assignments, addresses, payment/funding records, or internal identifiers. Provider revenue, earnings, balances, and settlement metrics are intentionally absent until a provider earnings/settlement domain exists.

Administrative funding and test-adapter commands remain restricted to JWT-authenticated `ADMIN` or `OPERATIONS` users. Public funding initialisation requires the `smartclinic_public_booking_session` HttpOnly cookie bound to the exact reference; the reference alone grants nothing. Tokens are 256-bit random values, only SHA-256 hashes are stored, expiry/revocation is enforced, and wrong-reference failures are generic. Cookies are Secure in production, default to `SameSite=Lax`, are path-scoped, and credentialed CORS remains restricted to `FRONTEND_URL`.

Public responses never contain raw tokens, token hashes, funding IDs, or internal booking UUIDs. Real production payment initiation remains deferred.

Paystack secrets are backend-only configuration and never appear in responses, logs, bookings, or browser metadata. Public checkout requires the booking session and returns only a safe hosted checkout URL and normalized attempt reference. The unauthenticated Paystack webhook is authenticated instead with HMAC-SHA512 over the exact raw body, then independently verified against Paystack before settlement. Unsigned, malformed, or mismatched reference/amount/currency inputs cannot fund a booking. Raw webhook bodies are not persisted.

Public payment-status reads and refreshes require the same booking-bound session and cannot select a payment attempt or provider reference. Status responses expose only operational booking/funding/attempt state, amount, currency, and paid time. Manual provider verification is throttled per attempt and shares the webhook's locked, idempotent settlement path; redirect parameters grant no authority.

Registered payment routes under `/api/v1/me/health-checks/:reference/payment` require JWT plus the USER role and resolve ownership only through the active User's active SELF Patient and the booking participant. A booking reference, booker identity, payer identity, Patient reference, or another role alone is insufficient. Cross-Patient access returns the same narrow not-found response and payment responses expose no internal IDs or provider secrets.

Checkout option selection also requires the booking-bound session. `PAYMENT_LINK` exposes only Paystack's hosted navigation URL and no SmartClinic private booking data or authority; the external payer does not need a SmartClinic session merely to open Paystack. `PAY_LATER` remains outstanding and cannot trigger matching or reserve capacity. All collection options use server-owned amount, currency, reference, and backend-authoritative settlement.

The admin matching queue requires JWT authentication plus ADMIN or OPERATIONS role. USER and PROVIDER-only identities are denied. Its response is limited to scheduling, catalogue, minimal participant name, funding status, and latest assignment/provider display context; it excludes contacts, date of birth, payment-provider data, raw histories, and candidate sets.

`GET /api/v1/admin/bookings/:reference` uses the same role boundary and may additionally return the minimum booker contact needed by operations. Guest contact snapshots provide structured name, email, and phone. Registered User records currently provide only display name and email, so unavailable structured name/phone fields remain null rather than being inferred from participant data. The public booking response remains contact-minimized and structurally separate.

Start-matching and stale-expiry command responses use minimized operational summaries rather than returning matching-service internals. They expose no provider candidate IDs, internal booking UUIDs, reason codes/notes, raw transitions, or per-assignment expiry detail beyond the intentionally returned new `assignmentId` and offer deadline.

Provider self-service routes under `/api/v1/provider/offers` require the explicit `PROVIDER` role and resolve the authenticated user through the unique `Provider.user_id` link. The linked provider must remain `ACTIVE` and not deleted. `USER`, `ADMIN`, or `OPERATIONS` alone grants no provider access; a multi-role user must also explicitly hold `PROVIDER`. Role assignment and provider linking are controlled onboarding/admin responsibilities, never automatic registration behavior.

Clinical encounter routes under `/api/v1/provider/bookings/:reference/health-check` use the same role and active-provider resolution, then additionally require a `CONFIRMED` assignment owned by that Provider. Non-owned and missing bookings/encounters return the same narrow not-found boundary. Responses contain only minimal participant name, catalogue context, encounter timestamps/status, and the six measurements. Owned HOME_VISIT encounters additionally receive the structured operational visit address and optional directions; PROVIDER_LOCATION encounters do not receive a home address. Responses omit booker contacts, DOB, funding, payments, service-area identifiers, provider/account identifiers, guest sessions, and audit histories. ADMIN or OPERATIONS alone has no clinical write access. No public, guest-session, patient, or broad admin result endpoint exists.

Patient result access is a distinct authority boundary. Registered reads under `/api/v1/me/health-checks/:reference/results` require an authenticated active User linked through `Patient.user_id`, exact booking-participant ownership, and a completed encounter. Guest reads use only a separately issued 256-bit opaque result token whose SHA-256 hash is stored in an encounter/Patient-scoped grant. Booking references, booker/funder identity, public booking-session cookies, email, and phone grant no result access. Grant issuance/revocation requires ADMIN or OPERATIONS, but those roles alone do not authorize reading results. Tokens are returned once, never logged or stored raw, expire server-side, may be revoked, and cannot authorize any booking/payment/provider route.

`GET /api/v1/me/health-checks` uses the same authenticated User → active Patient link but returns only a paginated operational history. The query has no patient/user identifier input. Items expose only summarized funding/attempt status and omit measurements, contacts, DOB, provider payment references, entity IDs, assignment details, histories, tokens, and sessions. A completed booking without a completed encounter is not advertised as having results. No linked Patient produces a safe empty page; family/dependent aggregation is not implemented.

Patient portal routes require the explicit USER role and resolve the SELF Patient only through the unique User→Patient link. Registration creates a fresh SELF Patient and never claims guest records using name, email, or phone. Booker and payer relationships grant no health access. Patient references are identifiers rather than secrets and have no lookup/authorization endpoint. Provider identification, consent grants, and audited record access remain future work.

Legacy generic `/bookings` creation/reference reads are restricted to ADMIN/OPERATIONS. Guests use the booking-session-protected `/public/bookings` boundary, while registered patients use participant-ownership-scoped `/me/health-checks`; a public reference alone grants no booking read.

Patient account claiming is an explicit two-authority operation: the caller must have an active authenticated User session and must separately prove control through either a booking-bound public session or an active completed-result grant. `/api/v1/public/bookings/:reference/link-patient-account` (kept inside the cookie's narrow path) and `/api/v1/me/patient/link-from-result` never accept User/Patient identifiers or use email/phone matching. A locked transaction updates the existing Patient only, relies on the unique `patients.user_id` constraint against concurrent claims, and revokes its active guest clinical grants. Booking sessions remain valid solely for their prior booking/funding scope; account linking grants no new booking/payment authority.

Provider creation and review under `/api/v1/admin/providers` require ADMIN or OPERATIONS. Creation accepts no status, roles, user ID, capabilities, or locations; it creates a non-active provider and one invitation. Safe responses expose profile/onboarding state and transient delivery outcome, never credentials, token hashes, sessions, or raw email-provider details. A manual invitation link is returned only when delivery is unavailable or failed.

Public provider self-registration creates only a `PROVIDER` account and a non-active submitted application. Provider-authenticated profile/update/submit routes require the explicit role and exact User→Provider link, but intentionally do not require operational ACTIVE status; they cannot mutate roles, review fields, or ProviderStatus. Approval/rejection remains ADMIN/OPERATIONS-only. Existing-user linking preserves roles, and unlinking remains blocked by active work.

`GET /api/v1/admin/users/search` uses the same ADMIN/OPERATIONS boundary to support account selection. Queries must contain 2–100 trimmed characters and are limited to normalized email/display-name matching with bounded pagination. Soft-deleted users are excluded; inactive users remain visible with their status, and an existing Provider link is shown to explain linking conflicts. Results never include credentials, sessions, tokens, patient data, bookings, or login metadata. Search grants no role and creates no link.

Provider invitations use 256-bit random base64url tokens and store only SHA-256 hashes. After the invitation transaction commits, the token exists transiently while a provider-neutral email adapter receives the configured setup link. Resend authentication uses the backend-only `RESEND_API_KEY`; provider errors, credentials, request bodies, tokenized URLs, and provider message IDs never enter responses or logs. A successful send removes token material from the HTTP response; unavailable or failed delivery returns the same link once to ADMIN/OPERATIONS for manual delivery. List/revocation responses remain token-free. Public inspection reveals only Provider display name, masked email, and expiry. Acceptance uses the invitation email as authority, applies the existing 12–128 character password policy and bcrypt cost 12, issues no session, and requires normal login afterward. Existing User emails are rejected to prevent public-token account takeover and must use explicit existing-user linking. `PROVIDER_INVITATION_TTL` is expressed in seconds and `PROVIDER_INVITATION_FRONTEND_URL` supplies the setup-route base; both must be explicit in production. Invitation resend is unavailable because the one-time raw token is deliberately unrecoverable.

Provider offer responses are deliberately minimized: they omit account IDs, provider IDs, booking database IDs, funding/payment data, patient records, contacts, date of birth, and the unstructured location note. Non-owned and unknown offer IDs both return the same safe 404.

## Authentication foundation

HOME_VISIT street addresses are sensitive operational location data. Public/session and patient history responses expose summaries only; matching queues expose city/state/country; full addresses are limited to ADMIN/OPERATIONS booking detail and providers acting on their own relevant work. Provider service-area self-service derives Provider identity from the authenticated linked account, never accepts provider ownership from input, and rejects cross-provider service references. Service areas contain coverage configuration, not patient addresses.

Email/password accounts use a normalized-email unique lookup and a separate credential record containing only a bcrypt password hash. Authentication returns a short-lived JWT access token configured with `JWT_SECRET` and `JWT_EXPIRES_IN`; no secret is hardcoded for runtime environments. Protected routes verify both the token and that the current user remains `ACTIVE` and not deleted.

Login creates a server-side refresh session with only a hash of a cryptographically random opaque token. The raw refresh token is delivered only in an HttpOnly cookie, rotates on every refresh, and is never returned in JSON. Logout revokes the current session; logout-all revokes the authenticated user's sessions. Browser clients must send credentialed requests to the configured frontend origin.

Roles are `USER`, `ADMIN`, `OPERATIONS`, and `PROVIDER`. Public registration assigns only `USER`. The reusable `@Roles()` decorator and roles guard protect administrative and provider-scoped APIs.

## Data handling

- Keep database entities distinct from API DTOs.
- Use PostgreSQL and TypeORM migrations for durable schema changes.
- Do not enable TypeORM schema synchronisation in production.
- Use production-like data only when properly authorised and protected; never add real patient data to the repository.

## Claims and scope

These principles describe engineering intent. They do not establish, imply, or certify compliance with any health, privacy, payment, or security regulation.
