# Discovery Photos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three optional, explicitly published discovery photos with private Cloudinary storage, hybrid screening and revocable server-authorized media access.

**Architecture:** Keep PostgreSQL authoritative for ownership, draft/publication references, immutable photo identity, moderation and durable jobs. Backend validates and normalizes one image before sending it to Cloudinary; protected local media routes enforce current access before and after a bounded provider fetch. Extend existing discovery profile, reporting, moderation and local verification flows; no new authentication store or automatic publication.

**Tech Stack:** Existing Next.js/React/Sass, Fastify 5, Prisma/PostgreSQL, Vitest/Playwright; add compatible official Cloudinary SDK, Fastify multipart and sharp using pinned package versions/lockfile in Task2.

**Spec:** `docs/superpowers/specs/2026-11-16-discovery-photos-design.md` (approved).

## Global Constraints

- Up to three optional photos; primary is first published photo. Avatar-only discovery and normal LockedIn remain available.
- JPEG, PNG and single-frame WebP only; input at most 5 MiB, 24 million pixels, minimum 80px each dimension; normalized JPEG longest edge at most 1600px, metadata stripped before provider upload.
- One in-flight upload/account, three draft slots plus at most three distinct retained published assets; attempts 10/hour and 20/day. Idempotent retries do not create/charge a second logical upload.
- Explicit publication remains separate from upload, screening and private draft Save. Screening completion or moderator approval must never publish a photo automatically.
- PostgreSQL state, server-known immutable asset identities and fresh existing access predicates are authoritative. No external-source uploads, public/bearer provider URLs in clients, client moderation state, arbitrary server fetches or provider calls under database locks.
- Owners cannot retrieve rejected-image bytes/thumbnails. Only assigned verified-email moderators may deliberately view retained rejected evidence for review. No ordinary peer access after block/pause/suspension/deletion/photo kill switch.
- Initial policy: prohibited category confidence >=90 rejects; 50–<90 requires review; sexualized/implied nudity >=50 requires review. Benign clothing/swimwear/alcohol/tobacco alone never auto-reject. Malformed/missing results fail closed; unknown risk requires review. These are policy thresholds, not an accuracy claim.
- Pending/rejected bytes expire at seven days from upload; no reliable screening outcome after 24h becomes Check failed. Report evidence expires 30 days after report resolution, subject to earlier provider-mandated deletion; keep existing text evidence unchanged.
- `DISCOVERY_PHOTOS_ENABLED=false` initially; no live account creation, paid add-on activation, real-photo/provider writes, production migrations, push or deploy without separate approval. Existing header edits are unrelated and must be preserved.

## Review Focus

1. Session/account changes while image processing or provider calls are pending must not install an old account's asset or UI completion (Tasks3/6).
2. A photo fetched just before a block/delete/pause must not be returned after authorization changes during provider fetch (Task4).
3. Repeated delivery, review or cleanup after a process restart must not resurrect deleted assets, duplicate charges or erase open-report evidence (Tasks3/5).
4. Existing strict profile JSON without photo fields must remain readable, publishable and usable for legacy invitation/report paths (Tasks1/3/7).
5. Provider-level rejection, incomplete labels or inaccessible rejected bytes must not silently turn into approved/published content or an impossible appeal promise (Tasks2/5/7).

## File and interface map

Paths below are relative to `LockedIn/`. Backend feature root `services/api/src/features/discovery/photos/` owns config, types/schemas, image decoding, provider/policy, lifecycle, access, moderation, jobs and routes. Existing discovery profile/candidate/safety services own their existing boundaries and consume photo services. Web feature root `apps/web/src/features/discovery/photos/` owns upload/gallery/moderation UI and client helpers; existing discovery pages supply account/resource state and guarded navigation. No feature implementation belongs in the generic avatar component.

Core contracts (defined once in Task1, consumed by later tasks):

