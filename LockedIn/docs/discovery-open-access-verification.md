# Discovery open-access verification

Local implementation; no production activation, deployment, push or database migration performed.

## Changes

- Explicit pilot/open admission with pilot default and invalid-mode fail-closed behavior.
- Shared account admission across capabilities, profile mutations and existing dependent photo/invitation services.
- Search/detail visibility respects the selected mode. Explicit consent and publication remain required.
- Candidate cursors bind access mode, pilot cohort and configured area IDs as well as the viewer/publication/search/day.
- Distance eligibility runs in PostgreSQL before a bounded 32-ID batch is hydrated. API scans at most eight batches per distance request, returning continuation after invalid snapshots.
- Distance order is deterministic ID order, not compatibility or nearest-first. City ranking is unchanged.

## Evidence

- Baseline API unit suite: 153 passed, 133 gated.
- New policy test observed failing before implementation, then passing.
- Open admission integration: three tests observed failing, then passing (non-pilot participation and publication consent, safety controls, rollout-bound cursors).
- Dense open distance pagination observed failing (empty results), then passing with all 75 valid candidates recovered and no duplicates despite malformed snapshots and excluded accounts.
- A separate malformed-snapshot scan-limit test observed failing before the scan limit was added.
- Final full API run with local integration and the opt-in load measurement enabled: **293 passed**, no skipped tests. The harness verified historical fixtures unchanged through all existing migrations and removed its disposable database afterward.
- Final web suite: **150 passed**. Web production webpack build (including the browser harness build) and web TypeScript passed. API TypeScript with `--skipLibCheck` passed. One redundant simultaneous standalone build hit Next's build lock while the browser harness was building; the harness build and subsequent browser workflow completed successfully.
- Unrestricted API TypeScript still fails on dependency declarations: missing `bun:sqlite` and Cloudflare worker types, browser fetch type names in better-fetch/better-call/Resend, and better-auth/Zod re-export conflicts. This is not a clean unrestricted API type check; no application-source errors were emitted.
- Web lint: zero errors, one existing `@next/next/no-img-element` warning in `src/components/avatar.tsx`. Test runs also emit existing Vite configuration and pg concurrent-query deprecation warnings.
- Independent read-only review found no backend blockers. Its empty-continuation UI wording finding was reproduced with a failing render test and fixed; both continuable and exhausted empty searches are now covered.
- A parallel integration run exposed a test-fixture assumption: an open-mode newcomer was not guaranteed to land on the first page of the shared synthetic pilot city. The admission test now uses its own configured city. The final complete API suite passed after that isolation fix.
- Existing real multi-account browser acceptance passed: onboarding choice, private photo upload/moderation/publication/deletion, city switching, prompts, invitations, draft guards, shared starter workflow, private location lookup, reciprocal ranges, moderation and blocks, mobile layouts, and historical isolation. Artifacts: `/var/folders/y6/4y4x1qdd76d2t1q6cgtfy_f80000gn/T/lockedin-discovery-browser-sgBfIO`.

## Dense workload measurement

Existing local Docker PostgreSQL, unique disposable harness database, 5,000 synthetic candidate profiles plus 16 synthetic viewers. All have nearby coarse points and matching publication eligibility. Sixteen viewers run in parallel, each requesting ten sequential pages: 160 service calls, 12 profiles per page. Each viewer received 120 unique profiles; zero failures.

Measured service latency: p50 **32.2 ms**, p95 **71.3 ms**, maximum **99.3 ms**. One first-page `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` returned a Limit of 32 rows with SQL execution time **0.249 ms**. The plan used existing profile/distance/user primary keys, block uniqueness and both connection participant/state indexes. No schema migration or spatial extension was justified by this dense local workload.

After the scan-limit change, the same measurement ran alongside the full API suite and web build: all 160 requests succeeded, p50 **59.8 ms**, p95 **125 ms**, maximum **175.8 ms**, SQL **0.523 ms** for 32 rows. The difference illustrates local contention, not a production SLA.

Final full-suite rerun after test isolation: all 160 requests succeeded, p50 **43.2 ms**, p95 **92.4 ms**, maximum **130 ms**, SQL **0.375 ms** for 32 rows. Final API total: 293/293.

These measurements exclude HTTP/browser/network latency and do not prove production throughput, long-running load stability, sparse geography performance, or performance with a large block/connection history. Repeat on representative staging data and hardware before launch. Production monitoring, moderation staffing and rollback readiness remain release prerequisites.

Reproduce from `LockedIn/services` with an explicit safe local `DISCOVERY_TEST_ADMIN_URL` and `DISCOVERY_LOAD_TEST=true DISCOVERY_TEST_FILES=api/src/features/discovery/test/discovery-search-load.integration.spec.ts node scripts/verify-discovery.mjs`. The harness creates and drops only its unique disposable database. Do not point the workload directly at a shared database.
