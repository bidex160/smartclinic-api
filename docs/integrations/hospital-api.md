# Connecting a hospital, lab or pharmacy system

Most facilities need no integration: staff use the SmartClinic provider portal.
This guide is for a facility that wants its own system (EMR, LIS or pharmacy
software) to send requests and receive updates automatically.

Everything works with two things the facility owner or a team admin sets up
under **Provider portal → Integrations**:

1. An **API key**, which lets your system call SmartClinic.
2. A **webhook URL** (optional), where SmartClinic sends signed updates.

Base URL: `https://<smartclinic-api-host>/api/v1`

## 1. Authenticate

Send the key on every request:

```http
Authorization: Bearer sck_1a2b3c4d_…
```

(`X-SmartClinic-Key: sck_…` also works.)

- The full key is shown once, when it is created. SmartClinic stores only a hash.
- A key acts as the facility itself, with the same rules and privacy as the portal.
- Keys stop working when revoked, or when the facility is suspended.
- At most 10 active keys per facility. Create one per system so you can revoke one without the others.

## 2. Send a request

Confirm the patient's SmartClinic ID first. You get back only a first name and
initial, so you can check it is the right person:

```bash
curl -H "Authorization: Bearer $SMARTCLINIC_KEY" \
  https://<host>/api/v1/integrations/patients/SCP-ABCD-1234
```

Then send a prescription, lab or imaging request, or a referral:

```bash
curl -X POST -H "Authorization: Bearer $SMARTCLINIC_KEY" -H "Content-Type: application/json" \
  https://<host>/api/v1/integrations/requests \
  -d '{
    "patientReference": "SCP-ABCD-1234",
    "type": "LABORATORY",
    "clinicalNote": "Fever for 3 days",
    "diagnosticItems": [{ "name": "Malaria parasite (MP)" }, { "name": "Full blood count" }]
  }'
```

| `type` | Required field | Item fields |
| --- | --- | --- |
| `PRESCRIPTION` | `prescriptionItems` | `medicationName`, plus optional `strength`, `route`, `quantity`, `duration`, `instructions` |
| `LABORATORY`, `IMAGING` | `diagnosticItems` | `name`, plus optional `instructions` |
| `REFERRAL` | `clinicalNote` (the reason and the specialty needed) | none |

The patient gets the request in their SmartClinic app. They approve it and
choose any pharmacy or lab on SmartClinic, whichever EMR that place uses.

## 3. Follow a request

| Method and path | What it does |
| --- | --- |
| `GET /integrations/requests?page=1&limit=20` | Requests you sent, newest first |
| `GET /integrations/requests/{reference}` | One request: status, patient response, chosen place, results |
| `POST /integrations/requests/{reference}/cancel` | Cancel it (body: `{ "reason": "…" }`, optional). Not possible once the place has accepted it. |

## 4. Receive webhooks

Save an `https://` URL in the portal. It must use port 443 and a public address.
SmartClinic shows the signing secret (`whsec_…`) **once**; store it in your
system's secret store.

Each event is a `POST` with a JSON body:

```json
{
  "id": "evt_5f0c…",
  "type": "request.updated",
  "createdAt": "2026-10-01T09:30:00.000Z",
  "data": {
    "requestReference": "SC-ORD-…",
    "requestType": "LABORATORY",
    "handoffReference": "SC-ORF-…",
    "handoffStatus": "ACCEPTED",
    "change": "ACCEPTED"
  }
}
```

Events carry references and statuses only, never health details. Fetch the
request with your API key to get the details.

| Event | Sent to | When |
| --- | --- | --- |
| `request.patient_responded` | the facility that sent the request | The patient approved or declined it |
| `request.updated` | the facility that sent the request | The patient chose a place (`PATIENT_SELECTED`), the place accepted (`ACCEPTED`), referred it on (`REFERRED_ONWARD`), or dispensed it (`DISPENSED`) |
| `request.results_ready` | the facility that sent the request | The lab entered results |
| `handoff.received` | the lab or pharmacy | A patient chose you, or another facility referred a patient to you |
| `ping` | you | You pressed **Send test** in the portal |

### Verify the signature

Each request has these headers:

- `X-SmartClinic-Event`
- `X-SmartClinic-Delivery` (a unique id; use it to ignore duplicates)
- `X-SmartClinic-Signature: t=<unix seconds>,v1=<hex>`

`v1` is the HMAC-SHA256 of `"<t>.<raw body>"`, keyed with your signing secret.
Reject events whose `t` is more than 5 minutes old.

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

function verify(rawBody, header, secret) {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest('hex');
  return expected.length === parts.v1.length && timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
}
```

### Delivery

- Reply with any `2xx` within 10 seconds. Redirects are not followed.
- Failed deliveries are retried with backoff (30 seconds, 1 minute, 2 minutes, …, at most 6 hours apart), up to 8 attempts.
- Delivery may happen more than once. Use `X-SmartClinic-Delivery` to process each event once.
- The portal shows the last 20 deliveries and their status.

## Referral fees

When a lab or pharmacy refers a patient to another facility on SmartClinic, the
referring facility earns a referral fee: 3% of the job by default. The fee comes
out of the receiving facility's share. The patient's price and SmartClinic's
commission do not change. Both facilities see the rate before they act.

## For SmartClinic operators

| Setting | Purpose |
| --- | --- |
| `INTEGRATION_ENCRYPTION_KEY` | Base64 of 32 random bytes (`openssl rand -base64 32`). Encrypts webhook signing secrets. Webhooks stay off until it is set. Changing it means facilities must save their webhook again to get a new secret. |
| `PROVIDER_REFERRAL_FEE_BPS` | Referral fee in basis points (default `300` = 3%, max `2000`). |
| `NOTIFICATION_DISPATCHER_ENABLED` | Webhooks are sent by the same background dispatcher as notifications (on by default outside tests). |

Webhook URLs are checked when saved, and literal private addresses are refused.
Host names are not resolved at that point. If the API runs inside a private
network, also restrict outbound traffic at the network level.
