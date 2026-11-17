# Discovery Open Access Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline execution, with test-driven development and a final independent review.

**Goal:** Support explicit open admission and bounded distance pagination without activating production.
**Architecture:** Shared configuration admission policy, parameterized PostgreSQL distance keysets, existing Prisma eligibility as defense in depth. Preserve city ranking.
**Tech Stack:** TypeScript, Prisma, PostgreSQL, Vitest.
**Spec:** `docs/superpowers/specs/2026-11-16-discovery-open-access-design.md` (approved by “go on”).

## Global Constraints

- Default pilot; invalid access mode fails closed. Keep feature kill switch and moderator/catalog prerequisites.
- Never auto-publish, expose coordinates, change historical access, or activate production.
- Use disposable local data only; no new dependency or schema migration without evidence.

## Review Focus

- Omitted or malformed configuration must not widen admission.
- Returning to pilot must exclude non-cohort candidates and invalidate open cursors.
- Distance pagination must preserve bilateral eligibility, blocks, and snapshot validation.
- Open-mode detail and invitation routes must enforce the same policy as search.
- Dense-pool performance numbers must describe their workload, not promise production capacity.

### Task 1: Shared admission

Files: discovery.config.ts, discovery.types.ts, discovery.policy.ts, discovery-profile.service.ts, discovery-candidates.service.ts; discovery.policy.spec.ts and new discovery-open-access.integration.spec.ts.
Interfaces: config gains accessMode; shared isDiscoveryAccountAllowed(config, id) supplies rollout admission only (email and suspension remain checked by callers).
- [x] Add failing tests for explicit open access, invalid/default mode, consent, verification, suspension, kill switch, and mode-bound cursors.
- [x] Run policy and open integration tests; verify expected failures.
- [x] Implement shared admission and mode/cohort/catalog-bound cursor scope.
- [x] Run tests and audit all pilotUserIds consumers.

### Task 2: Bounded distance search

Files: discovery-distance.ts, new discovery-distance-search.ts, discovery-candidates.service.ts, distance/open integration tests.
Interfaces: distanceCandidateIds(tx, actorId, viewerRange, intention, config, before?, take=32) returns a bounded, descending ID batch after SQL eligibility filtering. Hydrate only that batch and revalidate public snapshots.
- [x] Add a failing dense-distance paging test that reaches non-pilot users in open mode and rejects blocked/incompatible/unpublished/out-of-range users.
- [x] Implement database keysets instead of full-population IDs; keep city ranking unchanged.
- [x] Run integration regressions including antimeridian, bilateral ranges, privacy, and cursor changes.

### Task 3: Measurement and handoff

Files: new discovery-search-load.integration.spec.ts, environment example, operator runbook, verification notes.
- [x] Seed a disposable dense population with multiple independent viewers; verify unique pages, bounded results and collect p50/p95/max and failure count.
- [x] Inspect EXPLAIN output; defer spatial extension or new indexes unless measured evidence requires them.
- [x] Run API suite with local integration enabled, web suite, type checks, and independent diff review.
- [x] Record measured workload and operational rollout instructions. Leave code unpushed and production unchanged.
