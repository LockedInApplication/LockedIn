# Optional discovery photos with private storage and hybrid moderation

Status: approved by the user on 2026-11-16; implementation plan next. Approval does not authorize live provider operations, subscriptions, production migration or deployment.

## Intent and agreed choices

Make discovery profiles more personal without replacing LockedIn's mutual-choice workflow. The user chose optional photos, Cloudinary storage rather than private S3, and automatic content screening with human review for uncertain/appealed results. Up to three photos and an avatar fallback were proposed and accepted as the first version. Photos do not verify identity, ownership, adulthood or compatibility.

The numerical limits, retention defaults and implementation choices below originated as builder proposals and were included in the approved design.

## Goals, non-goals and anti-goals

- Upload, preview, reorder, replace and remove up to three discovery photos; first published photo is primary. Users may publish with no photos.
- Explicit publication remains separate from upload, screening and private draft Save. Screening completion or moderator approval must never publish a photo automatically.
- Screen prohibited content, hold uncertain/failing checks privately, allow reviewed appeals and post-publication reports/removal.
- Enforce publication, account, block and suspension rules for actual image bytes, not only profile JSON.
- Preserve existing accounts, private reflections, starter text and full shared spaces. No legacy profile migration to photos, no importing external avatar URLs.
- No video/GIF uploads, arbitrary image URL imports, facial recognition, age estimation, identity verification, public social feed, GPS, Bluetooth or production account/provider creation.
- Never make draft/pending/rejected photos public, turn provider outages into approvals, retain originals with GPS metadata, or claim that recipients cannot screenshot an already viewed photo.

## Approaches and choice

1. Cloudinary authenticated media with backend-authorized upload/delivery and hybrid moderation: selected. Reduces storage/processing integration work but requires a Cloudinary account, credentials and moderation add-on registration; costs and provider policies must be reviewed before activation.
2. Private S3 with application-owned processing/delivery: not selected. More infrastructure ownership and image tooling to maintain.
3. Manual-only review was discussed; user selected automatic screening plus manual review for uncertainty/appeals. This is not an automatic guarantee of safe imagery.

## Current integration boundaries

The API is Fastify/Prisma/PostgreSQL; the web app is Next.js. Discovery profile JSON is strict, allowlisted and revisioned, with a separate publication snapshot. Candidate access checks pilot admission, verified email, publication, pause/suspension, intention and canonical invitation blocks. Starter invitations snapshot public name/avatar only. Discovery reports already preserve restricted server-derived evidence and moderator audit records.

Introduce feature-owned photo processing, provider adapter, state services and routes under discovery, with a small UI gallery/editor. Do not put photo mutations into the generic avatar/profile feature. Extend existing profile Save/Publish, candidates, safety/moderation and synthetic browser/disposable DB runners rather than introducing a second auth or history-guard system.

## Upload and image processing

- Server receives one multipart file per request under a photo-specific route limit. New dependencies may include the official Cloudinary SDK, Fastify multipart and sharp; verify compatible current versions at planning time, pin through the normal lockfile, and do not install before design approval.
- Accept decoded JPEG, PNG or single-frame WebP; maximum input 5 MiB and 24 million pixels; each dimension at least 80px. Reject SVG, animated/multipage content, malformed/truncated input, huge decompression payloads and mismatched file signatures. Phone HEIC is not included initially: explain supported formats before upload and on rejection rather than pretending conversion succeeded.
- Decode with resource limits; apply orientation, resize longest edge to at most 1600px, flatten transparency onto a neutral background and re-encode JPEG. Strip EXIF/GPS/comments/embedded thumbnails. Only the normalized image goes to Cloudinary; original input is never permanently stored, logged or publicly served.
- Use server-generated opaque photo and asset identifiers, immutable bytes per photo, explicit authenticated delivery type and no overwrite/public derivative generation. Browser cannot choose provider IDs, external source URLs, moderation status or ownership.
- Reserve capacity under existing account lock order before provider calls. Three attached draft slots maximum, plus at most three old published assets retained during replacement; one in-flight upload/account. Bound new attempts to 10/hour and 20/day with idempotent request IDs; replay does not create/charge a second logical upload.
- Provider calls occur outside database transactions with timeouts. On late success, recheck ownership/admission/deletion before installing state. Record durable cleanup work for abandoned assets and safe retry/reconciliation after process crashes. Never hold locks across network/image-processing work.

