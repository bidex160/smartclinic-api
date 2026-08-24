# Health result access

Health-result authority is separate from booking and payment authority. A booking reference is public, and the public booking-session cookie authorizes only its documented booking/funding operations. Neither grants access to clinical measurements.

## Registered patients

`GET /api/v1/me/health-checks/:bookingReference/results` requires JWT authentication. The current active User must have an active, non-deleted Patient whose `user_id` equals the User ID, the booking participant must be that Patient, and the encounter must be `COMPLETED`. Email, phone, booker identity, payment responsibility, or booking-session possession are never used to infer patient identity. Ordinary `USER` accounts need no additional PATIENT role because authorization comes from the one-to-one User/Patient link.

`GET /api/v1/me/health-checks` is the corresponding read-only history. It accepts only optional `bookingStatus`, `encounterStatus`, `page`, and `limit` parameters; patient/user identifiers are not part of the contract. It returns newest bookings first, exposes safe scheduling/catalogue/provider-display/encounter summaries, and never includes measurement values. `hasCompletedResult` is true only when the booking has an actual `COMPLETED` encounter, after which the detailed endpoint above may be used. A User with no active linked Patient receives an empty page (`items: []`, `total: 0`) rather than an identity-link error.

`GET /api/v1/me/profile` returns the safe USER/SELF Patient profile and public patient reference. `GET /api/v1/me/health-checks/:reference` returns one patient-safe booking detail only when its participant is that SELF Patient. History items include a derived portal category plus summarized funding/payment state; BookingStatus and encounter state remain authoritative. These `/me` routes require the USER role—provider/admin authority alone cannot masquerade as patient authority.

Pagination defaults to page 1 and limit 20, with a maximum limit of 100. Provider display name comes only from the confirmed assignment and is null when no confirmed provider exists. Incomplete, cancelled, expired, and unfulfillable bookings may appear because this is “My Health Checks,” not only “My Results.” Multi-role users remain scoped through the same User/Patient relationship; ADMIN or PROVIDER roles do not broaden a `/me` query.

## Guest patients

Guest access uses `health_result_access_grants`, not a booking session. After an explicit operational identity-verification step, ADMIN/OPERATIONS may issue a grant for a completed encounter whose Patient has no linked User. A 256-bit opaque base64url token is returned once for manual delivery; only its SHA-256 hash is stored. The grant is scoped to exactly one encounter and Patient, expires according to `HEALTH_RESULT_ACCESS_TTL`, may be revoked, and records its last successful use.

Issuance is `POST /api/v1/admin/health-check-encounters/:id/result-access`; revocation is `POST /api/v1/admin/health-result-access/:id/revoke`. `GET /api/v1/public/health-results/:token` accepts only the dedicated result token. Invalid, expired, revoked, incomplete, or mismatched grants receive the same safe unavailable response. No email/SMS delivery or identity-verification workflow is automated yet.

The result response contains the booking reference, completion time, package, provider display name, and current completed measurements. It excludes histories, assignment/provider IDs, contacts, payments, funding, booker data, interpretation, reference ranges, and reports.

## Guest Patient account linking

An authenticated active User may explicitly claim an existing guest Patient through either `POST /api/v1/public/bookings/:reference/link-patient-account`, using the still-valid booking-bound HttpOnly session cookie, or `POST /api/v1/me/patient/link-from-result`, with an active result-access token in the request body. The booking command remains under the public-booking path so the deliberately narrow cookie path can be preserved; it still requires JWT authentication. The server derives the Patient from the proved booking or encounter; neither endpoint accepts a Patient ID or User ID, and email/phone similarity is never ownership proof.

The link command locks the User and Patient, enforces the v1 one-to-one relationship, and updates the existing Patient rather than copying any booking, encounter, measurement, or result. Retrying with the same independently valid proof is idempotent; a User or Patient linked elsewhere produces a conflict without disclosing the other account.

After a successful link, all ACTIVE guest result grants for that Patient are marked `REVOKED` and retained as records. Authenticated `/me/health-checks` and detailed result access then work through the unchanged Patient and its historical records. Public booking sessions are not revoked or promoted: they retain only their original booking/funding authority. Linking does not grant authenticated control over historical public bookings or payments. Profile reconciliation, dependent/family linking, and formal identity-verification/consent workflows remain deferred.

The Patient reference is intended to support a future consented provider identification workflow, but no provider lookup is exposed. Future access must require explicit scoped/time-limited Patient consent and auditing; the reference alone can never authorize records.

Family, guardian, and dependent access remain deferred. A User can list only the Patient linked directly to that User.
