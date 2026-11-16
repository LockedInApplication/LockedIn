# Optional discovery pilot: operator handoff

Discovery is **disabled by default**. Implementing or merging this feature is not approval to enable it, publish existing users, contact real people, or run a production migration.

## Before any pilot

1. Assign real verified-email moderator accounts and a staffed report-review process. Agree on response coverage and escalation; the product makes no response-time promise. No moderators means no admission.
2. Review consent copy and adult self-attestation. Participants attest they are 18+; this is **not age or identity verification**. Initial profiles use existing avatars, not photos.
3. Back up the production PostgreSQL database using the operator's approved process. Record a tested restore procedure and recovery point. Rehearse all additive migrations on a separate restored copy, comparing old account/member IDs, answers, reveal consent, chapters, next steps and notification settings before/after. Do not reset the database or edit applied migrations.
4. Review security, moderation, mobile browser acceptance and the independently reviewed diff. Known pre-existing API type errors must be tracked, not presented as a clean type check. Resolve any outstanding independent-review requirement before recommending merge or launch.
5. Obtain separate explicit approval for production migration/deployment and pilot activation.

## Configuration (server-side only)

- `DISCOVERY_ENABLED=false` is the default and the immediate new-entry kill switch.
- `DISCOVERY_PILOT_USER_IDS`: comma-separated approved account IDs. Do not automatically enroll existing accounts.
- `DISCOVERY_MODERATOR_USER_IDS`: comma-separated assigned moderator IDs; verified email is also required for operator access.
- `DISCOVERY_AREAS_JSON`: an explicit broad-area catalog, for example `[{"id":"pilot-city","label":"Pilot city"}]`. Use honest broad labels, not coordinates or precise device locations.
- Existing `APP_URL`, authentication secret/origin, database connection and notification preferences remain authoritative. Frontend hiding alone is not an admission control.

Missing/invalid catalogs or moderator assignment fail new admission closed. Existing connected people may deliberately explore starters, but neither person can promote a second ACTIVE full shared space. Discovery never calls Leave shared space or ends an existing relationship.

## Public information and contact

Saving a profile draft does not publish it. Explicit publication requires the saved revision and attestation. Drafts, account emails/settings, earlier journey answers and standalone reflection are never public. Pause removes new visibility and contact; republishing edits while paused does not resume visibility. Existing pending invitations and accepted starters remain accessible.

The radar is illustrative. It does not use GPS, Bluetooth, exact positions/distances, online status, movement, compatibility predictions, fabricated people or invented counts. A small pool may honestly be empty.

Three PENDING/ACCEPTED starters are allowed per person, across both incoming/outgoing. Pending attempts expire after seven days. Deliberate decline creates a fixed seven-day directional reinvitation pause. Withdraw/expiry do not imply a decline or block. Invitations retain the question, hello and public identity deliberately sent at that time.

Private Save and explicit Share are separate. Share copies the checked server draft to an immutable pair-only version. Closing a starter retains read-only shared history and owner-only drafts. Do not promise to make recipients unsee shared information. Build together requires both current choices, is revocable before promotion, and creates exactly one ordinary shared relationship atomically. It does not import drafts/answers, imply exclusivity, pause profiles or close other starters.

## Reports and restrictions

Open `/discovery/moderation` using an assigned moderator session. API authorization is separate from UI visibility. Reports contain only a server-captured public profile, received invitation or authorized shared response plus reporter-provided context. Partner private drafts are not evidence. Do not copy restricted evidence into public channels.

Review through Dismiss or Suspend. Each review/restore has a durable audit entry. Suspension hides new discovery access and closes pending/accepted starters, invalidating readiness; it never ends an existing deep relationship. Restore never reopens a starter or restores old consent.

Canonical invitation blocks apply in both discovery and direct invitations. Only the block owner can remove their direction. A reciprocal block remains independent. Discovery-created block lists use the chosen public label, not a stranger's private account name. Unblocking never reopens consent/history.

Decline, close, block and report create no pressure-generating alert. Discovery event notifications honor existing in-app preferences; suppressed occurrences are not backfilled later. No discovery email campaign is added.

## Disable and recovery

Set `DISCOVERY_ENABLED=false` to stop publication, search, new invitations and new build consent/promotion. Keep authenticated history, owner reflection, close, block, report and operator review reachable. Removing someone from the cohort also stops new contact, not authorized historical access.

Prefer flag-off recovery with the additive schema intact. Do not drop discovery tables or notification columns while records refer to them. A binary rollback must be reviewed against the three-context notification invariant and retained history/safety routes; blindly rolling back to code that cannot reach new data can strand participants. Restore a backup only under the operator's separately approved incident procedure, accounting for writes since the recovery point.

## Local verification only

From `LockedIn/services`, set an explicit local `DISCOVERY_TEST_ADMIN_URL` for a **disposable test administrator**, then run `node scripts/verify-discovery.mjs`. The runner rejects non-local/overridable URLs, creates a uniquely named `lockedin_discovery_test_*` database, applies old migrations, snapshots historical fixtures, applies additive changes, runs tests and drops only that generated database. It never falls back to the application's `DATABASE_URL`.

For actual browser/API writes use `node scripts/verify-discovery.mjs --browser`. Provide `LOCKEDIN_PLAYWRIGHT_MODULE` if Playwright is not installed locally; the browser channel defaults to Chrome and may be set with `LOCKEDIN_BROWSER_CHANNEL`. API and preview bind owned free local ports with explicit proxy overrides. Synthetic `.test` sessions/profiles exist only in the disposable database; outbound email credentials are cleared. Browser screenshots/logs go to a printed temporary directory or an existing `DISCOVERY_TEST_ARTIFACT_DIR`. Inspect the screenshots, not just the exit code.

Also run API/web `npm test`, both type checks, web lint and `npm run build -- --webpack`. Default gated skips are not evidence that integration ran. Keep existing header-alignment work separate unless explicitly approved for inclusion. No script in this workflow authorizes a push, merge, deployment or live activation.
