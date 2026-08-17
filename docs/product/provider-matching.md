# Provider Matching

## Domain boundary

Provider matching is a separate concern from the booking lifecycle. It selects and secures a capable provider for a booking after the booking is eligible for fulfilment. Matching decisions must be recorded independently because multiple providers may be considered or decline before one accepts.

The confirmed v1 approach is **hybrid**: the platform supports eligible-provider discovery and provider offers while authorised operations staff can intervene manually. The product does not define a matching algorithm yet. Future matching may consider:

- Whether the provider offers the requested service or package.
- Service location and travel/service area.
- Provider availability for the requested time.
- Home-visit capability.
- Organisation programme requirements.
- Provider status, including whether the provider is active and eligible to receive work.

## Proposed provider-assignment lifecycle

```text
PENDING_MATCH
  → OFFERED
  → ACCEPTED
  → CONFIRMED

OFFERED → DECLINED → PENDING_MATCH
OFFERED → EXPIRED  → PENDING_MATCH
PENDING_MATCH → UNMATCHED
PENDING_MATCH / OFFERED / ACCEPTED / CONFIRMED → CANCELLED
```

`OFFERED` is the proposed-provider state; it should not be called an accepted assignment. `ACCEPTED` records a provider's affirmative response. `CONFIRMED` means the platform has made that accepted assignment active for service delivery. In a simple initial implementation, acceptance and confirmation may be performed atomically, but retaining the distinction protects the model if later operations or participant confirmation is required.

| Assignment state | Meaning | Who may transition it | Important rules | Representation |
| --- | --- | --- | --- | --- |
| `PENDING_MATCH` | The booking is eligible and no provider offer is currently awaiting response. | Matching service; authorised operations staff. | Booking must be in `PENDING_PROVIDER_MATCH` or be returning from an unsuccessful offer. | Enum on a matching request or active matching cycle; history record. |
| `OFFERED` | A provider has been invited to take the booking. | Matching service; authorised operations staff. | Offer must include a response deadline and eligibility snapshot. A provider must not receive conflicting offers beyond approved capacity. | Relational provider-offer record with enum; history/event. |
| `ACCEPTED` | The offered provider accepted. | The offered provider; authorised operations staff acting with authority. | Must be within deadline and the provider must still be eligible/available. Acceptance should be idempotent. | Offer/assignment enum; history/event. |
| `CONFIRMED` | An accepted provider assignment is active. | Matching service; authorised operations staff. | Creates the single active assignment and advances booking to `PROVIDER_ASSIGNED`. | Relational assignment record with enum; history/event. |
| `DECLINED` | The provider rejected the offer. | The offered provider; authorised operations staff. | Capture an optional reason. It does not reject the booking; matching continues. | Terminal enum for that offer; history/event. |
| `EXPIRED` | The provider did not respond by the response deadline. | System automation; authorised operations staff. | Does not reject the booking; matching continues or is escalated. | Terminal enum for that offer; history/event. |
| `UNMATCHED` | Matching ended without an acceptable provider. | Matching service after configured policy; authorised operations staff. | This is a matching result. It moves the related booking to `UNFULFILLABLE`, from which operations may retry, change fulfilment details, or cancel under policy. | Enum on matching cycle; history record. |
| `CANCELLED` | The matching cycle or active assignment ended because the booking changed or was cancelled. | Booking service; authorised operations staff. | Capture whether cancellation occurred before or after confirmation and why. | Enum; history/event. |

## Relationship to the booking lifecycle

When funding is sufficient, the booking moves to `PENDING_PROVIDER_MATCH` and a matching cycle begins in `PENDING_MATCH`. Provider decline or offer expiry remains within matching and keeps the booking in `PENDING_PROVIDER_MATCH`. An `UNMATCHED` result moves the booking to `UNFULFILLABLE`; it is not an automatic cancellation. On an active confirmed assignment, the booking advances to `PROVIDER_ASSIGNED`, then to `SCHEDULED` when appointment details are confirmed.

This intentionally replaces the ambiguous booking milestone `PROVIDER_ACCEPTED` with an assignment-level acceptance event/state. A booking-level `providerMatchingStatus` may be exposed as a read-model summary for clients, but its source of truth should be matching records and history, not a duplicated independent state machine.

## History and auditability

Matching needs relational records, not only a booking enum: a single booking can have multiple matching cycles, provider candidates, offers, declines, expiries, and reassignment actions. Each offer and assignment should preserve actor, timestamps, reason, relevant eligibility snapshot, and state-transition history. Sensitive provider and participant information must be visible only to authorised users and only at the point it is necessary.

## Decisions required before entities

- Should implementation send provider offers sequentially or concurrently? This is intentionally deferred to matching implementation.
- What is the response deadline, and may it differ by package, location, or home visit?
- What participant details can a provider see before accepting an offer?
- Can a participant reject or change an assigned provider, and under what policy?
- Does provider acceptance immediately schedule the appointment, or is participant/operations confirmation required?
- What happens if a confirmed provider withdraws, becomes unavailable, or is suspended?
- What matching threshold or operational review moves a cycle to `UNMATCHED` and the booking to `UNFULFILLABLE`?
