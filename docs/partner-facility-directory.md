# Partner facility directory

The directory is intentionally separate from provider onboarding. A registry record may be discoverable while it is still `AVAILABLE_TO_JOIN`; it must not enable booking, prescription fulfilment, or payment. A listing becomes actionable only after it is linked to an operational SmartClinic Provider with a supported patient-connection path.

Facility listings are deduplicated by `(source, sourceReference)`. Keep the upstream facility code as `sourceReference`; do not key on display name. Keep `sourceVerifiedAt` current and retain which registry supplied the row. Registry inclusion is not, by itself, a current PCN or MLSCN licence verification.

## Staging import

The staging importer accepts a JSON array. Example:

```json
[
  {
    "sourceReference": "NHFR-FACILITY-CODE",
    "displayName": "Example General Hospital",
    "facilityType": "HOSPITAL",
    "countryCode": "NG",
    "stateOrRegion": "Lagos",
    "city": "Ikeja",
    "sourceVerifiedAt": "2026-09-30T00:00:00.000Z"
  }
]
```

Set `STAGING_FACILITY_DIRECTORY_CONFIRMATION=SMARTCLINIC_STAGING_ONLY`, `STAGING_FACILITY_DIRECTORY_IMPORT_PATH` to the approved export path, and `STAGING_FACILITY_DIRECTORY_SOURCE` to its source label (`FMOH`, `NHFR`, `PCN`, or `MLSCN`). Then run `npm run seed:staging:facility-directory` against staging only. Re-imports update source data while preserving SmartClinic readiness and Provider linkage.

The NHFR API is read-only and requires an approved `X-API-Key`. Obtain it through the official NHFR developer page and store it as a staging secret; never put it in this repository or the import file. For pharmacies and laboratories, confirm current premises/laboratory approval with PCN and MLSCN as applicable before labelling a row verified.

## Privacy and outreach

Patient contact requests require explicit consent and are unique per patient/listing. Patient APIs expose no interested-patient totals or patient identifiers. Admin and linked Provider demand views expose aggregate distinct-patient counts only. No appointment or payment is created by an interest request.
