# Provider Registration, Onboarding, Approval, Activation, and Find Care Audit

**Repository:** `smartclinic-api`  
**Scope:** Read-only investigation; no application code, migrations, or configuration were changed.

## 1. Executive Summary

The backend has a **strong indirect coupling** between provider activation and Health Check configuration. Normal provider submission and admin approval both run `ProviderOnboardingReadinessService.evaluate()`. That readiness check requires at least one active Health Check `ProviderService` and active weekly availability. Consequently, an individual professional who only wants to offer virtual Find Care cannot normally reach `ProviderStatus.ACTIVE` / `ProviderOnboardingStatus.APPROVED` without Health Check setup.

Find Care itself is modeled separately. A provider can configure `ProviderCareService` plus a `ProviderCareServiceDeliveryOption` for `VIRTUAL` without Health Check rows or physical locations. Once a provider is already `ACTIVE` and `APPROVED`, virtual care eligibility does not require a `ProviderLocation` or Health Check capability.

## 2. Provider Registration Flow

Global API prefix is set in `src/main.ts:32`:

```ts
app.setGlobalPrefix('api/v1');
```

### Public self-registration

- **Route:** `POST /api/v1/public/providers/register`
- **Controller:** `src/providers/public-provider-registration.controller.ts`, `PublicProviderRegistrationController.register()`
- **DTO:** `src/providers/dto/provider-onboarding.dto.ts`, `RegisterProviderDto` (extends `ProviderProfileFieldsDto`)
- **Service:** `src/providers/provider-onboarding.service.ts`, `ProviderOnboardingService.register()`

Required profile input includes display name, email, phone, provider type, country, state/region, city, and password. `professionalReference`, referral code, and intended referral type are optional.

Inside a transaction, registration:

1. Normalizes email and rejects duplicate user/provider email.
2. Creates a `User` with `UserStatus.ACTIVE` and `UserRole.PROVIDER`.
3. Creates a bcrypt `UserCredential`.
4. Creates a linked `Provider` with `status = PENDING` and `onboardingStatus = DRAFT`.
5. Stores profile/provider-type fields.
6. Ensures a referral code and captures a provider referral if supplied.

No Health Check or Find Care configuration rows are created automatically.

### Admin/invitation registration

- **Controller:** `src/providers/admin-providers.controller.ts`
- **Service:** `src/providers/provider-invitations.service.ts`, `ProviderInvitationsService.createProvider()`
- **Admin route:** `POST /api/v1/admin/providers`

An invitation-created provider has no user initially, `status = PENDING`, and `onboardingStatus = INVITED`. Public invitation routes are in `src/providers/public-provider-invitations.controller.ts`:

- `GET /api/v1/public/provider-invitations/:token`
- `POST /api/v1/public/provider-invitations/:token/accept`

Acceptance creates a provider User and credential, links the provider, and normally resets the provider to `PENDING + DRAFT` unless it was already approved.

## 3. Provider Status Lifecycle

### Enums

- `src/providers/enums/provider-status.enum.ts`
  - `PENDING`
  - `ACTIVE`
  - `SUSPENDED`
  - `INACTIVE`
- `src/providers/enums/provider-onboarding-status.enum.ts`
  - `DRAFT`
  - `INVITED`
  - `SUBMITTED`
  - `APPROVED`
  - `REJECTED`
- Provider categories are defined in `src/providers/enums/provider-type.enum.ts`: `INDIVIDUAL`, `CLINIC`, `HOSPITAL`, `DIAGNOSTIC_CENTRE`, `PHARMACY`, `OTHER`.

### Production mutations

| File / method | Transition | Condition |
|---|---|---|
| `provider-onboarding.service.ts:register()` | new provider `PENDING + DRAFT` | successful self-registration |
| `provider-onboarding.service.ts:submit()` | onboarding `SUBMITTED`, status `PENDING` | readiness has no blockers |
| `admin-providers.service.ts:approve()` | onboarding `APPROVED`, status `ACTIVE` | submitted, valid profile/user/role, readiness clear |
| `admin-providers.service.ts:activate()` | status `ACTIVE` | onboarding already `APPROVED` |
| `admin-providers.service.ts:suspend()` | status `SUSPENDED` | admin suspension |
| `admin-providers.service.ts:reject()` | onboarding `REJECTED`, status `PENDING` | admin rejection |
| `provider-invitations.service.ts:createProvider()` | `PENDING + INVITED` | admin creates invitation provider |
| `provider-invitations.service.ts` invitation acceptance | usually `PENDING + DRAFT` | invited provider is linked to a new account and is not already approved |

