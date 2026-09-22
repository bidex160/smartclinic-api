# Public provider photos and facility logos

Implemented 22 September 2026; review branch only, not deployed.

## Behaviour

Authenticated providers can upload, replace or remove their own public profile image from provider setup. Individuals see photo wording; facilities see logo wording. Pending and active providers can update images without changing their identity/approval status. Suspended/inactive accounts cannot mutate images. Public discovery and hospital-connection responses expose only the image URL, not the storage key.

POST /api/v1/provider/profile/image accepts multipart `file`; DELETE removes the profile image. Only JPEG, PNG and WebP are accepted, limited to 5 MB with signature checks and subsequent image decoding/normalisation by Cloudinary. Uploads use a dedicated `smartclinic/provider-profiles/` namespace and public delivery, with an incoming 600-by-600 limit and PNG output. Existing private clinical attachment storage remains authenticated and unchanged. No remote URL upload is accepted from the client.

Replacement takes a provider row lock, rechecks provider status and saves the new reference before cleaning up the previous object. Failed database updates clean up the new unlinked object. Cloudinary deletion requests invalidate cached copies. If cleanup fails, the application logs the object key for operations retry; the profile reference still updates. Removal cannot guarantee immediate eviction from every external cache. Provider/actor IDs are logged for image changes; file contents and filenames are not logged.

## Deployment

1. Apply migration `1794000000000-ProviderProfileImages` before running the updated API. It adds nullable image URL and internal storage-key columns. No backfill or provider activation occurs.
2. This implementation reuses the existing Cloudinary account configuration: `CLINICAL_ATTACHMENT_STORAGE_PROVIDER=cloudinary` plus `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. Public profile objects are separate from private attachments. No secrets are included in the change.
3. Deploy API before frontend. Confirm the existing CSP permits images from `https://res.cloudinary.com` where a CSP is configured.
4. With a synthetic provider, verify upload, reload, public card display, replacement, removal and suspended-account rejection. Confirm a real malformed image is rejected by storage and check cleanup logs. Live storage/network and database migration execution were not performed in this environment.
5. Roll back application versions before reverting the migration. Dropping columns does not delete stored public objects; retain an inventory for cleanup if rolling back.

Validation: backend production build passes; 41 focused provider/onboarding/discovery/connection tests and 3 public-storage boundary tests pass. Existing broad-suite failures documented in staging notes remain. Tests mock Cloudinary and database transactions; they do not establish live storage or multi-process database behaviour.

Storage API reference: https://cloudinary.com/documentation/image_upload_api_reference (incoming transformations, format conversion and invalidation).