- `PhotoState = PROCESSING | APPROVED | NEEDS_REVIEW | REJECTED | CHECK_FAILED` with separate terminal `deletedAt`/`revokedAt` and monotonically increasing decision revision.
- `PhotoAsset = {assetId, publicId, version, format:"jpg"}` is server-only. `PhotoCard = {id, src, width, height}` contains local opaque route only. `OwnPhoto` adds state, safe reason, decisionRevision, appeal availability, with no `src` for rejected/deleted items.
- `PhotoProvider.upload({photoId,jpeg,requestId}): Promise<{asset:PhotoAsset,screening:unknown}>`; `inspect(asset): Promise<unknown>`; `read(asset): Promise<Buffer>`; `destroy(asset): Promise<void>`; `override(asset,approved,requestId): Promise<void>`. Return no client delivery URL. Dependencies are injected into services/server and worker for tests, not enabled through a production fake-provider flag.
- `normalizePhoto(bytes:Buffer,declaredMime:string): Promise<{jpeg:Buffer,width:number,height:number}>`; `classifyPhoto(screening:unknown): {state,reason,labels,policyVersion}`.
- `PhotoResult<T>` uses existing `DiscoveryResult<T>` and owner-bound envelope for JSON; bytes have authenticated local routes and no-store headers.

---

### Task 1: Additive persistence, capabilities and backward-compatible references

**Files:** Modify `services/api/prisma/schema.prisma`; create `services/api/prisma/migrations/20261116180000_discovery_photos/migration.sql`, backend `photos/photo.types.ts`, `photo.schemas.ts`, `photo.config.ts`; modify `discovery.schemas.ts`, `discovery.types.ts`, `discovery-profile.view.ts`, `discovery.routes.ts`, `discovery.http.ts`; create focused schema/config/view and database invariant tests in `photos/test/`.

**Interfaces:** Define the core contracts above. Add `DiscoveryPhoto` (owner/profile, request/hash, immutable asset binding, dimensions, state/revision/policy, timestamps, deletion/revocation/cleanup markers), `DiscoveryPhotoJob` (kind, photo, dedupe key, due/lease/attempt/error state) and `DiscoveryPhotoAudit` (actor/photo/action/reason/request/decision version). Photo-report references added later must not cascade away evidence. Draft input accepts ordered `photoIds` (UUIDs, unique, <=3), defaulting legacy omissions to `[]`. `getPhotoConfig()` reads server-only enabled/cloud-name/key/secret settings; capability DTO exposes only enabled/configured booleans, never credential values. Ordinary discovery remains functional with missing photo config.

- [ ] Write failing tests: legacy draft/publication JSON still parses with empty photos, four/duplicate/non-UUID/unknown fields rejected, missing config disables uploads not discovery, credentials absent from owner/public DTOs, DB request/job/audit idempotency and owner/photo foreign-key invariants.
- [ ] Run focused Vitest and integration tests under the guarded disposable harness; observe absent contracts/invariants fail. No production DB fallback.
- [ ] Add schema/migration and implement contracts/config/default parsing. Extract a reusable discovery mutation identity/origin/query/params guard from the current JSON validator without relaxing JSON-body strictness; multipart Task3 calls that guard before reading bytes. Run `npm run prisma:generate` locally after migration edits.
- [ ] Run full web/API suites and schema validation; focused real DB tests must run, not skip. Record baseline API type diagnostics separately. Rehearse before/after legacy profile snapshots unchanged.
- [ ] Commit only foundation code/tests/migration.

### Task 2: Bounded real image normalization and Cloudinary screening adapter

**Files:** Modify `services/package.json`/lockfile; create `photos/photo-image.ts`, `photo-policy.ts`, `photo-provider.ts`, `photo-cloudinary.ts`, and real decoder/policy/provider boundary tests in `photos/test/`.

**Interfaces:** Implement `normalizePhoto`, `classifyPhoto` and `PhotoProvider`. `photo-cloudinary.ts` is the only module importing the Cloudinary SDK. Transport fixtures must model actual documented upload/admin responses, including incomplete results and rejected assets. Upload uses the deterministic reserved opaque photo ID, `type:authenticated`, `resource_type:image`, immutable/no-overwrite semantics and explicit image moderation config. A request has a 20-second network timeout; provider read output is bounded to 5 MiB and fixed allowlisted origin, with no arbitrary redirects.

