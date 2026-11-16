# Discovery photos: rollout and operator guide

## Deploy disabled

Deploy the new backend and web versions together. Apply the additive Prisma migrations with the existing release process before sending traffic to the updated backend; the web app's API proxy must target that backend and preserve cookies and multipart requests. Leave `DISCOVERY_PHOTOS_ENABLED=false` or unset. Avatar-only Discovery continues working. Never put provider credentials in the frontend, Git, logs, or screenshots.

For the pilot, assign verified moderator account IDs in the backend's comma-separated `DISCOVERY_MODERATOR_USER_IDS`. The existing **Moderation → Photo review** tab shows flagged images, appeals, reports and worker failures. Opening a preview is deliberate. Approve, reject or remove with a reason; approval does not publish an image. Resolve photo reports in **Reports** after reviewing their associated photo. Keep operator coverage staffed before enrollment.

## Before enabling photos

1. Obtain authorization for a Cloudinary test-account exercise. Review costs, provider terms, backups and disallowed evidence retention. Register the **Amazon Rekognition image** moderation add-on, not the video add-on. Set backend-only `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` in the test environment.
2. With generated, non-personal JPEG/PNG/WebP pixels in that isolated account, verify that the real upload produces an authenticated, immutable image and that anonymous original and transformed URLs are denied. Confirm the app-authenticated download returns JPEG without a redirect and without caching; inspect upload **and admin lookup** for full structured moderation labels. An approved status alone is not sufficient.
3. Verify real provider support for restricted rejected-evidence retrieval, an audited moderation override and actual destruction. To exercise provider-level rejection without explicit imagery, use an approved benign provider test fixture or an operator-set test rejection where permitted; never use a real user's image. Simulate pending, malformed, timeout and missing cases locally rather than loosening gates in production.
4. Schedule `npm run discovery:photo-worker -- --once` from the services directory every minute, with the same backend DATABASE_URL and provider credentials. Use the same release and a runtime with Node >=20.9.0, sharp's native dependencies, generated Prisma client and tsx. Prefer one scheduled worker; durable leases fence overlapping invocations. Monitor nonzero exit, the review queue and due jobs, and confirm the job works on provider-backed test objects before activating.
5. Enable `DISCOVERY_PHOTOS_ENABLED=true` only for the authorized pilot once those checks pass. On failure, leave it off; peer media and new photo publication are disabled, existing owners retain deletion, moderators retain restricted review, and the cleanup worker must keep running. Never fall back to publicly hosted images.

See [provider notes](2026-11-16-discovery-photos-provider-notes.md) for the exact policy and [Cloudinary authenticated asset controls](https://cloudinary.com/documentation/control_access_to_media) for the independent storage gate.

## Retention and support

- Users can add up to three still JPEG, PNG or WebP images (5 MiB, 24 MP, at least 80px on each side). No HEIC, SVG or animation. Invite/history cards keep the existing avatar and name. Photo screening does not verify age or identity.
- Pending, failed, rejected, or review-held photos expire from ordinary use after seven days. Automatic reconciliation has a 24-hour deadline; explicit retry can inspect a retained asset again but never uploads a second copy. User deletion revokes ordinary access immediately. Report evidence stays restricted while a report is open and for 30 days after the last resolution; erase the provider object and clear live asset pointers after the deadline. Retain non-image audit records under the existing audit policy. Provider rules can require earlier destruction; report that limitation to reviewers.
- Failed cleanup jobs appear in the moderator queue. For ambiguous uploads the worker retains the private deterministic key if Cloudinary initially says not found; it retries daily until confirmed destroyed or seven days since reservation, then flags an operator task without discarding the key. Verify the same exact authenticated asset in Cloudinary before marking an unresolved cleanup terminal. Don't log credentials, signed media URLs or image bytes. A storage backup or a previously downloaded copy is not guaranteed to disappear with app deletion.

Production provider acceptance is a separate release gate. The local integration and Chromium suites inject a synthetic provider; they do not provision an account, upload real photos or prove live add-on eligibility.

## Local release evidence

- 269 API tests across 44 files, no skips, disposable PostgreSQL. The migration rehearsal preserved historical fixture content, IDs and consent exactly. Real multipart, account/revision checks, explicit publication, peer media recheck, auditioned moderator access, appeal, report-based retention, lease fencing, and late cleanup ran against this database.
- 141 web tests across 34 files. Web TypeScript and touched-code ESLint passed. API TypeScript still reports the same 20 pre-existing diagnostics outside the photo changes.
- Production-built Chromium acceptance used synthetic photos and real local API/auth/Postgres. It passed upload, private moderation, explicit publication, peer JPEG delivery, immediate deletion, draft guards and responsive layouts. The photo editor and review queue were checked at phone and desktop widths.
- The independent review found four edge cases; the fixes prevent flagged-off publication, fence stale reconcile/deletion leases, allow an explicit retry after the original automatic deadline, and retain ambiguous upload cleanup keys rather than falsely claiming erasure.
