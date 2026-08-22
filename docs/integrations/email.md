# Transactional email boundary

SmartClinic sends transactional email through the provider-neutral `EmailProvider` contract. Provider onboarding supplies recipient and message content to that contract and does not know about vendor SDKs, credentials, or message identifiers.

Normal administrative provider creation now creates the initial invitation automatically. Provider and invitation persistence commits before external delivery. `SENT` responses omit token material; `MANUAL_REQUIRED` and `FAILED` responses include the one-time setup link for manual delivery. The raw token remains absent from storage and logs. The older provider-specific invitation endpoint remains compatible for controlled follow-up invitation operations.

Provider choice is explicit: `EMAIL_PROVIDER=none` performs no network delivery, `test` captures messages in memory and is rejected in production, and `resend` selects the first production adapter. Merely defining `RESEND_API_KEY` does not enable Resend. When `resend` is selected, startup validation requires both `RESEND_API_KEY` and `EMAIL_FROM_ADDRESS`; missing configuration fails closed.

The sender is configured with `EMAIL_FROM_ADDRESS` and optional `EMAIL_FROM_NAME`, producing either `Name <address>` or the bare address. `PROVIDER_INVITATION_FRONTEND_URL` is the setup-route base; the opaque token is appended as one path segment. The invitation email contains the Provider display name, invited email context, setup link, expiry, single-use warning, and unexpected-invitation guidance in both text and HTML.

The Resend adapter uses the official Node.js SDK and maps only the provider-neutral sender, recipient, subject, HTML, text, and optional idempotency key. Provider responses and errors do not cross the adapter boundary. Invitation delivery uses `provider-invitation:<invitation-id>:initial`, which is stable, contains no token, and protects practical retries without implementing an automatic retry loop. `EMAIL_SEND_TIMEOUT_MS` bounds how long invitation creation waits (10 seconds by default). SDK/provider/network/timeout/rate-limit failures become the existing sanitized `FAILED` manual-fallback result.

Before production sending, create a Resend account and a suitably scoped sending API key, verify the SmartClinic sending domain, configure `EMAIL_FROM_ADDRESS` on that verified domain, set `EMAIL_PROVIDER=resend`, and place `RESEND_API_KEY` in backend secret management. SmartClinic does not automate account, key, or domain verification. Future SendGrid, Postmark, or SES integrations can implement the same interface without changing invitation logic.

Invitation persistence finishes before delivery begins, so an email outage does not roll back or delete the invitation. `SENT` omits all token material from the creation response. `MANUAL_REQUIRED` and `FAILED` return the same ephemeral setup link once; vendor errors are not returned. Tokens and full links are never stored or logged, and list/revoke responses remain token-free.

Invitation resend is intentionally unsupported: only a SHA-256 token hash is stored, so the original link cannot be reconstructed. Supporting retry requires an explicit replacement-invitation command that revokes the old token and issues a new one; weakening token storage is not acceptable. Delivery-event persistence remains deferred.