- [ ] Before installing, query current official package metadata for latest compatible stable Cloudinary SDK, Fastify-5-compatible multipart and sharp; install with `--save-exact` and normal lockfile. Verify engine/native decoder availability on local Node and document Render runtime prerequisite. No major Fastify/Next/Prisma upgrade.
- [ ] Write failing tests using synthetic generated benign pixels: orientation/metadata stripping, allowed signatures, <=5MiB/24MP/80px/1600px bounds, animation/SVG/malformed/truncation rejection. Add policy fixtures for exact 50/90 boundaries, benign swimwear, unknown risk, missing/partial/invalid results, provider rejection plus locally benign labels, and network failure. Assert exact outgoing authenticated/no-overwrite/no-public-URL contract at the provider transport boundary.
- [ ] Observe RED before implementing decode, normalization, taxonomy mapper and private adapter. Normalize provider confidence (0–100 labels versus 0–1 configuration); record policy/version. Provider rejection with no understood prohibited match becomes Needs review, never Approved. Configure explicit category rules rather than accidentally retaining default blanket swimwear/alcohol rejection. Document the exact taxonomy supported.
- [ ] Implement adapter with real SDK and injected HTTP transport only in tests. Fetch private bytes server-side; deterministic lookup resolves ambiguous upload outcomes instead of re-uploading. Safe errors exclude bytes, secret URLs and credentials. Never approve missing screening output.
- [ ] Run decoder/policy/provider tests and full API suite. No real Cloudinary account calls. Commit adapter/processor and tests; document that live protected-delivery/rejected-preview support remains an activation gate.

### Task 3: Owner upload, revisioned publication, replacement and terminal deletion

**Files:** Create `photos/photo-lifecycle.service.ts`, `photo-upload.routes.ts`, `photo-profile.service.ts`, focused integration tests; modify `discovery-profile.service.ts`, `discovery-profile.routes.ts`, `discovery-throttle.service.ts`, `discovery.routes.ts`, and Fastify registration in `services/api/src/app.ts` only as needed for scoped multipart/dependency injection.

**Interfaces:**
- `POST /api/discovery/photos`: multipart exactly one `file`, `requestId`, `draftRevision`, optional `replacePhotoId`; only explicit fields accepted. Response owner envelope `{photoId,profile:OwnDiscoveryProfile}` with latest draft revision. Payload hash binds retry to file/revision/replacement; changed payload with same request ID conflicts.
- `GET /api/discovery/photos`: own ordered draft photos and owner state; valid without new admission for safe existing management.
- `POST /api/discovery/photos/:id/retry` and `.../:id/appeal`: UUID request ID and current decisionRevision; retry never starts a second upload. Appeal implementation completed Task5.
- Existing profile Save persists ordered photoIds; Publish validates them transactionally. `DELETE /api/discovery/photos/:id` with `{requestId,draftRevision}` is explicit immediate revocation from draft/publication and durable cleanup intent. Save removing a draft reference is not that Delete action.
- New creation requires configured/enabled photos plus current discovery admission and valid draft/profile; safe delete/list remains available when flags/cohort change.

