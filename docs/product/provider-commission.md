# Provider commission configuration

SmartClinic Provider commission is deducted from Provider revenue; it is never added to the patient's price. Configuration resolves an explicit Provider override first, otherwise the persisted platform default. A zero-percent override is valid and is not inheritance.

Rates are stored and accepted by the admin API as integer basis points: `1000` is 10%, `750` is 7.5%, and `0` is zero. The migration deliberately creates the singleton platform setting with a null rate. A Provider override can resolve independently, but a Provider with neither an override nor a configured default returns an explicit not-configured result; future revenue creation must use the fail-closed resolver before snapshotting money.

Commission calculation uses integer minor units and rounds the commission half up to the nearest minor unit. Provider share is always gross minus commission, preserving `commission + provider share = gross`.

Admin and Operations may read/update the platform default at `/api/v1/admin/commercial-settings/provider-commission`, and read/set/clear a Provider override at `/api/v1/admin/providers/:id/commission`. Every effective configuration change appends an actor-attributed history row. Providers and patients have no commission configuration access.

No current Health Check, General Care, or FastTrack payment flow consumes this configuration. Provider earnings, settlements, payment splits/transfers, refunds, and commission snapshots remain deferred.
