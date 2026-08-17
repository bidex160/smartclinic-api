# SmartClinic Product Overview

## Purpose

SmartClinic is a health platform centred on the **Smart Health Check**. Its primary commercial action is **Book My Smart Health Check**.

The initial Smart Health Check captures:

- Blood pressure
- Blood glucose
- BMI
- Temperature
- Oxygen saturation
- Pulse

## Packages and fulfilment

The initial Health Check packages are Essential and Complete. Home Visit is not a package; it is a fulfilment mode. The initial fulfilment modes are `PROVIDER_LOCATION` and `HOME_VISIT`.

Package definitions, fulfilment modes, and prices are business-managed data. The final price may depend on the selected package and fulfilment mode, and must not be hardcoded into application logic. The catalogue must permit additional packages and fulfilment modes later.

## Intended customer journeys

The platform will evolve to support users who can:

- Book a health check for themselves or a family member.
- Receive an individually or diaspora-sponsored health check.
- Have an employer or organisation fund a health check.
- Request a home visit.
- Participate in recurring health-check programmes.

One booking represents exactly one participant/patient. A family booking is therefore multiple individual bookings. A future booking group or order may associate related bookings, but it must not change the one-participant-per-booking rule.

## Booking outcome

A health-check booking will eventually record a booking reference, booker, one participant/patient, package, fulfilment mode, preferred location, date and time, provider-matching status, funding summary, and booking status. Booker, participant, and payer/funder must not be assumed to be the same person. A booking can have multiple funding sources.

## Provider network

Providers will eventually register, configure their offered services and service locations, define availability, receive matched bookings, accept or reject those bookings, and submit health-check results.

## Organisation programmes

Organisations will eventually create health programmes, manage eligible participants, sponsor members, pay for health checks, and monitor programme participation.

## Current scope boundary

This documentation establishes direction only. No health-check entities, booking workflows, payment integrations, or other product features are implemented by this initial setup.
