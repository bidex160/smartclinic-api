# Health result access

Health-result authority is separate from booking and payment authority. A booking reference is public, and the public booking-session cookie authorizes only its documented booking/funding operations. Neither grants access to clinical measurements.

## Registered patients

`GET /api/v1/me/health-checks/:bookingReference/results` requires JWT authentication. The current active User must have an active, non-deleted Patient whose `user_id` equals the User ID, the booking participant must be that Patient, and the encounter must be `COMPLETED`. Email, phone, booker identity, payment responsibility, or booking-session possession are never used to infer patient identity. Ordinary `USER` accounts need no additional PATIENT role because authorization comes from the one-to-one User/Patient link.

`GET /api/v1/me/health-checks` is the corresponding read-only history. It accepts only optional `bookingStatus`, `encounterStatus`, `page`, and `limit` parameters; patient/user identifiers are not part of the contract. It returns newest bookings first, exposes safe scheduling/catalogue/provider-display/encounter summaries, and never includes measurement values. `hasCompletedResult` is true only when the booking has an actual `COMPLETED` encounter, after which the detailed endpoint above may be used. A User with no active linked Patient receives an empty page (`items: []`, `total: 0`) rather than an identity-link error.

Pagination defaults to page 1 and limit 20, with a maximum limit of 100. Provider display name comes only from the confirmed assignment and is null when no confirmed provider exists. Incomplete, cancelled, expired, and unfulfillable bookings may appear because this is “My Health Checks,” not only “My Results.” Multi-role users remain scoped through the same User/Patient relationship; ADMIN or PROVIDER roles do not broaden a `/me` query.

## Guest patients

Guest access uses `health_result_access_grants`, not a booking session. After an explicit operational identity-verification step, ADMIN/OPERATIONS may issue a grant for a completed encounter whose Patient has no linked User. A 256-bit opaque base64url token is returned once for manual delivery; only its SHA-256 hash is stored. The grant is scoped to exactly one encounter and Patient, expires according to `HEALTH_RESULT_ACCESS_TTL`, may be revoked, and records its last successful use.

Issuance is `POST /api/v1/admin/health-check-encounters/:id/result-access`; revocation is `POST /api/v1/admin/health-result-access/:id/revoke`. `GET /api/v1/public/health-results/:token` accepts only the dedicated result token. Invalid, expired, revoked, incomplete, or mismatched grants receive the same safe unavailable response. No email/SMS delivery or identity-verification workflow is automated yet.

The result response contains the booking reference, completion time, package, provider display name, and current completed measurements. It excludes histories, assignment/provider IDs, contacts, payments, funding, booker data, interpretation, reference ranges, and reports.

If a guest Patient is linked to a User later, existing guest grants are neither migrated nor automatically revoked in this foundation. A future verified linking/consent policy must decide that behavior explicitly; email matching is never sufficient.

Family, guardian, and dependent access remain deferred. A User can list only the Patient linked directly to that User.
