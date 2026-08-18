# Smart Health Check

## Service definition

The Smart Health Check is SmartClinic's primary service and the subject of the platform's principal action: **Book My Smart Health Check**.

The initial check records blood pressure, blood glucose, BMI, temperature, oxygen saturation, and pulse. The first capture foundation stores these as explicit measurement codes on a HealthCheckEncounter; it does not define reference ranges, diagnosis, alerts, or interpretation.

Initial packages are Essential and Complete. The initial fulfilment modes are `PROVIDER_LOCATION` and `HOME_VISIT`; Home Visit is not a package. Package benefits, estimated duration, eligibility, fulfilment modes, and pricing are configurable business data. The final price may depend on both package and fulfilment mode and its effective date. Additional values can be introduced later, and prices must not be hardcoded.

The approved v1 package definitions below distinguish Essential and Complete and define their estimated durations. The catalogue seed reflects these approved package benefits and durations only. Commercial prices are operational, effective-dated data in `package_prices`; they are never hardcoded or seeded. The pricing table below still requires final amounts and an effective date.
## Server-side booking quotes

At booking creation, the API resolves the selected package and fulfilment mode against the active, effective catalogue price. A price is eligible only when it is active, its `effectiveFrom` date has started, and its `effectiveTo` is absent or still in the future. Clients do not submit or determine a booking amount or currency.

V1 booking creation uses the Nigeria-first `NGN` catalogue policy. The catalogue schema can retain prices in other currencies, but the booking API neither selects them nor performs currency conversion. If no eligible NGN price exists, the API rejects the booking with a `422 Unprocessable Entity` response.

The resolved amount and currency are copied to the booking as an immutable quote snapshot. Later catalogue price changes affect new bookings only; they do not alter historical booking quotes.

## Price management

Operations will manage `PackagePrice` records through an authenticated, authorised admin capability. A price may start immediately or be scheduled for a future date. A normal price change closes the preceding active range at the new price's `effectiveFrom` date and creates a new historical row; it does not rewrite a historical amount. Prices can be deactivated without deletion.

Changing catalogue pricing does not require a deployment. The management API is available only to authenticated `ADMIN` and `OPERATIONS` users; unauthenticated and regular-user requests are denied.

## Booking parties

A health check may be booked for the booker, another individual or family member, a sponsored participant, or a participant covered by an organisation programme. Each booking represents exactly one participant/patient. A family booking is a set of individual bookings; a future booking group/order may relate them. The following concepts must remain distinct:

| Concept | Meaning | May be the same as another party? |
| --- | --- | --- |
| Booker | The user or authorised actor who creates and manages the booking request. | Yes; may also be participant or payer. |
| Participant/Patient | The individual who receives the health check and whose health data is recorded. | Yes; may also be booker or payer. |
| Payer/Funder | An individual, sponsor, organisation, or programme responsible for some or all of the financial obligation. | Yes; may also be booker or participant. Multiple funders are permitted. |
| Organisation | An employer, programme owner, or other organisation that can determine eligibility and fund checks. | Sometimes the payer; it is not a person. |

The booking must reference these roles independently where applicable. It must not infer funder identity from the participant or booker, or use a single payer field as its only funding model. A sponsor may be a parent, partner, diaspora family member, or other individual. An organisation may fund an employee, member, or community participant through a programme.

## Authority and privacy

The participant's health data is sensitive. Booking and payment authority do not automatically grant access to health-check results. Booking on behalf of another person requires authority and consent rules. Adult, minor, and dependent participant consent are future access-control requirements; they are not implemented by this documentation.

Patient health information, booking information, payment information, provider information, and organisation information will each have distinct access controls. The exact authorisation rules are intentionally deferred.

## Encounter capture foundation

`HealthCheckEncounter` is separate from Booking and is bound to the booking's confirmed ProviderAssignment and Provider. V1 permits one encounter per booking. Its lifecycle is `DRAFT → IN_PROGRESS → COMPLETED`; starting records `startedAt`, completion records `completedAt`, and completed encounters cannot be edited normally.

The authenticated, active Provider owning the confirmed assignment may start, view, save, and complete through `/api/v1/provider/bookings/:reference/health-check`. ADMIN or OPERATIONS roles do not inherit clinical write access unless the user separately has `PROVIDER` and resolves to the owning active Provider. Public booking sessions and patient/public endpoints expose no encounter or measurement data.

