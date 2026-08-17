# Domain Map

This is the initial ownership map. It identifies responsibilities, not implemented entities or endpoints.

| Domain | Responsibility | Key future interactions |
| --- | --- | --- |
| Authentication | Identity, login/session or token lifecycle, and access control | Users; all protected API operations |
| Users | Platform user accounts and roles | Patients, providers, organisations, sponsorships |
| Patients | Participant demographic and care-related identity information | Bookings, health checks, sponsorships |
| Providers | Provider profiles, offered services, locations, availability, and booking responses | Bookings, health checks |
| Health Checks | Health-check definitions and submitted results | Patients, providers, bookings |
| Bookings | One-participant booking lifecycle, booker, package, fulfilment mode, preferences, and status | Patients, provider matching, payments, sponsorships |
| Payments | Funding obligations, payment attempts, payment transactions, and provider-neutral adapters | Bookings, organisations, sponsorships |
| Sponsorships | Individual, diaspora, organisation-funded, and sponsored bookings | Patients, bookings, payments, organisations |
| Organisations | Organisation accounts, programmes, eligibility, funding, and participation | Users, patients, sponsorships, payments, bookings |
| Notifications | Delivery of authorised booking and programme communications | Users, patients, providers, organisations |

## Boundary rules

- A domain owns its own business rules and persistence models.
- Health information is accessed only by authorised roles and use cases.
- Booking payment state is consumed through the Payments module, never through a named payment-provider SDK in the Bookings module.
- A booking has exactly one participant; a future booking group/order may relate multiple bookings without changing that rule.
- Package and fulfilment mode are separate configurable catalogue concepts. Pricing may depend on both and is not source-code configuration.
- Booking funding is represented by one or more funding records, not a single `payerId` on the booking.
- Cross-domain operations should be explicit and auditable, especially actions that affect health data, money, eligibility, or booking status.
