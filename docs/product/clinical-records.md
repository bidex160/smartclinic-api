# General Care clinical records

Clinical records are longitudinal patient records produced by an authorized SmartClinic Provider from a General Care appointment. Ownership, Provider, Care Request, service definition, and occurrence time are derived by the backend from the appointment; clients never select those identities.

Each appointment currently supports one primary record. Records begin as `DRAFT`, may be edited only by the currently assigned Provider, and become immutable when `FINALIZED`. Patients can read only their own finalized records. Cross-Provider access, amendments, and attachments are intentionally not part of this foundation.

Admin may configure `clinicalRecordType` on a `CareServiceDefinition`. When configured, an appointment can complete only after its primary record has the expected type and is finalized. Finalization itself has no financial effect: appointment completion remains the event that makes an existing General Care Provider earning payable.
