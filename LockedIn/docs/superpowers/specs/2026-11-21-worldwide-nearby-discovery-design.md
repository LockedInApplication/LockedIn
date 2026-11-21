# Worldwide nearby Discovery

## Decision

Open Discovery to people in any location, with nearby matching only. In worldwide mode, a user's device-location check determines the search area; they cannot pick a distant city. This widens coverage without restoring manual remote-city browsing. The location check is not proof of identity or a guarantee against location spoofing.

## Approaches

- Expand the verified-metro catalog. Operationally simple, but still excludes unlisted locations and needs ongoing manual coverage work.
- Use private coarse geographic cells and a bounded nearby search (selected). This works worldwide without a city catalog for matching, can include neighbors across cell and city lines, and does not need a reverse-geocoding service.
- Allow remote city selection. Rejected because it would undo the earlier decision to prevent people from representing themselves as local in a distant place.

## Member experience

- Verified-email, non-suspended eligible accounts can opt in if Discovery is configured for open admission. Profile publication, 18+ self-attestation, mutual preferences when enabled, blocking, and reporting keep their existing rules. No account is published automatically.
- After publishing, use one **Confirm my location** action. Request browser location only after that click. Show **People nearby**, without a city picker or distance selector for worldwide mode. A phone or desktop that denies permission, provides an unusably inaccurate fix, or has an expired check gets a retry prompt and an Inbox link.
- Search both ways within 50 km (about 31 mi) using coarse cell centers. This is approximate, applies uniformly, and does not expand when there are no candidates. Do not tell other members a candidate's exact distance, cell, current neighborhood, or check timestamp. Do not reuse a home address, profile label, or old typed distance preference as location evidence.
- Worldwide mode must not require a configured city to create or update a profile. New publications use a neutral public area label; worldwide search results and recommendations use **Nearby**, not a claimed or inferred city. Existing publications stay intact and do not have to be republished. A country, city, or location volunteered in a profile answer is ordinary user text, not verification.
- Existing chats, connected-profile permissions, direct invites, and shared spaces behave as they do today. Unaccepted Discovery invites still go through the current pair-eligibility check at acceptance, as they do in metro mode.

## Build constraints

- Keep global opt-in separate from activation: add an explicit worldwide-nearby policy mode; keep existing metro and older search modes unchanged when it is off. Retain the Discovery kill switch and staffed moderator configuration. A missing or invalid worldwide configuration may not silently fall back to remote city matching.
- Use the existing authenticated location-check endpoint, verification eligibility, and persistent rate limits. Keep 24-hour expiry and replace the old row instead of recording location history. Convert submitted coordinates to a server-side H3 resolution 6 cell and discard exact coordinates. Do not log location request bodies or send them to a third-party geocoder. See [H3 indexing](https://h3geo.org/docs/api/indexing/) and [cell scale](https://h3geo.org/docs/core-library/restable/).
- Store a versioned private cell identifier in the existing indexed `DiscoveryLocationCheck.areaId` string; a schema migration is not expected. Legacy metro IDs and cell IDs are never interchangeable. Expose only current/expired status and the neutral worldwide search mode to the web client, not a storage identifier or centroid. Preserve existing public responses in legacy mode.
- Build a conservative bounded neighborhood of cells and filter by center distance. Candidate listing must use a bounded, indexed filter with stable keyset pagination. The same symmetric distance predicate must govern candidate details, new invitations, and pending acceptance. Bind opaque pagination cursors to the current policy and private check so a moved or expired check cannot continue an earlier search.
- Keep worldwide and legacy profile publication usable during rolling web/API deployment; activate only after both compatible builds are live. Use a versioned rollout generation and change it on every policy switch so no old check or cursor becomes valid again when reverting within 24 hours. A switch requires fresh location confirmation.
- Roll back by switching policy on compatible builds, not by redeploying pre-worldwide binaries after neutral-area profiles exist. A metro rollback may ask a worldwide-only member to choose a supported public area and confirm locally before browsing, but must not delete data or leave their profile uneditable, nor interrupt existing chats or direct invitations.
- If a worldwide member retries while their current check is still valid and cannot get a usable fix, preserve the previous check only through its original expiry, explain that it remains active, and keep the existing Pause Discovery control available to hide their profile immediately. An unsuccessful retry must never extend or replace a check.
- Test Accra versus New York, close neighbors across a grid/city boundary, antimeridian and high latitudes, near-cutoff distances, malformed/expired checks, cell non-disclosure in all public payloads, first publish outside a metro, permission denial with Inbox still available, roster changes, old cursors, pending invite rechecks, and unchanged messaging. Verify staging before rollout; do not disable the location gate as a shortcut.

## Decisions left to the builder

Choose the validated H3 JS dependency and safe bounded neighborhood query implementation, the reversible mode-setting name, and labels for UI telemetry that contain no cell or coordinates. No new location providers or schema changes without returning for review.