No Health Check service or location configuration method directly writes provider status or onboarding status.

## 4. Provider Onboarding Status Lifecycle

`ProviderOnboardingService.submit()` and `AdminProvidersService.approve()` both invoke `ProviderOnboardingReadinessService.evaluate()`. Approval is not merely an administrative status flip; it is blocked by readiness blockers.

The onboarding migration `src/database/migrations/1788624000000-ProviderOnboardingRedesign.ts` introduces the onboarding enum and backfills legacy `ACTIVE` providers to `APPROVED`.

## 5. Admin Approval Flow

`POST /api/v1/admin/providers/:id/approve` is handled by `AdminProvidersService.approve()` in `src/providers/admin-providers.service.ts`.

Approval requires:

- provider exists and is not deleted;
- `onboardingStatus === SUBMITTED`;
- display name, email, provider type, country, state/region, and city are present;
- linked user exists, is active, and has the provider role;
- `ProviderOnboardingReadinessService.evaluate()` returns no blockers.

On success, onboarding becomes `APPROVED`, status becomes `ACTIVE`, and review metadata is recorded. Referral qualification is then processed.

There are no checks here for professional documents, identity verification, bank/payout details, organisation membership, or Health Check package rows beyond readiness's active-capability requirement.

`activate()` is separate and requires `APPROVED`; it sets status `ACTIVE` but does not independently recalculate readiness.

## 6. Activation Requirements

`src/providers/provider-onboarding-readiness.service.ts` evaluates:

- complete provider profile;
- at least one active Health Check `ProviderService`;
- linked active location for every `PROVIDER_LOCATION` Health Check service;
- at least one active weekly availability row;
- active `ProviderServiceArea` for every `HOME_VISIT` Health Check service.

Blocker enum (`src/providers/dto/provider-onboarding-readiness.dto.ts`):

- `PROFILE_INCOMPLETE`
- `NO_ACTIVE_CAPABILITY`
- `PROVIDER_LOCATION_WITHOUT_LOCATION`
- `NO_WEEKLY_AVAILABILITY`
- `HOME_VISIT_WITHOUT_SERVICE_AREA`

It does **not** require `ProviderCareService`, Find Care delivery options, payout configuration, documents, or identity-verification rows.

## 7. Health Check Readiness

`src/providers/entities/provider-service.entity.ts` models Health Check capability through provider, package, fulfilment mode, price/currency, and active state.

`src/providers/provider-capabilities.service.ts` creates/activates these rows and validates active `HealthCheckPackage` and `FulfilmentMode`. It does not mutate provider status.

Health Check matching (`findEligibleProviders()`) requires an active provider, approved onboarding, active package/mode/service, and mode-specific location/availability rules. `HOME_VISIT` is explicitly allowed without a physical ProviderLocation when its service area is valid.

## 8. Provider Location Requirements

Entity: `src/providers/entities/provider-location.entity.ts`.

Provider and admin location routes are implemented in provider capability/location controllers and services. Creating, activating, deactivating, or linking a location does not mutate global provider status.

Zero `ProviderLocation` rows are allowed in the database. Readiness only requires a location for active Health Check services using `PROVIDER_LOCATION`. Virtual Find Care does not query physical locations.

## 9. Find Care Readiness

Find Care uses independent entities:

- `src/providers/entities/provider-care-service.entity.ts`
- `src/providers/entities/provider-care-service-delivery-option.entity.ts`
- `src/providers/provider-care-services.service.ts`

Provider configuration routes are in `src/providers/provider-care-services.controller.ts` under `/api/v1/provider/care-services` plus admin care-service-definition/provider configuration routes.

`ProviderCareServicesService.createForProvider()` requires an active `CareServiceDefinition`, valid delivery options, and consistent FastTrack flags. It does not require Health Check services, packages, fulfilment modes, locations, or service areas.

Therefore a linked `PENDING` provider can configure `GENERAL_CONSULTATION + VIRTUAL` with zero Health Check rows and zero locations.

Public discovery in `src/providers/find-care.service.ts` filters providers to `ACTIVE + APPROVED`, active care services/options, and active definitions. Virtual discovery skips geography predicates; physical modes apply geography/location matching.

## 10. Virtual-Only Professional Scenario

The configuration layer supports the desired virtual-only model, but the normal onboarding lifecycle blocks it before activation:

```text
ProviderCareService(GENERAL_CONSULTATION)
  + ProviderCareServiceDeliveryOption(VIRTUAL)
  + no Health Check ProviderService
  + no ProviderLocation
```

This configuration can be created, but submission/approval fails with `NO_ACTIVE_CAPABILITY` (and commonly `NO_WEEKLY_AVAILABILITY` if availability is also absent).

## 11. Care Request Eligibility

`src/providers/provider-care-eligibility.service.ts`, `ProviderCareEligibilityService.requireEligible()`:

- requested care service exists and is active;
- appointment requests are supported;
- requested delivery option exists;
- provider exists, is not deleted, `status === ACTIVE`, `onboardingStatus === APPROVED`;
- care definition is active.

For `VIRTUAL`, eligibility returns without geography or ProviderLocation checks. Physical modes require complete geography and matching provider profile/location rules.

The indirect blocker is therefore provider status, not the virtual eligibility algorithm itself.

## 12. Care Request Creation / Matching

- **Route:** `POST /api/v1/me/care-requests`
- **Controller:** `src/care-requests/care-requests.controller.ts`
- **Service:** `src/care-requests/care-requests.service.ts`, `create()`
- **DTO:** `src/care-requests/dto/care-request.dto.ts`

The service resolves the participant, loads the active care definition, nulls geography for virtual requests, and builds eligibility input. A preferred provider is checked with `requireEligible()`. Without a preferred provider it calls `findEligibleCareProvider()`.

If a provider is selected, the request becomes `AWAITING_PROVIDER_RESPONSE`; otherwise it remains `MATCHING`. It persists owner, participant, provider/service IDs, delivery mode, and selected pricing.

For a virtual request with no preferred provider, e.g. `serviceCode = GENERAL_CONSULTATION`, `deliveryMode = VIRTUAL`, and no geography, the service attempts automatic matching; if no candidate is eligible it persists `MATCHING`.

## 13. Provider-Type Differences

Provider types are represented by `ProviderType`, but current activation/readiness logic does not branch on provider type. Type affects discovery filtering/projection and referral classification, not Health Check requirements, location requirements, or Find Care readiness.

## 14. Tests and Existing Assumptions

Relevant tests include:

- `src/providers/provider-onboarding.service.spec.ts`: registration starts `PENDING + DRAFT`; readiness blockers prevent submission.
- `src/providers/provider-onboarding-readiness.service.spec.ts`: active capability, linked location, HOME_VISIT service area, and weekly availability assumptions.
- `src/providers/admin-providers.service.spec.ts`: approval sets `ACTIVE + APPROVED`; activation requires approval; rejection resets status.
- `src/providers/provider-capabilities.service.spec.ts`: Health Check capability/status gates.
- `src/providers/provider-care-services.service.spec.ts`: virtual delivery can be configured independently.
- `src/providers/provider-care-eligibility.service.spec.ts`: virtual eligibility requires active/approved provider and requested virtual option, not geography.
- `src/providers/find-care.service.spec.ts`: q-only virtual discovery and no virtual geography predicates.
- `src/care-requests/care-requests.service.spec.ts`: virtual requests do not require geography; preferred/no-preferred flows.

The test suite encodes Health Check capability and weekly availability as onboarding blockers, while separately encoding virtual Find Care configuration without Health Check rows.

## 15. Domain Coupling Classification

**Classification: C — Strong coupling exists in the onboarding/activation path, but not in direct Find Care eligibility.**

The coupling chain is:

```text
Provider submit/approve
  -> ProviderOnboardingReadinessService.evaluate()
  -> NO_ACTIVE_CAPABILITY unless active Health Check ProviderService exists
  -> provider cannot reach ACTIVE + APPROVED normally
  -> Find Care eligibility excludes the provider by status
```

## 16. Exact Files and Methods Involved