| Code | Values | Unit |
| --- | --- | --- |
| `BLOOD_PRESSURE` | systolic + diastolic | `mmHg` |
| `BLOOD_GLUCOSE` | primary | `mg/dL` |
| `BMI` | primary | `kg/m²` |
| `TEMPERATURE` | primary | `°C` |
| `OXYGEN_SATURATION` | primary | `%` |
| `PULSE` | primary | `bpm` |

`mg/dL` is the explicit Nigeria-facing v1 glucose capture unit and still requires clinical/product confirmation before multi-unit support. Units are assigned server-side rather than accepted from clients. Validation enforces numeric shape, paired blood-pressure values, and absence of a secondary value for other codes; it deliberately does not encode normal/abnormal ranges.

One mutable current row is retained per encounter/code. Each creation or update appends an immutable measurement-history snapshot containing previous/new values, actor, and timestamp. Encounter lifecycle transitions have a separate append-only history. Detailed correction/version workflows remain future work.

Starting an encounter moves a confirmed `PROVIDER_ASSIGNED` or `SCHEDULED` booking to `IN_PROGRESS` with BookingStatusHistory. Completion requires all six current measurements and atomically moves encounter and booking to `COMPLETED`, appending both histories. `PROVIDER_ASSIGNED` is temporarily accepted because no distinct operational scheduling command currently exists.

## Patient result access

Only completed current measurements may cross the patient result boundary. Registered access resolves the authenticated User through `Patient.userId` and verifies that Patient is the booking participant. Guest access requires a separately issued, encounter-scoped opaque grant; booking references and public booking-session cookies grant no clinical authority. ADMIN/OPERATIONS may issue or revoke guest grants after an external/manual identity-verification step, but they do not gain patient-result access merely by holding those roles.

Patient responses contain package, provider display name, completion time, and current measurements only. They exclude clinical/audit histories, interpretation, ranges, contacts, funding, payment, assignment internals, and reporting. Guest token delivery, identity verification, consent for minors/dependants, account-link transitions, corrections, and reports remain future work.

The authenticated `/me/health-checks` history endpoint lists the linked Patient's booking and encounter summaries without measurement values. It supports booking/encounter status filters and bounded pagination, orders newest first, and derives result availability only from a completed encounter. Detailed current measurements remain isolated at `/me/health-checks/:bookingReference/results`.

## State and history guidance

The Smart Health Check encounter has its own lifecycle and audit trail because clinical capture is now implemented. Booking remains the fulfilment lifecycle and does not embed measurements:

- The selected package and fulfilment mode are separate relational references to configurable catalogue data, with retained booking-time snapshots where commercially necessary.
- Party relationships are relational records or foreign-key references with explicit role semantics, not a single overloaded `user` field.
- Changes to participant, funding party, package, or health-data access should be captured in auditable history when the relevant feature is implemented.

## Decisions required before entities

- Can a booker create a booking for any adult, only linked family members, or only with participant confirmation?
- Which package/mode/currency prices, effective dates, taxes, and discounts are commercially approved?
- What consent, guardian, and dependent-participant rules apply?
- What access controls apply separately to health data, booking data, payment data, provider data, and organisation data?
- Which party may view booking details, payment details, and health-check results?

## Approved v1 package definitions

### Essential

Includes:
- Blood pressure
- Blood glucose
- BMI
- Temperature
- Oxygen saturation
- Pulse

Estimated duration:
- 15 minutes

Positioning:
- Routine health screening
- Suitable for recurring checks

### Complete

Includes:
- Blood pressure
- Blood glucose
- BMI
- Temperature
- Oxygen saturation
- Pulse
- Additional clinician review
- Expanded interpretation of recorded measurements

Estimated duration:
- 30 minutes

Positioning:
- More comprehensive Smart Health Check
- Includes additional review/interpretation

## Approved v1 pricing

| Package | Fulfilment mode | Price | Currency |
| --- | --- | ---: | --- |
| Essential | Provider location | TBD | NGN |
| Essential | Home visit | TBD | NGN |
| Complete | Provider location | TBD | NGN |
| Complete | Home visit | TBD | NGN |

Effective from: TBD
