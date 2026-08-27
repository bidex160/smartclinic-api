# Find Care provider discovery

Find Care uses the existing SmartClinic `Provider` domain. There is no separate hospital or facility directory. Only non-deleted Providers whose operational status is `ACTIVE` and onboarding status is `APPROVED` can appear publicly.

The existing `provider_services` model remains the Health Check capability matrix: Provider + Health Check package + fulfilment mode. General healthcare discovery has different catalogue, pricing, and future Care Request semantics, so it uses:

- `care_service_definitions`: centrally controlled code, public name, description, and activation state.
- `provider_care_services`: the Provider's unique selection of a definition, optional description override, optional integer-minor-unit price/currency, appointment-request support flag, and activation state.

This separation prevents Find Care changes from altering Health Check matching. It also provides an unambiguous future `CareRequest -> Provider -> ProviderCareService` relationship. FastTrack eligibility and workflow are deliberately not modeled yet.

## APIs

Public:

- `GET /api/v1/public/find-care/services`
- `GET /api/v1/public/find-care/providers`
- `GET /api/v1/public/find-care/providers/:reference`

Provider-owned configuration:

- `GET|POST /api/v1/provider/care-services`
- `PATCH /api/v1/provider/care-services/:id`
- `PATCH /api/v1/provider/care-services/:id/activate|deactivate`
- `GET /api/v1/provider/care-services/catalogue`

Admin/Operations manage the central definitions under `/api/v1/admin/care-service-definitions` and support provider configuration under `/api/v1/admin/providers/:providerId/care-services`.

Discovery filters service code, Provider type, and exact normalized country/state/city. Location matching checks the authoritative Provider profile and active ProviderLocations; it performs no distance, nearest-provider, maps, or geocoding calculation. Results are deterministically ordered and paginated.

Public provider responses use the immutable server-generated `providerReference`, never the internal UUID. They expose display name, Provider type, safe location data, and active public services only. Email, phone, professional reference, user identity, onboarding review data, availability internals, Health Check assignments, and financial internals are excluded.

A null service price means price on request. Otherwise the amount is stored and returned in integer minor units with an ISO-style three-letter currency. SmartClinic does not assume uniform Provider pricing.

Care Requests, appointment processing, FastTrack flags/requests, queue behavior, private access codes, and Find Care payments remain deferred.