- `src/main.ts` — global `api/v1` prefix.
- `src/providers/entities/provider.entity.ts` — provider persistence and status fields.
- `src/providers/enums/provider-status.enum.ts` — operational status.
- `src/providers/enums/provider-onboarding-status.enum.ts` — onboarding status.
- `src/providers/enums/provider-type.enum.ts` — provider categories.
- `src/providers/dto/provider-onboarding.dto.ts` — registration/profile DTOs.
- `src/providers/public-provider-registration.controller.ts` — public registration route.
- `src/providers/provider-onboarding.service.ts` — register/update/submit.
- `src/providers/admin-providers.controller.ts` — admin provider lifecycle routes.
- `src/providers/admin-providers.service.ts` — approve/activate/reject/suspend.
- `src/providers/provider-invitations.service.ts` — invitation creation/acceptance.
- `src/providers/provider-onboarding-readiness.service.ts` — readiness blockers.
- `src/providers/dto/provider-onboarding-readiness.dto.ts` — blocker values.
- `src/providers/entities/provider-service.entity.ts` — Health Check capability.
- `src/providers/provider-capabilities.service.ts` — Health Check service/location configuration and matching.
- `src/providers/entities/provider-location.entity.ts` — physical locations.
- `src/providers/entities/provider-care-service.entity.ts` — Find Care service offering.
- `src/providers/entities/provider-care-service-delivery-option.entity.ts` — delivery mode/pricing.
- `src/providers/provider-care-services.service.ts` — Find Care provider configuration.
- `src/providers/provider-care-eligibility.service.ts` — request-time eligibility.
- `src/providers/find-care.service.ts` — public Find Care discovery.
- `src/care-requests/care-requests.controller.ts` and `src/care-requests/care-requests.service.ts` — request creation/matching.
- `src/database/migrations/1786896000000-InitialDomainSchema.ts` — provider status enum.
- `src/database/migrations/1788624000000-ProviderOnboardingRedesign.ts` — onboarding enum/backfill.

## 17. Recommended Changes — DO NOT IMPLEMENT

The smallest safe architectural change is to separate account/onboarding approval from product-specific readiness:

1. Permit a complete, verified individual provider to reach `APPROVED`/`ACTIVE` without requiring a Health Check `ProviderService`.
2. Keep Health Check readiness checks in Health Check catalogue, quote, matching, and booking paths.
3. Keep Find Care readiness based on active `ProviderCareService` plus the requested active delivery option.
4. Preserve the existing virtual rule: `VIRTUAL` requires no ProviderLocation.
5. Keep weekly availability/service-area checks product-specific instead of making them universal activation gates unless product policy explicitly requires them.
6. Consider separate readiness projections (account approved, Health Check configured, Find Care configured) rather than overloading `Provider.status`.

No implementation was performed in this audit.

## 18. Open Questions / Ambiguities

- Should weekly availability be required for account activation, or only for products/modes that use scheduling?
- Should provider approval require any professional-document or identity-verification workflow not currently represented in this code path?
- Should HOME_VISIT Find Care eventually use a care-specific service-area entity rather than the current location fallback?
- Should product readiness be represented by explicit capability/readiness projections, or remain computed per domain?
- Should an admin be able to approve an account before any product configuration exists?

## Direct Answers

**Q1. Can a newly approved individual doctor become `ProviderStatus.ACTIVE` without configuring Health Checks?**  
No, not through the normal submission/approval lifecycle. `NO_ACTIVE_CAPABILITY` blocks readiness when no active Health Check `ProviderService` exists. Manual/legacy database state could differ, but it is not the supported path.

**Q2. Can they become ACTIVE with zero `ProviderLocation` rows?**  
Only if they already have an active Health Check capability whose fulfilment mode does not require a physical location (for example HOME_VISIT with a valid service area). With no Health Check capability at all, activation is blocked earlier. A `PROVIDER_LOCATION` Health Check capability requires a linked active location.

**Q3. Can they configure `GENERAL_CONSULTATION + VIRTUAL` without Health Check configuration?**  
Yes. `ProviderCareServicesService.createForProvider()` treats Find Care configuration independently and does not require Health Check rows or locations.

**Q4. Can current care eligibility match them for VIRTUAL care?**  
Yes, if they are already `ACTIVE` and `APPROVED` and have the active care service plus virtual delivery option. The virtual eligibility branch does not require geography or ProviderLocation.

**Q5. If not, what exact condition blocks them?**  
The normal lifecycle prevents the prerequisite status: `ProviderOnboardingReadinessService.evaluate()` emits `NO_ACTIVE_CAPABILITY` when no active Health Check `ProviderService` exists; missing active weekly availability can additionally emit `NO_WEEKLY_AVAILABILITY`.

**Q6. Is `Provider.status` currently used both as account-level status and product-readiness status?**  
Yes. It is an operational gate across provider-facing domains and, together with onboarding status, is also the result of a readiness process that currently includes Health Check configuration.

**Q7. What is the smallest safe architectural change?**  
Decouple core provider approval/activation from Health Check capability readiness. Allow `ACTIVE + APPROVED` for a properly onboarded individual account without Health Check setup, then let Find Care independently require only its own active service/delivery configuration. Keep Health Check readiness and physical-location checks in Health Check-specific flows.