- [ ] Write RED API/DB tests: real multipart identity/origin checks before body consumption, file/field/parts/size limits, stale/cross-owner references, zero/three/four slots, 10/hour+20/day quotas, parallel reservation, request replay/hash mismatch, provider timeout/crash ambiguity, account revocation during upload, rejected provider state, replacing slots retaining old publication, delayed results after Delete, and no network calls under transaction locks.
- [ ] Implement reserve/process/install phases with account locks in existing PostgreSQL ordering; typed normalized input and provider calls outside locks. Upload reservation/in-flight capacity counts against bounded slots. Recheck current draft revision/admission and terminal state before attaching; on failure store cleanup/reconcile intent. Deterministic provider identity prevents second logical upload after timeout. New upload appends/replaces only saved private references, returns new revision, and never publishes.
- [ ] Implement Save/Publish photo validation and immediate Delete. Publish requires every selected item approved/nondeleted and same owner; old publication stays unchanged on conflict. Remove-from-draft does not revoke a still-published asset. Unreferenced/unpublished assets receive terminal revoke+cleanup unless narrowly retained for an appeal/open report; no unbounded photo library. Avoid clearing photos if an old client omits fields while saving a profile that already has them: define omitted update photoIds as preserve-current, while legacy rows still read `[]`.
- [ ] Run focused real DB integration through the isolated harness plus full API/web suites; prove legacy invitation label snapshots, profile rows, core spaces and privacy records unchanged. Commit lifecycle and tests.

### Task 4: Current-publication byte authorization and visible photo DTOs

**Files:** Create `photos/photo-access.service.ts`, `photo-media.routes.ts`, access integration tests; extract `discovery-visibility.service.ts` from candidate/safety duplication and modify `discovery-candidates.service.ts`, `discovery-safety.service.ts`, `discovery-profile.view.ts`/service enrichment; register media routes through discovery.

**Interfaces:** `getPhotoAccess(actorId,photoId,purpose:"owner"|"discovery"|"moderation")` returns a server-only immutable permit containing revision/asset identity or denial. `GET /api/discovery/photos/:id/media` (ordinary owner/peer) and moderator-purpose media route (Task5) return JPEG bytes, never redirect. `enrichPublishedPhotos(actorId,profiles)` returns only ordered currently approved public `PhotoCard`s with local routes; safe empty fallback if disabled/revoked. Owner cards omit src for rejected/deleted states.

- [ ] Write failing tests: anonymous/guessed/cross-owner/draft/pending/rejected bytes denied to peers; owners allowed only intended nonrejected states; canonical blocks either direction, area/intention/cohort/verified/publication/pause/suspension and kill switch boundaries match existing visibility. Accepted/history connection adds no photo access. Authorize→hold provider read→block/Delete/pause→release must deny bytes. No candidate search quota consumed per photo. Assert content type/no-store/nosniff, fixed provider-origin fetch, no response provider URL and no image optimizer cache bypass.
- [ ] Implement shared visibility predicate preserving current candidate paging/live-connection exclusions; retain existing quotas at list/detail boundaries. Validate photo current public membership, state/revision and asset identity before and after fetch; bounded buffer plus second auth gate before response. Concurrent content changes yield safe404, not stale bytes. Owner deletion/read and restricted moderation scope remain independently checked.
- [ ] Attach allowed photo DTOs without spreading database/provider rows; existing name/avatar invitation snapshots remain unchanged. Run focused access/candidate/report tests and entire API suite. Commit access/enrichment and tests.

### Task 5: Audited human review, photo reports and durable cleanup worker

**Files:** Create `photos/photo-moderation.service.ts`, `photo-moderation.routes.ts`, `photo-jobs.service.ts`, `photo-worker.ts`, their integration tests and `services/scripts/discovery-photo-worker.mjs`; modify `discovery.schemas.ts`, `discovery-safety.service.ts`/routes, `discovery-moderation.service.ts`, `services/package.json` and additive report-reference migration if not in Task1.

**Interfaces:**
- `GET /api/discovery/moderation/photos?before=...`: authorized queue, state/reason/revision/audits, preview offered only via explicit moderator media endpoint.
- `POST /api/discovery/moderation/photos/:id/review`: `{action:"APPROVE"|"REJECT"|"REMOVE",reason,requestId,decisionRevision}`. Approve requires a completed scan and current review/appeal; a failed scan needs retry, never manual bypass.
- Existing `/reports` accepts PHOTO sourceId and creates exact immutable server-derived photo evidence with optional existing block behavior; retain source public version/asset, not arbitrary URLs/bytes in JSON. Add photo-reference fields that preserve evidence without breaking old text/profile reports.
- `runPhotoJobs({prisma,provider,now,batchSize}): Promise<{processed,failed}>` claims due jobs using durable leases/dedupe and bounded retries. CLI runs `--once` for an operator-managed cron; no public unauthenticated jobs route or unmanaged timers.

