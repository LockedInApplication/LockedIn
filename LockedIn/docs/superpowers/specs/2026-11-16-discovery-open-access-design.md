# Discovery open access and bounded distance search

Status: approved for local implementation by “go on”; public activation is separate.

## Intent

Prepare Discovery for access beyond a manually maintained account allowlist, without automatically publishing anyone or loading an entire nearby population into API memory. Keep the existing PostgreSQL, Prisma, API, and frontend architecture.

## Approaches

The recommended approach is a shared access policy plus database-side distance filtering and cursor pagination. Merely removing the pilot allowlist leaves the unbounded distance-ID query intact. Adding a separate search service introduces synchronization and privacy complexity before measurements justify it. The recommendation builds on the current implementation; it does not claim a measured production capacity.

## Access and rollback

Add `DISCOVERY_ACCESS_MODE=pilot|open`. Unset means pilot; invalid configuration closes new admission. Keep `DISCOVERY_ENABLED` as the kill switch. Both modes require a valid city catalog and configured moderators. Pilot mode additionally requires account allowlist membership. Open mode permits verified-email, non-suspended accounts to opt in, not anonymous browsing.

Use the same access policy for capabilities, profile mutations, candidate visibility, direct profile lookup, photos, and new invitations. Moderator authorization stays separate. Historical connections, pause, close, block, report, and private reflection retain existing access when new Discovery admission is disabled.

Opening access never publishes a draft. Existing adult self-attestation, explicit publication consent, approved-photo rules, pause/suspension, compatible intentions, bilateral blocks, and live-connection exclusions remain in force. Self-attestation is not age verification.

## Search

Replace `mutualDistanceProfileIds`, which materializes every matching ID, with parameterized database-side eligibility and distance filtering before a bounded result page. Preserve reciprocal radius checks, coarse stored coordinates, longitude wrap, cross-city distance browsing within configured areas, and separation from city-only participants.

Use deterministic ID keyset pagination for distance browsing, fetching bounded batches and a lookahead for the next cursor. Validate public snapshots before returning them. Do not skip eligible records when invalid snapshots occupy a batch. Implementation detail: cap a request at eight batches of 32 and return a scan continuation if a run of invalid snapshots prevents filling the page. Retain city-mode ranking for pools up to 300 and its existing keyset fallback for larger pools; improving large-pool ranking is outside this change.

Bind encrypted cursors to the viewer, publication version, distance revision or selected city, day, access mode, and configured cohort/catalog. Reject a stale cursor after its access scope changes. Never expose coordinates, exact distances, activity dates, or private drafts.

## Verification

Write failing tests before implementation: default/invalid/open admission; non-pilot participation in open mode; unverified/suspended/paused/unpublished exclusions; mode changes invalidating cursors; blocks and invitations retaining eligibility checks; bilateral radius and cross-city behavior; dense-pool pagination without duplicates or missing eligible profiles; unsafe snapshots between valid candidates; feature-off historical access.

Use only a disposable local database for integration and load checks. Seed a dense synthetic city and nearby population, measure latency under concurrent independent viewers, and report dataset size, concurrency, page count, latency percentiles, and failures. A local result is evidence for that workload, not a production capacity guarantee. Inspect query plans before proposing additional indexes or a spatial extension; any required schema change needs an additive migration and verification.

## Release boundary

Update environment examples and the operator runbook. No production database changes, configuration changes, activation, deployment, or push are authorized by this implementation request. Public release remains a separate decision after tests, moderation readiness, and operational review.
