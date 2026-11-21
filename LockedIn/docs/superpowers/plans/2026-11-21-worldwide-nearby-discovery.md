# Worldwide Nearby Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let eligible members use Discovery worldwide while limiting new Discovery interactions to people nearby.

**Architecture:** Resolve the current location policy on the API. Reuse the indexed, expiring check row for a generation-prefixed H3 cell, and share one neighborhood predicate between browse, detail, and invitations. Ship compatible web and API builds before enabling worldwide mode.

**Tech Stack:** TypeScript, H3 JS 4.x, Fastify, Prisma/PostgreSQL, React, Vitest.

**Spec:** [Worldwide nearby Discovery](../specs/2026-11-21-worldwide-nearby-discovery-design.md).

## Global Constraints

- Approximate range: 50 km using H3 resolution 6 cell centers. Expiry: 24 hours. No exact coordinates, cell IDs, distances, or candidate-check timestamps in public payloads, analytics, or logs. Never geocode submitted device coordinates.
- Preserve email verification, safety tools, explicit profile publication, matching preferences, direct invites, and existing chat. Keep the Discovery kill switch and moderator requirement. No automatic publication or remote-city fallback in worldwide mode.
- No database schema change. Activate only after the API and web serving the new release are verified. Keep compatible builds during rollback; use a new rollout generation.

## Review Focus

- Coverage and symmetry across adjacent cells, the antimeridian, high latitudes, and near H3 pentagons (Task 1).
- Current-check replacement, expiry, prior-generation replay, and failed refresh (Tasks 1–2, 4).
- Direct profile, photo, and invitation requests must not expose a remote member or private location (Task 2).
- Compatibility with a previously published city profile and a newly published neutral profile on rollback (Tasks 1 and 3).
- Sparse or corrupt candidate rows must not turn a bounded search into an unbounded scan or lose remaining eligible records (Task 2).

### Task 1: Location policy, coarse geometry, and check storage

**Files:** `services/package.json` and lockfile; `services/api/src/features/discovery/discovery.config.ts`, `discovery-location.ts`, new `discovery-global-grid.ts` and `test/discovery-global-grid.spec.ts`; `discovery-location.routes.ts`, `discovery.routes.ts`.

**Interfaces:** `readDiscoveryLocationPolicy(env)` returns `legacy`, `metro`, `worldwide`, or `unavailable`; explicit metro and worldwide modes include a generation. `cellForDevice({latitude, longitude, accuracyMeters})` returns a validated H3 cell; `nearbyCells(cell)` returns valid center-distance-filtered cells including the origin. `publicDiscoveryLocation(policy, check)` emits legacy shape or worldwide `{required:true, mode:"worldwide", areaId:null, expiresAt:string|null}`.

- [ ] Write red tests for valid same/adjacent cells, Accra versus New York, antimeridian, latitude and pentagon neighborhoods, strict cutoff, malformed cell IDs, and incomplete policy. Assert membership is symmetric and neighborhood work is bounded. Characterize old bool flag behavior when new config is absent.
- [ ] Run `npm test -- discovery-global-grid.spec.ts discovery.policy.spec.ts` from `services`; expect new coverage to fail and legacy tests to remain green.
- [ ] Implement `DISCOVERY_LOCATION_MODE=worldwide|metro` and `DISCOVERY_LOCATION_GENERATION` with format validation; unset new mode honors the legacy flag. Any bad explicit mode/generation fails closed. Worldwide admission still requires an enabled, valid access mode and moderators, but no metro catalog. Reuse the indexed `areaId` string with strict reserved prefixes encoding generation and validated mode-specific location. Normalize legacy rows to the existing behavior only where no explicit policy is configured. Test the neighborhood superset before using it for queries rather than relying on same-cell equality or grid hop count as distance.
- [ ] Update location POST and `/me` to use the normalized policy and public projection. Preserve credentials and quota checks. Invalid or denied refresh leaves an unexpired worldwide check intact and does not extend it. Expired or wrong-generation rows are ignored. Run the focused suite and commit.

### Task 2: Bounded browse, detail, and contact gates

**Files:** `services/api/src/features/discovery/discovery.schemas.ts`, `discovery-profile.routes.ts`, `discovery-candidates.service.ts`, `discovery-location.ts`, visibility callers in photo/report and connection flows; new `test/discovery-worldwide.integration.spec.ts`.

