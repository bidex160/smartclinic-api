# Transactional email boundary

SmartClinic sends transactional email through the provider-neutral `EmailProvider` contract. Provider onboarding supplies recipient and message content to that contract and does not know about vendor SDKs, credentials, or message identifiers.

`EMAIL_PROVIDER=none` is the default outside tests. It performs no network delivery and causes provider-invitation creation to return `MANUAL_REQUIRED` with a one-time `manualInvitationLink`. The capture-only `test` provider records messages in memory for automated/local assertions and is rejected in production. A production vendor remains a separate adapter task; until one exists, automatic delivery fails closed while explicit manual delivery remains available.

The sender is configured with `EMAIL_FROM_ADDRESS` and `EMAIL_FROM_NAME`. `PROVIDER_INVITATION_FRONTEND_URL` is the setup-route base; the opaque token is appended as one path segment. The invitation email contains the Provider display name, invited email context, setup link, expiry, single-use warning, and unexpected-invitation guidance in both text and HTML.

Invitation persistence finishes before delivery begins, so an email outage does not roll back or delete the invitation. `SENT` omits all token material from the creation response. `MANUAL_REQUIRED` and `FAILED` return the same ephemeral setup link once; vendor errors are not returned. Tokens and full links are never stored or logged, and list/revoke responses remain token-free.

Resend is intentionally unsupported: only a SHA-256 token hash is stored, so the original link cannot be reconstructed. Supporting retry requires an explicit replacement-invitation command that revokes the old token and issues a new one; weakening token storage is not acceptable. Delivery-event persistence and actual email delivery providers are deferred.