- [ ] Write RED tests: moderator authorization/verified email, rejected-owner preview denial, explicit preview scope, one appeal/decision, stale/concurrent/replayed reviews, safe provider override failure, completed-scan precondition, removal racing Publish, exact photo report source and reciprocal block, Delete preserving only open-report evidence, seven-day/30-day boundaries with multiple report resolutions, erased pointers preserving nonimage audit, unchanged text-report retention, worker lease crash/restart, expired retries and missing provider assets.
- [ ] Implement review/appeal state machine, per-decision audited idempotency and provider override as an external phase. Recheck deletion/revision before installing approvals; provider/manual discrepancies remain fail-closed. Human review never publishes/reopens consent. Moderator removal strips live references immediately without ending core relationships.
- [ ] Implement `RECONCILE` and `DESTROY` durable jobs. Reconcile checks existing deterministic asset without starting paid scan again, retries on bounded schedule, marks Check failed at24h. Expire pending/rejected at7days; destroy unreferenced assets unless valid appeal/report retention requires them. Multiple reports retain until latest necessary deadline; provider-required deletion overrides retention. Record irreversible erase events and redact image pointers. Treat already-missing provider bytes as successful deletion; failures appear in operator queue.
- [ ] Add CLI command `npm run discovery:photo-worker -- --once`; document cron once/minute and fail-closed launch prerequisite. Local tests inject a fake provider at the service boundary, not a production environment bypass. Run focused jobs/reports/moderation and full API suites, commit worker/safety and tests.

### Task 6: Compact photo editor, discovery gallery and moderator UI

**Files:** Create web `features/discovery/photos/{DiscoveryPhotoEditor,DiscoveryPhotoGallery,DiscoveryPhotoModeration}.tsx`, `discovery-photo.client.ts`, `discovery-photo.types.ts`, `discovery-photo.module.scss` and focused tests; modify `DiscoveryProfileEditor.tsx`, `DiscoveryProfilePage.tsx`, `DiscoveryCandidateList.tsx`, `DiscoverPage.tsx`, `DiscoveryModerationPage.tsx`, `DiscoverySafetyActions.tsx`, `discovery.types.ts`.

**Interfaces:** Owner resources include safe `OwnPhoto`s and photo capabilities; public cards include `PhotoCard[]`, empty for legacy/no photos. Upload client uses FormData without forcing JSON Content-Type, current owner header, revision and stable request ID; validates owner response before installation. Use existing discovery busy/dirty/confirmation machinery, not a second guard. Photo editor callbacks return latest own profile/revision; stage current text/selected order in the one authoritative editor draft.

- [ ] Write failing rendered/client tests and browser interactions: avatar-only still publishable; supported formats/limits shown; <=3 slots and first-main indicator; status-only rejected thumbnail; explicit File selection→Upload without auto-publish; accessible reorder/replace/remove-from-draft vs immediate Delete; stale revision/error preserves chosen file and text; save-first prompt before server-changing photo actions; pending double submit; object URL cleanup and account-change stale completion rejection.
- [ ] Implement photo upload/preview/status controls with 44px targets, accessible labels and Move earlier/later buttons. Preserve dirty text on background status refresh; offer Refresh when ready rather than revision-key remount. Confirm file action and expected revision; do not accept a stale account/revision response. Revoke object URLs when replaced/unmounted; failed file resets are explicit.
- [ ] Implement local-route plain authenticated images without shared optimization, primary thumbnail/gallery and avatar fallback. Never render rejected/pending peer media or provider URLs; avoid repeated requests on revoked image fallback. Add PHOTO report selection for currently authorized photos. Moderator list requires explicit Open preview, reviewed reason and confirmation; never auto-load rejected gallery thumbnails. State-specific copy avoids identity/safety guarantees.
- [ ] Run full web suite/types/lint/build and local synthetic browser tests for account switching, ordinary dirty navigation, avatar-only, upload/review/publish/Delete and error fallback at320/393/430/1280. Inspect screenshots. No real uploads. Commit UI and tests.

