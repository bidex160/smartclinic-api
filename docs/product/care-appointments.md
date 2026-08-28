# Care Appointments

A Care Appointment is the agreed schedule for an accepted SmartClinic Care Request. It is separate from the Health Check Booking domain and retains the exact assigned `ProviderCareService`. A provider accepting a Care Request does not schedule it automatically.

## Scheduling

The owning provider schedules through `POST /api/v1/provider/care-requests/:reference/schedule`. The provider supplies the actual local date, start, end, IANA timezone, optional provider-location public reference, and optional notes. `CareRequest.preferredDate` and `preferredTime` remain patient preferences and are never copied automatically.

V1 requires an explicit end time because general Care Services do not yet have authoritative duration configuration. Start and end must be on the same date, end must be after start, and the appointment must be in the future in its stated timezone.

Provider locations have stable `SCPL-…` public references. When supplied for `IN_PERSON`, the location must be active and belong to the authenticated provider. `VIRTUAL` and `HOME_VISIT` appointments require a null Provider location. The appointment delivery mode is copied authoritatively from the Care Request and cannot be overridden by the scheduling command.

For a `VIRTUAL` appointment, its owning active/approved Provider may set, replace, or clear an external HTTPS meeting URL while the appointment is `SCHEDULED`, `CONFIRMED`, or `IN_PROGRESS`. SmartClinic does not create or verify vendor meetings and does not integrate Google Meet, Zoom, Teams, or embedded video in V1. The URL appears only on authorized patient/provider appointment detail; lists, public discovery, and Care Request summaries expose no URL (the detail summary exposes only `hasMeetingLink`). No join-time restriction is enforced in V1.

## Lifecycle

Scheduling atomically creates a `SCHEDULED` appointment, writes appointment history, and moves the Care Request from `PROVIDER_ACCEPTED` to `SCHEDULED` with Care Request history. Provider commands support `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, and `NO_SHOW` under strict transitions. Appointment completion moves the Care Request to `COMPLETED`; cancellation/no-show moves it to `CANCELLED`.

Before scheduling, cancellation remains a Care Request command. Once scheduled, patients cancel through the appointment cancellation command, which atomically cancels both records. This avoids independent contradictory cancellation state.

## Capacity and availability

Provider rows are locked during scheduling, application overlap checks use half-open intervals, and PostgreSQL exclusion/partial-unique constraints prevent concurrent overlapping active appointments and duplicate active appointments for one Care Request. Adjacent appointments are allowed.

The existing recurring provider availability tables are tied to Health Check `ProviderService` and are deliberately not reused. General Care recurring availability, slot generation, and service-specific default durations are deferred.

## FastTrack

SmartClinic-originated FastTrack remains related through the shared Care Request and may display the resulting Care Appointment. FastTrack confirmation never invents or automatically schedules an appointment. External FastTrack appointments remain external.

Notifications, calendar integration, recurring appointments, clinical triage, doctor assignment, and external scheduling integrations are deferred.