## Server state and publication

Additive photo/operation/moderation-audit tables store owner, profile, immutable provider mapping/version, dimensions, processing status, policy version, structured restricted screening labels, request ID, timestamps and deletion/cleanup status. State is persisted in PostgreSQL; React tracks only UI progress.

State lifecycle: `PROCESSING` → `APPROVED`, `NEEDS_REVIEW`, `REJECTED` or `CHECK_FAILED`; deletion is terminal for visibility. `CHECK_FAILED` is not approval and may be explicitly retried. Safe human approval can transition a reviewed image to approved, with immutable audit evidence and actor identity. A replaced/revoked/deleted image cannot be revived by a delayed provider response or older review action.

- Extend draft/publication data with ordered photo IDs; legacy JSON without them means an empty photo list. Existing legacy strict serializers must keep working without rewriting old rows.
- Upload appends the new ID to the saved private draft under optimistic revision control and returns the new revision. Capture/confirm any unsaved local profile edits before upload/remove/reorder actions that change the server draft; never remount and silently discard them. A stale revision produces a conflict with no publication or attachment.
- Upload/remove/reorder records are owner-only. Only IDs belonging to this profile may be saved. Publish rechecks current revision, explicit consent and approved/nondeleted status for every selected ID; pending/rejected selections do not silently disappear or get published. User may remove pending items and publish with approved items or no photos.
- Publish atomically replaces ordered public photo references. Republishing does not unpause an existing paused profile. Approval after publishing never adds a photo to that public snapshot.
- Replacement is a new photo/asset, not an overwrite. Remove-from-draft leaves the old public snapshot unchanged until Publish. A separate explicit Delete photo action immediately revokes that asset from both draft and published delivery; reordering/removal increments draft revision and any affected publication version atomically. Explain this distinction in the editor.
- New photos appear in discovery cards and profile detail. Keep historical invitation snapshots as name/avatar only; do not add everlasting photos to old starter invitations or relationship history.

## Byte-level access and privacy

- Return local opaque media routes, not reusable Cloudinary delivery URLs or credentials. Serve normalized image bytes through an authenticated backend endpoint. Check authorization on every request; emit `Cache-Control: private, no-store`, a fixed image content type and `X-Content-Type-Options: nosniff`. No shared CDN/Next image optimizer cache for these images.
- The owner may preview their nondeleted attached photos in processing, needs-review, check-failed or approved states where provider retrieval is available. Rejected photos are status-only for the owner: hide their thumbnails and deny owner byte requests, while keeping removal/appeal controls available. Only assigned moderators may deliberately open retained rejected-image evidence for a legitimate review. Other users may fetch only an approved ID in the current live publication when the existing visible-profile policy permits that pair; a connection/history relationship alone grants no extra photo access. Removing pilot access, pausing, blocking in either direction, suspension, deletion or flag-off stops new peer image requests.
- Reuse/refactor the canonical visibility predicate without charging a candidate-search quota per image or introducing divergent safety logic. Prevent guessed-ID, cross-owner, stale-publication and read-after-block leaks. Recheck state after a provider fetch before responding; do not redirect to a bearer URL.
- Backend fetches from a fixed allowlisted Cloudinary origin using server-known asset identifiers; never fetch caller-supplied URLs. Cloudinary authenticated storage alone is not an app-specific authorization system. Verify actual uploaded assets and derivatives cannot be retrieved anonymously before live rollout.
- Owners retain safe access to manage/remove photos and authorized moderators retain restricted review access when new discovery admission is disabled. No new upload/publication or peer media access under the photo kill switch.