### Task 7: Whole-feature acceptance and operator handoff

**Files:** Extend `services/scripts/verify-discovery.mjs`, `verify-discovery-browser.mjs`, add photo fake-provider fixture under existing test support and `docs/discovery-photos-runbook.md`; update discovery runbook with photo-only kill switch, worker and references.

**Interfaces:** Existing explicit-local disposable DB runner remains the only automated DB writer; apply old fixtures, snapshot old tables, migrate additively and run full actual integration suites with zero gated skips. Synthetic multi-account browser fixture injects a safe test provider through server construction; actual image decoder, database, auth/session, HTTP multipart/media and state transitions remain real. Raw fixture images are benign generated pixels; risk decisions use canned provider response labels only.

- [ ] Assemble the cumulative real-API workflow from the preceding tasks' observed regressions: two accounts upload, pending denies peer bytes, approval stays private, explicit Publish shows photo, recipient reports exact image, block/pause/Delete kills new byte requests, moderator removes without ending existing space, account switch never installs old photo, failed provider leaves avatar-only discovery functional, and flag-off retains deletion/safety. Any new uncovered implementation defect first gets an observed failing regression; already-passing acceptance checks are recorded as validation, not invented RED evidence.
- [ ] Run the entire workflow against final production-built web plus actual local API/DB. Exercise concurrent quota/replay, worker restart/cleanup, legacy JSON and old-data exact snapshot preservation. Run API/web suites/types, lint/build and diff-check; explicitly disclose any existing baseline errors rather than call all type checks clean.
- [ ] Write operator instructions for `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, photo flag, chosen policy/add-on and worker invocation. Document seven-day/30-day retention, HEIC limitation, restricted audit/evidence scope, provider costs/policies and backup deletion caveats.
- [ ] Document an opt-in sandbox acceptance procedure (not automatic CI): separately approve benign provider writes, activate image moderation in a test account, verify anonymous original/derivative denial, authenticated private retrieval, completed/malformed/failing screening behavior, permissible rejected-preview/override availability and actual destruction/reconciliation. If any capability is missing, keep photos disabled; never loosen access. No real-person or explicit imagery needed. This task does not execute that procedure without separate authorization.
- [ ] Obtain a single independent whole-feature review under the selected execution skill; address Important/Critical findings through observed regressions and record deviations/rulings. Commit evidence/runbook only after actual checks. Hand off disabled locally; no push/migration/deployment or subscription implied.

## Self-review and execution handoff

Tasks cover every approved requirement: processing2; admission/slots/revisions3; byte privacy4; screening2/review+retention5; mobile/editor6; live capability gates and old-data safety7. The five Review Focus cases each have explicit tests. Only established dependencies flow between tasks; exact DTO/provider/mutation/job contracts are above. Task1 must not make incomplete Task2–5 routes live. Each task ends with its whole affected suite green, not only focused tests.

All work is one integrated photos project. Native execution (root implements tasks, one independent final review) preserves the user's earlier execution preference and avoids repeated setup contexts across tightly coupled state/schema/access work. The plan still requires user confirmation before implementation. Existing uncommitted header-alignment work is unrelated and stays separate.

Dependency/source checks during planning: [Fastify multipart official package](https://github.com/fastify/fastify-multipart/blob/main/package.json) declares Fastify5 compatibility; [Cloudinary official SDK](https://github.com/cloudinary/cloudinary_npm) supplies provider operations; [sharp install guide](https://sharp.pixelplumbing.com/install/) defines native/runtime prerequisites. Resolve exact stable compatible package versions at Task2 execution, not from stale cached search snippets.
