# Booking Concepts

This reference fixes the v1 vocabulary for booking and funding. It describes product concepts only; it does not create database entities or authorisation rules.

| Concept | V1 definition | Key boundary |
| --- | --- | --- |
| **Booker** | The person or authorised organisation administrator who initiates and manages a booking. | The booker is not automatically the participant or funder. |
| **Participant** | The patient who receives one Smart Health Check and whose health data is recorded. | Every booking has exactly one participant. |
| **Payer/Funder** | An individual, organisation, programme, or other source responsible for some or all funding. | A booking can have multiple funders; it must not rely on one `payerId`. |
| **Booking** | One request to provide one selected Health Check package to exactly one participant at a requested time/location and fulfilment mode. | A booking is not a family basket or multi-participant appointment. |
| **Booking Group** | A future optional grouping/order concept for related individual bookings, such as a family request. | It groups bookings but never changes the one-participant-per-booking rule. |
| **Health Check Package** | A configurable description of the Health Check service selected for a booking. Initial values are Essential and Complete. | Package is separate from fulfilment mode; more packages may be added. |
| **Fulfilment Mode** | A configurable way the selected package is delivered. Initial values are `PROVIDER_LOCATION` and `HOME_VISIT`. | Home Visit is a mode, not a package. Pricing may depend on package plus mode. |
| **Funding** | A booking funding obligation/source, represented conceptually by `BookingFunding`. | It records who or what is responsible for an amount; it is not a provider payment attempt. |
| **Payment Attempt** | A provider-neutral effort to collect money against a funding obligation. | It belongs to Payments, may fail or be retried, and contains no Booking-domain provider details. |
| **Provider Assignment** | The matching-domain record that captures a provider offer, acceptance, and active assignment for a booking. | It is separate from the booking lifecycle and can have multiple offers/history before an assignment is confirmed. |

## Role examples

| Journey | Booker | Participant | Payer/Funder |
| --- | --- | --- | --- |
| Self | Individual | Same individual | Same individual |
| Family | Parent | Child | Parent |
| Diaspora sponsorship | Sponsor outside Nigeria | Family member in Nigeria | Sponsor outside Nigeria |
| Organisation | Organisation administrator | Employee/member | Organisation |

## Funding and payment relationship

```text
Booking
  → BookingFunding[]
  → PaymentAttempt[]
      → PaymentTransaction[]
```

The model supports self-funded, family-funded, diaspora-sponsored, organisation-funded, mixed-funding, and future sponsored-programme journeys. `BookingFunding` is the obligation/source; a `PaymentAttempt` is the effort to collect money; a `PaymentTransaction` is the resulting provider-confirmed or finance-reconciled movement. Payment-provider integrations remain behind provider-neutral adapters.

## Consent and access boundary

Booking for another person requires authority and consent rules that will be designed later for adults, minors, and dependents. Patient health information, booking information, payment information, provider information, and organisation information require distinct future access controls. Booker or funder status alone does not grant health-data access.