## Screening policy proposal

Use the Cloudinary Amazon Rekognition image moderation add-on, not its video add-on. Request sufficient structured labels to distinguish prohibited content from benign clothing/context. Provider status alone cannot establish local approval; normalize categories/confidence, preserve policy/version evidence, validate shape and fail closed on missing/unrecognized model results. Provider-level rejection is never silently converted to approval by a client.

Initial local policy proposal (not validated accuracy thresholds): confidence at least 90/100 for explicit nudity/sexual activity, graphic violence/gore or hate symbols rejects; 50–below90 for those categories holds for manual review. Sexualized/implied nudity at 50+ also holds rather than automatically rejects. Swimwear, ordinary clothing, shirtless context, alcohol or tobacco alone do not trigger automatic rejection. Unknown risk labels or malformed/partial results require review/failure rather than approval. Builder maps exact provider taxonomy/threshold options in tests and documents any mismatch before rollout; thresholds need calibration on consented benign examples, not an accuracy claim.

Low-risk completed screening permits user publication. Uncertain images enter a moderator queue; clear prohibited images remain rejected. Uploads and scans disclose Cloudinary/external screening use. Copy says Checking / Needs review / Ready to publish / Not approved / Check failed, never identity verified. No automated nudges to publish.

For this first version, use bounded synchronous upload results plus durable reconciliation for genuinely pending/ambiguous provider operations. Reconciliation only reads server-known assets; user refresh must not trigger repeated paid scans. Retry transient errors with a bounded schedule; after 24h without a reliable outcome show Check failed and stop automated scans. No unauthenticated webhook is needed; if planning chooses signed provider webhooks, signature, timestamp, replay, asset/version and terminal-state checks are mandatory and must not replace reconciliation.

## Manual review, reports, deletion and retention

- Existing verified-email assigned moderators get a queue of uncertain photos and appeals with reason, restricted preview, policy result and audit history. Approve/reject needs a reason and idempotent request ID, rechecked under account/photo locks. Moderators cannot approve an incomplete/failed scan as a substitute for working screening; technical failures need a completed scan first. A verified provider false-positive may be overridden only through an explicit audited human review and a compatible provider moderation operation; never as a background success fallback.
- Owners can request one appeal per decision for a rejected photo. No user-viewable gallery of rejected explicit images; moderator access is purpose-limited. Pending/rejected photo retention proposal is at most seven days from upload, after which erase bytes and offer a fresh upload rather than promise indefinite appeal recovery. If provider quarantine/rejection policies prevent safe retained preview, erase bytes earlier and explain that appeal requires a fresh upload; this limitation must be established before activation.
- Add PHOTO reports with an exact server-authorized photo ID, current publication version and immutable asset identity; never accept arbitrary URLs or user-asserted evidence. The report may also block via existing canonical controls. Record only necessary restricted evidence; prefer retaining the existing normalized private object while the report is open, not generating a public duplicate. Moderator removal immediately revokes profile display/access; account suspension continues to leave existing full shared spaces intact.
- Explicit owner deletion immediately revokes all ordinary photo access and creates durable provider-destruction work. If already referenced by an open report, explain the narrow moderation-evidence exception; only assigned moderators may access it. Proposed normal retention: keep report-referenced bytes until 30 days after resolution, then erase; redact image pointers when erasing while retaining nonimage audit metadata under the existing audit policy. Bytes that provider policy forbids retaining must be erased promptly, even if this reduces later appeal/evidence availability. Never promise provider backups or previously downloaded copies disappear instantly.
- Durable cleanup/reconciliation must run in a documented operator-managed worker/cron, not an untracked one-off timer. Due deletion/retention work survives restart, has bounded retries and a visible failure queue. Photo feature launch requires this worker, storage backup/deletion policy review and staffed moderator coverage. Existing text report evidence is not rewritten or silently assigned the new photo retention policy.

## UI requirements and operational controls