**Interfaces:** Explicit `?mode=nearby` with optional existing encrypted `before` cursor. Make candidate scope a tagged value (city/typed-distance/nearby) rather than interpreting nearby as null. Keep `discoverySearchPairEligible(tx,leftId,rightId)` as the shared boundary for detail, send, and acceptance.

- [ ] Add red Fastify/Postgres cases with members published under the existing metro mode before switching on worldwide: recent nearby checks yield results (no private identifiers in POST, me, or result/detail payload); a remote or unchecked member is excluded from list, detail, photo, and new invitations; pending acceptance rejects someone who moved; city and typed-distance requests cannot bypass worldwide; existing chat remains usable. Exercise an old cursor after a successful recheck or a mode generation change. Task 3 covers first publication without a city catalog.
- [ ] In a dedicated local migrated test database, run `DISCOVERY_INTEGRATION=true npm test -- discovery-worldwide.integration.spec.ts discovery-location.integration.spec.ts discovery-open-access.integration.spec.ts`; expect only the new tests to fail.
- [ ] Implement validated query routing and filter by the encoded neighboring cell IDs and expiry via Prisma; reject mixed/tampered query shapes. Use descending profile-ID keysets, 32-row batches, at most eight batches, and a continuation when scan is capped. Seal viewer check generation and timestamp into the existing authenticated cursor scope. Use the identical coarse coverage policy for details and invitations. Never project the stored cell ID; use public `nearby` sentinel consistently for returned candidates and recommendations.
- [ ] Run focused DB integration again including a pagination boundary case with skipped rows; commit when green. Never point the test harness at production.

### Task 3: Worldwide publication and compatible rollback

**Files:** `services/api/src/features/discovery/discovery-profile.service.ts`, `discovery.schemas.ts`, `discovery-profile.view.ts` (and callers identified through `configuredArea` and `hasDiscoveryPublication`); `apps/web/src/features/discovery/DiscoveryProfileEditor.tsx`, `discovery.types.ts`, both suites' profile tests.

**Interfaces:** Reserve `nearby` for worldwide publication. Separate stored publication validity from search admission. `DiscoveryMe` advertises worldwide policy even before location confirmation and without any city choices.

- [ ] Add red save/publish tests for a verified member with no configured city catalog, a user-supplied city on a new worldwide publication, existing public data staying intact, and rollback to a supported city from a neutral publication without losing edit/chat access.
- [ ] Implement neutral area handling on the server, never trusting a requested city for browsing. In the editor, omit city selection in worldwide mode and use the neutral value for new drafts; do not change existing publications until the member publishes. Keep neutral snapshots structurally valid even in compatible metro rollback, while requiring a supported metro when opting back into metro browsing. Run the API integration and `npm test -- DiscoveryProfileEditor.spec.tsx` from `apps/web`; commit.

### Task 4: Nearby UX, regression verification, and release

**Files:** `apps/web/src/features/discovery/DiscoverPage.tsx`, `DiscoveryLocationCheck.tsx`, `discovery.types.ts`, `DiscoverPage.spec.tsx`; `docs/discovery-local-market-rollout.md`.

- [ ] Add red cases for “People nearby” with no city/distance selector, explicit location consent, expired/denied checks with Inbox and pause available, successful refresh clearing pagination, failed refresh keeping the previous expiry, and local-mode copy never implying an exact distance or spoof-proof verification.
- [ ] Implement worldwide-mode controls and legacy rendering on the same build. Use expiry/current state rather than area ID to enable worldwide query. Keep rows steady on failed rechecks and show when the existing check ends; do not send a manual search location.
- [ ] Run the complete web and API suites, the dedicated Discovery DB integration, the web production build and two-account test of browse/invite/check-expiration. Get an independent read-only review for privacy and contract consistency. Commit the verified implementation.
- [ ] Push the verified release to staging, then production. Keep production in its current mode until compatible web/API builds and staging behavior are confirmed. If no hosted staging exists, record local production-style QA and obtain a rollout decision before changing production location policy. The Render activation must set worldwide mode, a fresh generation, and open admission without removing moderators or touching unrelated environment settings. Verify effective worldwide behavior; document rollback to metro with a different generation.
