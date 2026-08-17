# Smart Health Check

## Service definition

The Smart Health Check is SmartClinic's primary service and the subject of the platform's principal action: **Book My Smart Health Check**.

The initial check records blood pressure, blood glucose, BMI, temperature, oxygen saturation, and pulse. This list defines the initial product scope only; it does not define database fields, clinical workflow, reference ranges, or result interpretation.

Initial packages are Essential and Complete. The initial fulfilment modes are `PROVIDER_LOCATION` and `HOME_VISIT`; Home Visit is not a package. Package benefits, estimated duration, eligibility, fulfilment modes, and pricing are configurable business data. The final price may depend on both package and fulfilment mode and its effective date. Additional values can be introduced later, and prices must not be hardcoded.

The current catalogue seed records the documented baseline measurements as benefits for both initial packages. Product must still approve the package-specific benefit differences, estimated durations, and all commercial price rows before they can be presented as distinct catalogue values. No placeholder prices are seeded.

## Server-side booking quotes

At booking creation, the API resolves the selected package and fulfilment mode against the active, effective catalogue price. A price is eligible only when it is active, its `effectiveFrom` date has started, and its `effectiveTo` is absent or still in the future. Clients do not submit or determine a booking amount or currency.

V1 booking creation uses the Nigeria-first `NGN` catalogue policy. The catalogue schema can retain prices in other currencies, but the booking API neither selects them nor performs currency conversion. If no eligible NGN price exists, the API rejects the booking with a `422 Unprocessable Entity` response.

The resolved amount and currency are copied to the booking as an immutable quote snapshot. Later catalogue price changes affect new bookings only; they do not alter historical booking quotes.

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

## State and history guidance

The Smart Health Check itself should not initially receive a standalone lifecycle enum simply because a booking exists. Once results collection is implemented, the clinical encounter/result record may need its own status and audit trail, separate from booking completion. For now:

- The selected package and fulfilment mode are separate relational references to configurable catalogue data, with retained booking-time snapshots where commercially necessary.
- Party relationships are relational records or foreign-key references with explicit role semantics, not a single overloaded `user` field.
- Changes to participant, funding party, package, or health-data access should be captured in auditable history when the relevant feature is implemented.

## Decisions required before entities

- Can a booker create a booking for any adult, only linked family members, or only with participant confirmation?
- What package-specific benefits distinguish Essential and Complete?
- What estimated duration applies to each package and fulfilment mode?
- Which package/mode/currency prices, effective dates, taxes, and discounts are commercially approved?
- What consent, guardian, and dependent-participant rules apply?
- What access controls apply separately to health data, booking data, payment data, provider data, and organisation data?
- Which party may view booking details, payment details, and health-check results?