Keep photo management optional and compact in the discovery profile editor, with three ordered slots, a primary indicator, format/size guidance, local upload preview, per-photo status and accessible Move earlier/later controls. Avoid drag-only interactions. Clear separate Save/Publish/Delete semantics and progress/error states; prevent duplicate submit, account-switch completion leaks and unsaved-text loss. Revoke local object URLs after replace/unmount. Discovery cards use the first approved published image and retain avatar fallback for no image, errors or revoked access; detail supports up to three with clear alt text. Moderator previews are hidden until deliberately opened.

Server-only `DISCOVERY_PHOTOS_ENABLED=false` initially. Cloudinary cloud name/API key/API secret and selected moderation configuration belong only in backend configuration; no public secrets, unsigned uploads or arbitrary client upload presets. Missing credentials/add-on registration disables new uploads with useful safe feedback, not a fallback to unscreened publication. Photo failure must not disable avatar-only discovery or normal LockedIn. Turning photos off hides peer photos but preserves owner deletion and restricted safety workflows.

No paid account creation, add-on subscription, credential entry, production migration/deploy, live provider writes or real people/photo uploads occurs without separate authorization. Operator must confirm provider terms, costs, protected delivery, moderation registration, supported rejection/appeal retrieval behavior and deletion/backup policy in a test account before activation. Reject rollout if those capability checks fail; do not weaken privacy to make the provider integration pass.

## Verification contract

- Real image decoder tests for permitted formats/orientation, metadata removal, byte/pixel limits, malformed/mislabeled/animated/SVG inputs and deterministic normalized output.
- Policy fixtures covering benign beach/clothing, explicit/uncertain/failed/malformed responses; test category boundaries without fetching explicit real images. Do not claim sensitivity/specificity from synthetic fixtures.
- Real PostgreSQL/API tests for ownership, ID substitution, publication revisions, zero/three/four slots, concurrent uploads/replacements, delayed approval/delete/block races, idempotent sends/reviews, cleanup/restart and legacy profile JSON preservation.
- Assert image bytes cannot be fetched while private/pending/rejected, from guessed IDs, after block/pause/suspension/revocation/kill switch, or through provider/cache bypass. Test allowed owner/moderator scope separately.
- Browser checks for optional avatar-only profile, upload/reorder/replacement, draft vs Publish vs Delete, retries/failure, pending/review, account switching and dirty-navigation protection at 320/393/430/1280px.
- Existing API/web suites, type checks, web lint/production build; preserve known baseline diagnostics separately. Fake provider boundary locally, but perform an explicitly approved test-account acceptance before claiming live storage/moderation works. Additive migration rehearsal must preserve historical rows, IDs and consent.

## Builder discretion and source references

Builder chooses focused file/module decomposition, provider adapter signatures, database table names/indexes and explicit local test fixtures. It may not relax auth, publication, moderation, retention or provider capability gates to simplify implementation. This is a multi-part feature, not a one-button change; a plan follows approval.

Primary references checked during design:
- [Cloudinary access controls](https://cloudinary.com/documentation/control_access_to_media): authenticated delivery and controlled private downloads.
- [Cloudinary image moderation add-on](https://cloudinary.com/documentation/aws_rekognition_ai_moderation_addon): add-on registration, image labels and review overrides.
- [Moderation workflow](https://cloudinary.com/documentation/moderate_assets) and [asset-management warning](https://cloudinary.com/documentation/dam_admin_asset_management): moderation status must not be treated as privacy protection.
- [Upload API](https://cloudinary.com/documentation/image_upload_api_reference) and [provider notifications](https://cloudinary.com/documentation/notifications).
- [AWS moderation categories](https://docs.aws.amazon.com/rekognition/latest/dg/moderation-api.html).

## Builder check

A fresh read-only builder check identified one ambiguity: whether owners could view rejected images. Resolved in the approved design: rejected images are status-only for owners; no owner thumbnail or byte access, with review-purpose moderator access only while retention/provider rules permit it. This avoids maintaining a user-viewable rejected-content gallery. No further product questions were raised by that check.
