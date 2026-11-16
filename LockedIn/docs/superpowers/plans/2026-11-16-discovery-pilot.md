# Optional Discovery Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Do not begin implementation until the user reviews this plan and selects execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in, disabled-by-default discovery pilot with separate starter connections and an explicit mutual transition into LockedIn's existing shared workspace.

**Architecture:** Keep discovery records and private reflections separate from existing Relationship and IntentionResponse data. Reuse authentication, Prisma/PostgreSQL, notification delivery, avatars and confirmation dialogs. Existing connected people may explicitly explore starters, but promotion never overwrites or ends another ACTIVE relationship.

**Tech Stack:** Existing Next.js/React/Sass web app, Fastify/Zod API, Prisma/PostgreSQL, Vitest, local Chromium/Playwright acceptance scripts. No external service or paid account is needed for this avatar-only, manually selected-area pilot.

**Spec:** `LockedIn/docs/superpowers/specs/2026-11-16-discovery-pilot-design.md`, approved 2026-11-16.

## Global Constraints

- Feature disabled by default, plus a server-side account cohort allowlist. A frontend flag alone is insufficient.
- Adults self-attest 18+ and use a verified-email account. Self-attestation is not identity or age verification.
- Use existing avatars in the first code slice; photo uploads are deferred.
- Three concurrent pending/accepted starter connections per person. Pending invitations expire after seven days; deliberate decline creates a seven-day directional re-invitation pause, not a block disclosure.
- No Bluetooth scanning, actual device geolocation, background location access, exact distance, online/last-seen tracking, compatibility score, paid discovery, or public launch.
- Public fields are separate from private profile settings, email, reflections, and journey answers.
- Existing connected users may explicitly opt in; another full workspace remains unavailable while either participant has a different ACTIVE relationship. Discovery never calls the existing Leave shared space action.
- Pausing removes new discovery visibility/contact, not existing accepted connections or history. Disabling rollout/removing cohort eligibility must not strand historical access or safety controls.
- No automatic answer sharing, exclusivity, import of old answers, or automatic closure of other conversations.
- Additive migration only; no reset, no automatic production migration, no real-user test contact or notification. No push, merge, deployment or live enablement without the relevant user request.
- Preserve unrelated dirty work: `WorkspaceHeader.tsx`, `workspace-header.module.scss`, and `apps/web/scripts/check-header-alignment.mjs` currently contain the user's separate alignment fix. Do not stage them incidentally, revert them, or claim them as discovery work. Incorporate a compatible header change only when Task 7 requires it.

## Review Focus

1. Rollout disabled or cohort membership removed after a connection exists: history, private drafts and safety controls stay authorized; new discovery and new promotion stop (Tasks 1, 4, 5, 8).
2. Opposing invites, a shared third-account capacity race, and direct legacy invitation acceptance racing promotion: no cap bypass, duplicate pair, or second ACTIVE relationship (Tasks 3, 4, 9).
3. Switching accounts/connections while a request, autosave, notification refresh or browser Back is pending: no stale text, cross-account write, or draft loss (Tasks 7, 8, 9).
4. Block/unblock across discovery and legacy invitation surfaces, or moderation suspension racing readiness: no reopened consent, bypass contact, private reason disclosure, or ended core workspace (Tasks 4, 5, 6).
5. Existing data across migration/rollback and deterministic radar layout at 320px/reduced motion: old consent/history survives; public payloads contain no private fields or exact-position implication (Tasks 1, 2, 7, 9).

## Working conventions and verification

Repository root is the outer `LockedIn`; application directories below start with the nested `LockedIn/`. API commands run in `LockedIn/services`; web commands run in `LockedIn/apps/web`. The current app-managed worktree is already isolated on `codex/feature-slice-refactor-complete`; do not create/remove another worktree automatically.

Before Task 1, run baseline `npm test` in both apps and record results in this plan's own execution ledger. Tests with an integration gate are not counted as executed merely because `npm test` is green. Preserve existing `.superpowers/` workspaces belonging to other plans.

Every task follows RED -> GREEN -> full affected-app suite -> explicit task-file commit. Use explicit paths, not `git add .`. Where examples below specify assertions without complete fixture setup, use the real authenticated integration fixtures built in Task 1, not mocked service returns. Missing imports are not a substitute for the named red behavioral assertion.

API whole-suite command: `npm test`. API type check: `npx tsc --noEmit -p api/tsconfig.json`. Web: `npm test`, `npx tsc --noEmit`, `npm run lint`; production check `npm run build -- --webpack` on an owned/stopped preview. Record any pre-existing failures/warnings by name rather than suppressing them.

After Task 1, database verification command is `node scripts/verify-discovery.mjs`, with an explicit task-specific `DISCOVERY_TEST_ADMIN_URL` pointing to a local PostgreSQL administrator connection. That runner owns only a freshly generated disposable database. Browser verification later is `node scripts/verify-discovery.mjs --browser`, which uses the same guarded disposable database, synthetic accounts, an isolated API process and a separately owned web preview. Missing local runtime/database capability is reported, not silently skipped or redirected to the app database.

## Contract and file map

Create server-owned code in `services/api/src/features/discovery/`, with a narrow module per responsibility: configuration/policy, HTTP security, profiles/candidates, connections, response/reflection, promotion, safety/moderation, notifications, DTO views and feature route registration. Avoid one giant discovery service.

Create web code in `apps/web/src/features/discovery/` and thin app routes `/discover`, `/discover/profile`, `/connections`, `/connections/[connectionId]`, `/your-space`, `/discovery/moderation`. Keep all new Sass in feature-owned modules; do not edit the shared journey Sass cascade. Do not copy the standalone mockup's script into production.

Use server-owned Zod schemas and mirrored API DTO types, with explicit public allowlists. The existing shared package has no established runtime contracts to extend; do not introduce a monorepo/package restructuring for this feature.

The following boundaries are fixed for dependent tasks (implement their types in Task 1):

```ts
type DiscoveryContext = { userId: string; emailVerified: boolean };
type DiscoveryCapabilities = {
  canDiscover: boolean; canModerate: boolean; hasHistory: boolean;
  canReflect: boolean; currentRelationshipId: string | null;
};
type PublicDiscoveryProfile = {
  id: string; publicName: string; avatarPreset: string; bio: string;
  intention: "LONG_TERM" | "OPEN_TO_LONG_TERM";
  interests: string[]; pace: string | null; areaId: string;
};
type DiscoveryConnectionState =
  "PENDING" | "ACCEPTED" | "DECLINED" | "WITHDRAWN" |
  "EXPIRED" | "CLOSED" | "PROMOTED";
type DiscoveryFailure = { ok: false; status: number; error: string };
type DiscoverySuccess<T> = { ok: true; value: T };
type DiscoveryResult<T> = DiscoverySuccess<T> | DiscoveryFailure;
type DiscoveryProfileInput = Omit<PublicDiscoveryProfile, "id">;
type DiscoveryConnectionView = {
  id: string; state: DiscoveryConnectionState;
  topic: { key: string; text: string }; hello: string;
  inviter: "self" | "partner";
  senderSnapshot: { publicName: string; avatarPreset: string };
  partner: { publicName: string; avatarPreset: string };
  ownDraft: { text: string; revision: number } | null;
  sharedResponses: Array<{
    id: string; author: "self" | "partner"; text: string;
    version: number; sharedAt: string;
  }>;
  readiness: { mine: boolean; theirs: boolean; consentVersion: number };
  promotedRelationshipId: string | null;
  canAccept: boolean; canShare: boolean; canClose: boolean; canChooseBuild: boolean;
};
type PrivateReflectionView = { text: string; revision: number };
```

All successful discovery API responses use `{ ownerId, value: payload }` envelopes so clients can reject stale-account results and consistently unwrap `.value`. Services may use DiscoveryResult internally; route handlers map failures to the existing status + `{error}` convention rather than returning HTTP 200 with `ok:false`. Public profile objects themselves never contain an account's private settings, email, auth user ID, private drafts, location coordinates or full user records. `id` is an opaque discovery profile ID. Connection views expose the caller's own draft separately from immutable shared snapshots and safe partner metadata; they never serialize the other participant's draft or raw readiness/block/report database records.

New-entry eligibility means feature enabled + configured cohort + verified email + adulthood attestation + not suspended + explicit publication where required. Membership/history/safety authorization is a separate path requiring only the current authenticated owner's membership and specific read/safety rules. Pausing publication alone does not disable ongoing accepted conversations. Removed/suspended participants cannot start or share new contact; their authorized read-only history, private data access and safety actions remain available.

## Task 1: Additive persistence, fail-closed policy and an isolated verification harness

**Files**
- Modify `services/api/prisma/schema.prisma`, `services/api/src/config/env.ts`, `services/api/src/app.ts`.
- Create `services/api/prisma/migrations/20261116010000_discovery_pilot/migration.sql`.
- Create `services/api/src/features/discovery/discovery.types.ts`, `discovery.config.ts`, `discovery.policy.ts`, `discovery.http.ts`, `discovery.routes.ts`.
- Create `services/api/src/features/discovery/test/discovery.fixtures.ts`, `discovery.policy.spec.ts`, `discovery.migration.integration.spec.ts`, `discovery.http.spec.ts`.
- Create `services/scripts/verify-discovery.mjs`.

**Interfaces**
- `parseDiscoveryConfig(source: Record<string,string|undefined>): DiscoveryConfig`; config includes disabled-by-default `DISCOVERY_ENABLED`, explicit `DISCOVERY_PILOT_USER_IDS`, `DISCOVERY_MODERATOR_USER_IDS`, and an area catalog `DISCOVERY_AREAS_JSON` with `{id,label}` entries. No seeded live areas or people. Invalid/missing moderator/catalog configuration fails closed for new entry, not history.
- `getDiscoveryCapabilities(context: DiscoveryContext): Promise<DiscoveryCapabilities>`; existing ACTIVE relationships do not disable exploration. Anonymous requests remain 401.
- `registerDiscoveryRoutes(server: FastifyInstance): Promise<void>`; starts with authenticated GET `/api/discovery/me` returning `{ownerId,value:{...capabilities,areas,topics}}`. Register once from `app.ts`.
- `requireDiscoveryMutation(request, reply): Promise<DiscoveryContext|null>`: existing authenticated user, allowed Origin from APP_URL/local dev origins, required `X-Discovery-Owner` equal to session owner, strict body/params validation, private/no-store responses. Add only this header to existing CORS allowlist; do not change legacy routes' origin rules.

**Schema decisions**
- `DiscoveryProfile` links one owner to validated private draft JSON and a separate published snapshot JSON, indexed published area/intention, publication version/consent/attestation timestamps, pausedAt and suspendedAt. Draft saving never mutates the published snapshot.
- `DiscoveryConnection` represents one invitation attempt: sorted `userLowId/userHighId`, inviter, immutable question key/text, hello and sender public name/avatar snapshot, state, expiry/decline timestamps, per-side readiness version, connection consent version, optional unique linked Relationship ID. Both user foreign keys remain explicit. Add a PostgreSQL partial unique index for the sorted pair where state is PENDING or ACCEPTED; derive expiry under account locks before attempts can be replaced.
- `DiscoveryDraft` is unique by connection+owner with text and integer revision. `DiscoverySharedResponse` stores immutable versioned snapshots with a unique connection+owner+requestId for idempotency. Neither belongs to IntentionResponse.
- `PrivateReflection` is an owner-only standalone text/reflection revision, not linked to discovery publication or a relationship.
- Add restricted `DiscoveryReport`, `DiscoveryModerationAudit`, and account/action/window `DiscoveryThrottle` records. Reuse the existing canonical `InvitationBlock` records for cross-surface contact blocking; do not create competing block stores or change existing relationships when blocked.
- Add a nullable safe public-label snapshot to InvitationBlock for discovery-created blocks; default null preserves legacy records. A discovery block appearing in either block-management surface must not reveal the target's private auth name through the legacy list serializer. New discovery snapshots use the already-visible public name or a neutral Account label.
- Add nullable `Notification.discoveryConnectionId`; preserve all old rows/defaults. No required profile or publication row is backfilled for an existing user.

- [ ] **RED:** Write a live-server policy test for authenticated `/api/discovery/me`, disabled new-entry plus existing history access, and rejected wrong-owner/missing-Origin mutations. Assert response status/shape, not source text. Before registering routes, the positive me assertion fails 404 vs 200. Add a SQL schema test asserting discovery tables/index exist (zero before the migration).

  ```ts
  const response = await request(a, "GET", "/api/discovery/me");
  expect(response.statusCode).toBe(200); // 404 before feature registration
  expect(response.json()).toMatchObject({ ownerId: a.id, value: { canDiscover: false } });
  expect((await request(b, "GET", "/api/discovery/me")).json().ownerId).toBe(b.id);
  ```

  The Task 1 fixture `request(person, method, url, payload?)` uses that synthetic person's signed session cookie, trusted local Origin and matching owner header. Separate test-only Fastify handlers may exercise `requireDiscoveryMutation` before feature mutations exist; never add test endpoints to the production registrar.
- [ ] **Harness:** `verify-discovery.mjs` must require `DISCOVERY_TEST_ADMIN_URL` with local host, generate and validate a `lockedin_discovery_test_<random>` database name, and never load the application's DATABASE_URL as a fallback. Apply historical migrations through a temporary Prisma config, create representative old relationship/response/chapter/notification fixtures, then deploy the new migration and compare preserved IDs/content/consent. Remove only the generated test database in finally. Disable email credentials and mock email transport in all tests. Export `DISCOVERY_INTEGRATION=true`, `NOTIFICATIONS_INTEGRATION=true`, a test auth secret and the disposable DATABASE_URL only to owned child processes.
- [ ] **GREEN:** Implement schema/config/security/me endpoint. Generate Prisma from `services`: `npm run prisma:generate`. Deploy only inside the disposable test harness; never run migrate dev against the app URL. Do not install dependencies merely to bootstrap already installed packages.
- [ ] **Verify:** `npm test` then `node scripts/verify-discovery.mjs` with only Task 1 integration files selected by `DISCOVERY_TEST_FILES`; expected all policy/HTTP/preservation assertions pass, existing accounts remain unpublished and unchanged. Type check API; inspect migration SQL for destructive operations.
- [ ] **Commit:** Only Task 1 paths, message `feat: add isolated discovery pilot foundation`.

## Task 2: Private draft profiles, explicit publication and consent-filtered candidates

**Files**
- Create `services/api/src/features/discovery/discovery.schemas.ts`, `discovery-profile.service.ts`, `discovery-candidates.service.ts`, `discovery-profile.view.ts`, `discovery-profile.routes.ts`, `discovery-throttle.service.ts`.
- Modify `discovery.routes.ts`.
- Test `discovery-profile.integration.spec.ts`, `discovery-candidates.integration.spec.ts`, `discovery-throttle.spec.ts` in the feature directory.

**Interfaces**
- `getOwnDiscoveryProfile(actorId: string)`, `saveDiscoveryProfileDraft(actorId: string, input: DiscoveryProfileInput, revision: number)`, `publishDiscoveryProfile(actorId: string, draftRevision: number, adultAttested: true)`, `setDiscoveryPaused(actorId: string, paused: boolean)`.
- `listDiscoveryCandidates(actorId: string, areaId: string, cursor?: string)` returns at most 12 safe profiles, opaque next cursor and ownerId; no global count. `getVisibleDiscoveryProfile(actorId: string, profileId: string)` never falls back to a raw auth user.
- Routes GET/PUT `/api/discovery/profile`, POST `/api/discovery/profile/publish`, POST `/api/discovery/profile/visibility` (`{paused}`), GET `/api/discovery/candidates?areaId=...&before=...`, GET `/api/discovery/profiles/:profileId`.
- Validators: public name 1–60, bio <=500, <=5 unique interests each <=30, pace <=240, avatars restricted to existing presets; selected intention is LONG_TERM or OPEN_TO_LONG_TERM; area must be in the configured catalog. Normalize whitespace, reject unknown fields and invalid cursors; no DOB/photo URL/email/location input accepted.
- `consumeDiscoveryQuota(tx, actorId, action, now)` uses database counters under account locks, not process-local memory. Defaults: invite sends 5/hour and 10/day; reports 5/day; profile edits/publish 20/hour; candidate reads 30/minute; response/reflection draft saves 60/minute. Other state mutations 30/minute. Return 429 + Retry-After without counting idempotent replay as a new send/report.

- [ ] **RED:** Real owner saves a draft with bio `private draft marker`; another eligible user sees no profile. Publication exposes only the explicitly published snapshot. Saving a new draft does not change it. Assert no email, draft marker, activity preferences, coordinates or old journey answers in candidate/profile payloads. Cases: unverified/unattested/noncohort/suspended/self, unrelated areas/intentions, stale publication after pause, invalid area/cursor, request body unknown fields and concurrent quota increments.

  ```ts
  await request(a, "PUT", "/api/discovery/profile", { ...publicDraft, bio: "private draft marker", revision: 0 });
  expect((await request(b, "GET", "/api/discovery/candidates?areaId=pilot-city")).json().value.items).toEqual([]);
  // Publish explicitly, then save another draft: the visible snapshot remains the published one.
  ```
- [ ] **GREEN:** Implement explicit serializers and DB-backed quotas. Do not auto-fill/publish private name or email. Candidate reads may use a newly selected search area while published visibility stays tied to the owner's explicit published area. Both participant blocks and current connection state filter before pagination; never fetch private answers to rank profiles. Empty results remain empty.
- [ ] **Verify:** `node scripts/verify-discovery.mjs` selecting Task 1–2 files; expected profile isolation, pause and concurrent quota assertions pass. API `npm test` and type check.
- [ ] **Commit:** Task 2 files, message `feat: add opt-in discovery profiles and area browsing`.

## Task 3: Serialized invitation lifecycle with three-starter capacity

**Files**
- Create `services/api/src/features/discovery/discovery-locks.ts`, `discovery-connection.service.ts`, `discovery-connection.view.ts`, `discovery-connection.routes.ts`.
- Modify `discovery.routes.ts`, `discovery.schemas.ts`.
- Test `discovery-connection.integration.spec.ts`, `discovery-capacity.integration.spec.ts`.

**Interfaces**
- `sendDiscoveryInvitation(actorId, {targetProfileId, topicKey, hello, requestId})`, `respondDiscoveryInvitation(actorId, connectionId, "accept"|"decline")`, `withdrawDiscoveryInvitation(actorId, connectionId)`, `closeDiscoveryConnection(actorId, connectionId)`, `listDiscoveryConnections(actorId, before?)`, `getDiscoveryConnection(actorId, connectionId)` return DiscoveryResult DTOs.
- Topic catalog keys: `support`, `commitment`, `communication`; freeze question text in the invitation. Hello <=280 plain-text characters. Request ID is a UUID scoped to sender/attempt.
- GET/POST `/api/discovery/connections`; GET `/api/discovery/connections/:id`; POST `/:id/accept`, `/decline`, `/withdraw`, `/close`. GETs permit authorized history even with rollout disabled; write gates distinguish safety from new-contact eligibility.
- Locks: fetch pair IDs without trusting client identities; lock auth user rows in sorted order using the existing invitation lock convention, then affected legacy invitation rows if needed, then connection rows in sorted order. Recheck state/blocks/cap/consent inside the transaction. All discovery admission, pause, close, sharing and readiness paths obey this order.

- [ ] **RED:** A→B and B→A concurrent sends produce one pending pair, never two; three pending/accepted starters block the fourth for both inviter and invitee. Two other senders racing for an invitee's final slot cannot exceed three. Acceptance and close/withdraw races leave one legal terminal state. Deliberate decline blocks A→B for seven days without extending on retry, but does not block B→A; expiry/withdrawal do not create decline cooldown. Existing ACTIVE deep spaces do not block starter creation.

  ```ts
  await Promise.all([send(a, b), send(b, a)]);
  expect(await db.discoveryConnection.count({ where: {
    userLowId: [a.id, b.id].sort()[0], userHighId: [a.id, b.id].sort()[1], state: "PENDING"
  } })).toBe(1);
  ```

  Define `send(from,to)` in integration fixtures using the real POST endpoint and independent UUID request IDs, with explicit published profile/attestation setup. `publicDraft` is a literal test profile for configured area `pilot-city`, not a production seed.
- [ ] **GREEN:** Persist immutable invitation snapshots and canonical account pair. Expiry uses `expiresAt <= now` consistently for cap, lists and acceptance. Preserve closed attempts as read-only history; retries return the attempt's status rather than reopening it. New attempt after allowable closure gets a new connection ID and no copied readiness/answers. Snapshot current published identity only; mutable profile edits cannot change the invitation's chosen question/hello.
- [ ] **Verify:** Task 1–3 real DB files via runner, then API suite/types. Expected unique/cap/retry/cooldown and profile-edit tests pass. No actual Relationship is created by acceptance.
- [ ] **Commit:** Task 3 files, message `feat: add separate discovery starter invitations`.

## Task 4: Owner-only drafts/reflections, explicit sharing and mutual promotion

**Files**
- Create `services/api/src/features/discovery/discovery-response.service.ts`, `discovery-reflection.service.ts`, `discovery-promotion.service.ts`, `discovery-response.routes.ts`.
- Modify `discovery-connection.view.ts`, `discovery.schemas.ts`, `discovery.routes.ts`.
- Test `discovery-privacy.integration.spec.ts`, `discovery-promotion.integration.spec.ts`, `discovery-reflection.integration.spec.ts`.

**Interfaces**
- `saveStarterDraft(actorId, connectionId, {text, revision})`; `shareStarterDraft(actorId, connectionId, {draftRevision, requestId})` copies the checked server draft to a new immutable shared version; no client-supplied partner response or shared body is trusted.
- `getPrivateReflection(actorId)` and `savePrivateReflection(actorId, {text, revision})`; text <=4000, no relationship or profile foreign key. Starter text <=2000. Optimistic revision conflict returns 409 and preserves the server version; it never silently overwrites a newer edit.
- `setBuildReadiness(actorId, connectionId, {ready, consentVersion})`: one side alone creates no Relationship. Success includes promotedRelationshipId only after both current choices commit, or when replaying that same successful promotion.
- PUT `/api/discovery/connections/:id/draft`, POST `/:id/share`, POST `/:id/readiness`; GET/PUT `/api/discovery/reflection`.

- [ ] **RED:** A's unsent draft is absent from B's view and notifications; editing it after Share leaves the previous shared snapshot unchanged. Share stale revision fails; repeated same request produces one snapshot. C cannot read/update any A/B content by guessed IDs. Reflection is owner-only with no appearance in a profile, conversation or journey. Rollout removal preserves A's history/private reflection/safety reads, but stops new contact and promotion.
- [ ] **RED promotion:** one ready → zero new Relationships; two ready → exactly one correct pair. Concurrent retries and legacy `acceptInvitation` against a third party leave at most one ACTIVE relationship per user. With an existing ACTIVE space, return a neutral unavailable result; do not end, modify or reveal the other relationship. Withdrawal/close invalidates readiness. A stale readiness consentVersion cannot revive consent.

  ```ts
  await request(a, "POST", `/api/discovery/connections/${connectionId}/readiness`, { ready: true, consentVersion: 1 });
  expect(await db.relationship.count({ where: { members: { some: { userId: a.id } } } })).toBe(0);
  const result = await request(b, "POST", `/api/discovery/connections/${connectionId}/readiness`, { ready: true, consentVersion: 1 });
  expect(result.json().value.promotedRelationshipId).toEqual(expect.any(String));
  expect(await db.relationship.count({ where: { members: { some: { userId: a.id } } } })).toBe(1);
  ```

  Keep service results as DiscoveryResult; route success DTOs are `{ownerId,value}`, without leaking service failure results as successful HTTP responses. The client/types must match this envelope.
- [ ] **GREEN:** Apply account/connection lock order, current feature/cohort/verification/suspension/block checks for new writes and promotion. Read-only history and own drafts remain separately authorized. Promotion state is PROMOTED with a unique linked Relationship; it no longer consumes a starter slot. Do not allow a new starter with the same pair while that linked relationship is ACTIVE. Shared starter history stays in discovery, not imported into IntentionResponse/Atlas. No automatic discovery pause or closure of other connections.
- [ ] **Verify:** Runner Task 1–4 integrations plus existing invitation boundaries and overview tests; API suite/types. Compare old active shared-space fixture before/after failed promotion byte-for-byte on selected fields. Draft saves do not emit partner-visible activity.
- [ ] **Commit:** Task 4 files, message `feat: add private starter responses and mutual build transition`.

## Task 5: Cross-surface blocking, reporting and restricted moderation

**Files**
- Create `services/api/src/features/discovery/discovery-safety.service.ts`, `discovery-moderation.service.ts`, `discovery-safety.routes.ts`.
- Modify `features/invitations/invitation-blocks.service.ts`, discovery route/view/policy files as needed.
- Test `discovery-safety.integration.spec.ts`, `discovery-moderation.integration.spec.ts`, extend existing `invitation-boundaries.integration.spec.ts` narrowly.

**Interfaces**
- `blockDiscoveryContact(actorId, {profileId?|connectionId?})`, `listDiscoveryBlocks(actorId, before?)`, `unblockDiscoveryContact(actorId, blockId)` reuse canonical InvitationBlock ownership and two-way restrictions. `closeDiscoveryContactUnderLock(tx, userA, userB)` closes pending/accepted starters and clears readiness, never Relationship records.
- `reportDiscoveryContent(actorId, {sourceType, sourceId, reason, detail?, requestId, blockAlso?})` only snapshots public profile data or a shared response/invitation the reporter is currently authorized to see. It cannot capture a partner's private draft or accept arbitrary fabricated evidence JSON. Detail <=1000; reasons `HARASSMENT`, `IMPERSONATION`, `SPAM`, `OTHER`.
- `listDiscoveryReports(moderatorId, before?)`; `reviewDiscoveryReport(moderatorId, reportId, {action:"DISMISS"|"SUSPEND", requestId})`; `restoreDiscoveryAccount(moderatorId, profileId, requestId)` creates an audit entry and never reopens connections/readiness.
- POST `/api/discovery/blocks`, GET `/api/discovery/blocks`, DELETE `/api/discovery/blocks/:id`, POST `/api/discovery/reports`; restricted GET `/api/discovery/moderation/reports`, POST `/api/discovery/moderation/reports/:id/review`, POST `/api/discovery/moderation/profiles/:id/restore`.

- [ ] **RED:** Discovery block also prevents direct legacy invitations; legacy invitation block also stops discovery candidates, writes and promotion. Block+accept/promotion races stop further contact while leaving any already-created deeper Relationship intact. Unblocking one direction does not remove the other's block or revive a connection/readiness. Reporter status/reason is never exposed to the reported user. Forged evidence IDs and nonmember report IDs fail 404. Ordinary cohort members cannot list reports, see evidence, suspend, restore or audit moderators.

  ```ts
  expect((await request(a, "GET", "/api/discovery/moderation/reports")).statusCode).toBe(403);
  expect((await request(moderator, "GET", "/api/discovery/moderation/reports")).statusCode).toBe(200);
  expect((await request(c, "GET", `/api/discovery/connections/${connectionId}`)).statusCode).toBe(404);
  ```
- [ ] **GREEN:** Add one shared canonical restriction hook, not two block stores. Legacy block transaction closes applicable discovery rows and clears readiness even when discovery rollout is off. Existing legacy unblock does not restore closed rows. Keep prior decline timestamps. Close/block/suspension UI DTOs use neutral unavailable status to the other party; only the block owner can see their own block setting.
- [ ] **GREEN privacy:** populate the safe label for discovery-created canonical blocks and teach the legacy block list serializer to use it when present. Test that a stranger whose public name differs from private auth name cannot learn the private name via either block list. Do not widen any legacy block owner authorization.
- [ ] **GREEN moderation:** Review/restore requires authenticated configured moderator, trusted mutation origin/owner and an audit record. No email campaign or public notification. Suspension closes new-contact eligibility and invalidates readiness; preserve authorized read-only history/safety/owner drafts. Avoid locking a target user then updating arbitrary peers' user rows: metadata invalidation reads connection updatedAt rather than introducing reverse-order peer account writes.
- [ ] **Verify:** Full runner through Task 5 plus legacy boundaries suite; API tests/types. Expected no block bypass, no draft evidence, no private moderator data leakage and no core relationship end. With no moderator IDs configured, admission remains disabled.
- [ ] **Commit:** Task 5 files, message `feat: add discovery safety and moderation controls`.

## Task 6: Preference-aware notifications and exact connection destinations

**Files**
- Create `services/api/src/features/discovery/discovery-notifications.service.ts`, test `discovery-notifications.integration.spec.ts`.
- Modify `features/notifications/notification.tasks.ts`, `notification.repository.ts`, `notification.catalog.ts`; integrate event calls in discovery mutations.
- Modify web `features/notifications/notification.types.ts`, `notification.navigation.ts`, `notification.navigation.spec.ts`, and `features/journey/JourneyWorkspace.tsx` only for the external-route notification branch.

**Interfaces**
- Extend NotificationTask compatibly to support nullable relationshipId and optional discoveryConnectionId; old derivation output remains unchanged.
- `persistDiscoveryTask(tx, connectionId, recipientId, kind, occurrenceKey)` and `resolveDiscoveryTasks(tx, connectionId, kinds?)` use current preference/suppression rules and stable per-attempt/shared-version/readiness-version event keys.
- Kinds: DISCOVERY_INVITED, DISCOVERY_ACCEPTED, DISCOVERY_RESPONSE_SHARED, DISCOVERY_BUILD_READY, DISCOVERY_PROMOTED; view `discovery`, entityId connection ID, destination `/connections/:id`. No private response body, draft content, block reason or discovery publication event appears in copy.
- Existing list/read/fingerprint APIs include only recipient-owned discovery tasks authorized by membership; closed/unavailable tasks are safely resolved. Append caller-owned discovery connection/publication metadata changes to fingerprint so quiet cross-process SSE invalidation works without a new unread alert. Never update partner-visible connection timestamps or fingerprints for private draft edits.

- [ ] **RED:** preference-off recipients get no visible new tasks, but quiet invalidation still arrives; reenabling preferences does not backfill suppressed tasks. Replayed acceptance/share/readiness creates one occurrence. Decline/close/block/report produce no new visible alert. Cross-process fingerprint changes for close/share, not partner draft typing. Guessed/read notification IDs remain owner-only; disabling rollout does not strand history.
- [ ] **RED web:** `notificationDestination({view:"discovery",entityId:"connection-id",wordKey:null})` equals `/connections/connection-id`; all legacy destinations stay unchanged. A discovery notification clicked in JourneyWorkspace must use `router.push` after the existing dirty/busy guard, before legacy overview/context logic—not `navigateWorkspaceUrl` for a different Next route.
- [ ] **GREEN:** Transactionally record tasks with writes, publish committed broker invalidations afterward. Update eligible/unread queries without broadening old authorization. Do not require a first active relationship to authorize a discovery task. Keep legacy unread counts/preferences correct.
- [ ] **Verify:** API runner includes notification integration, API suite/types, web `npm test`/types. Assertions cover stale tasks and exact destination routing without causing an account write or sending email.
- [ ] **Commit:** Only Task 6 paths/hunks, message `feat: integrate isolated discovery notifications`.

## Task 7: Authenticated discovery shell, publication editor and accessible radar

**Files**
- Create thin `apps/web/src/app/discover/page.tsx`, `app/discover/profile/page.tsx`.
- Create `features/discovery/discovery.types.ts`, `discovery.client.ts`, `use-discovery-resource.ts`, `use-discovery-navigation.ts`, `DiscoveryShell.tsx`, `DiscoverPage.tsx`, `DiscoveryProfileEditor.tsx`, `NearbyRadar.tsx`, `DiscoveryCandidateList.tsx`, `discovery.module.scss`, `discovery-navigation.ts`.
- Modify `features/journey/components/WorkspaceHeader.tsx`, `MobileAccountMenu.tsx`, and `JourneyWorkspace.tsx` only to add an optional, guarded discovery entry; preserve the already-dirty alignment changes. Add feature-owned styling for any desktop entry, not the frozen journey cascade.
- If needed, create generic `features/navigation/use-leave-guard.ts`, `history-bootstrap.ts` by parameterizing the current profile-only guard; update profile imports/layout narrowly and retain all existing history tests. Do not run two competing history bootstraps.
- Test `NearbyRadar.spec.tsx`, `DiscoveryProfileEditor.spec.tsx`, `discovery-navigation.spec.ts`, `discovery-resource.spec.ts`, and extend relevant header/history tests.

**Interfaces**
- `discoveryRequest<T>(userId: string, path: string, init?: RequestInit): Promise<T>` uses journeyRequest for `{ownerId,value:T}` transport, adds required owner header to mutations, no-store on reads, rejects ownerId mismatch, and returns only the checked `.value`.
- `useDiscoveryResource<T>(userId, resourceKey, load)` aborts obsolete requests and hides old-owner/key data immediately; keyed page boundaries include authenticated owner ID and connection ID. A late result may not revive old data.
- `useDiscoveryNavigation(dirty, currentPath)` exposes guarded `leave(path)` and ConfirmDialog props for links, sign out, notification jumps and browser traversal. Generalizing profile guard retains original profile behavior and bootstrap positions.
- `DiscoveryShell` reuses current header/notifications and supplies optional navigation between My LockedIn, Discover, Connections and Your space. Disabled/noncohort accounts get no new-entry UI; existing history gets connections/private-space access. The Journey page keeps its current first destination and must not be remounted just to add an entry.
- Radar/list share the identical server candidate array and selection. Stable layout uses candidate IDs and ordinal illustrative slots, never coordinates/distance. The primary candidate's Meet/Invite action is available near the top; list is fully keyboard accessible. No infinite scan animation; reduced motion disables any user-triggered decorative sweep.

- [ ] **RED:** editor draft/save is visibly distinct from final Publish; publication preview contains only chosen public fields, not private account profile. Empty candidates do not show mock people. Radar and accessible list select the same profile; copy explicitly says not exact position/distance. Disabled account has no discover entry but existing connection history link remains. Unknown returnTo/notification routes cannot navigate off-origin.
- [ ] **GREEN:** Build compact cream/plum/sage UI from existing design tokens and approved concept. Manual area catalog only; no navigator.geolocation, Bluetooth, tracking, or photo upload controls. Account/header entry may use one desktop Explore disclosure and mobile account-menu links rather than adding a crowded row of buttons. All new links obey draft guards.
- [ ] **GREEN:** Restrict public profile deep links through current server eligibility; no stale cached-card contact. Saving changes requires explicit publish before discovery sees new text. Surface 401, unavailable, conflict, empty, suspended and paused states without exposing private reasons about another person.
- [ ] **Verify:** web `npm test`, types and lint. Extend browser fixture checks in Task 9 for 320/393/430/1280/1920, desktop scrollbar geometry, menu coordination and profile Back/Keep editing. Existing header alignment script must still pass if touched.
- [ ] **Commit:** Only new Task 7 files and discovery-specific hunks in overlapping files. Do not bundle the unrelated alignment fix accidentally. Message `feat: add opt-in mobile discovery browsing`.

## Task 8: Connections, guarded starter workspace, private reflection and moderation screens

**Files**
- Create thin `app/connections/page.tsx`, `app/connections/[connectionId]/page.tsx`, `app/your-space/page.tsx`, `app/discovery/moderation/page.tsx`.
- Create `features/discovery/ConnectionsPage.tsx`, `ConnectionPage.tsx`, `StarterInvitation.tsx`, `StarterConversation.tsx`, `BuildTogetherPanel.tsx`, `DiscoverySafetyActions.tsx`, `PrivateReflectionPage.tsx`, `DiscoveryModerationPage.tsx` and focused component/state tests.
- Extend discovery client/types/hooks/styles from Task 7; reuse existing ConfirmDialog and NotificationBell rather than introducing another account/notification system.

**Interfaces**
- Connections list uses precise connection IDs and server statuses, not first relationship selection. Accepted workspace loads own draft plus immutable shared snapshots; every mutation includes current revision/consentVersion and owner ID.
- Invite form sends selected catalog topic and optional hello with a stable per-submit requestId; retries reuse it. Acceptance opens the same connection, not /journey and not automatic readiness.
- BuildTogetherPanel shows explicit intent and no-exclusivity/no-old-answer-import copy. One-sided readiness is revocable; unavailable because of an active space shows a neutral explanation and a link back to the user's own existing space. It never calls Leave or prompts leaving someone else's relationship.
- Report/block/close are separate deliberate controls, with explicit consequences. A report may optionally also block; receipt does not promise an unstaffed response time. Own block management permits owner-only unblock without reopening threads.
- Private reflection uses the standalone owner store. Moderation route is protected on server and client, with no default operator account or public report evidence.

- [ ] **RED:** switch A/B/C connections with delayed responses, draft saves and SSE refreshes; no previous partner's draft or stale owner's form flashes. Sign out/account switch clears state. A stale mutation bound to old owner returns conflict and does not save under the new account. Share is a separate action from Save; private drafts do not appear in partner UI until explicitly shared.
- [ ] **RED:** unread/notification deep link opens exact invitation/conversation without scrolling past unrelated content. Pending invite offers other discovery/private-space paths. Expired/declined/closed/blocked thread cannot accept/share/build via stale buttons. Closing and blocking while dirty requires a deliberate choice and does not silently submit or share. Moderator evidence is inaccessible to a normal user or guessed URL.
- [ ] **GREEN:** Implement compact status-first mobile components and guard all traversal paths. Optimistic UI may show a local busy state, not acceptance/promotion success before the server confirms. Do not auto-share on navigation or infer consent from profile/invitation acceptance. Two-way mutual promotion navigates only to the server-linked /journey space after a final owner check.
- [ ] **Verify:** web tests/types/lint, server runner through Task 6, plus Task 9 browser checks. Expected profile guard regression, owner/private isolation, empty/error states and moderator authorization pass. Drafts survive Keep editing, ordinary refreshes, and switching away after a confirmed server save; no promise of offline storage is made.
- [ ] **Commit:** Task 8 files, message `feat: add private discovery connections and build choices`.

## Task 9: Real multi-account acceptance, migration preservation and operator handoff

**Files**
- Create `services/scripts/verify-discovery-browser.mjs`, `apps/web/scripts/check-discovery-layout.mjs`, and `docs/discovery-pilot-runbook.md`.
- Complete integration fixtures/runner from Task 1, operator documentation, and this plan's verification record. No production flags/accounts are changed by these scripts.

**Interfaces**
- Browser runner accepts a Playwright module via `LOCKEDIN_PLAYWRIGHT_MODULE` or an installed playwright module; no hard-coded user runtime path in committed code. Own processes bind free local ports, override API_PROXY_URL and NEXT_PUBLIC_API_URL for isolation, and are stopped by recorded process handles only. Never kill an unrelated user preview.
- `verify-discovery.mjs --browser` provisions only synthetic verified users/sessions in its disposable DB, plus one explicit test moderator and one existing relationship fixture. Real fixture API requests exercise write authorization; mock only email delivery, not feature business logic. All `.test` identities and publication are local to that disposable DB. If a runtime dependency is absent, fail with a clear setup message, not a passing skip.

- [ ] **Acceptance assertions:** A publishes a profile and area; B sees only public data; C cannot access A/B draft or report IDs. Existing connected D opts in without altering their old relationship; promotion D→A is blocked while D's old space stays ACTIVE. A invites B and C separately; B accepts; C declines; no acceptance creates a deep space. B cannot see A's unsent draft; explicit share is confined to A/B. Standalone reflection never appears in either connection. Both A/B click current Build choices and exactly one relationship with correct membership appears. Keep the other attempt's history unchanged.
- [ ] **Race/security assertions:** run actual simultaneous requests for cap/opposing invite/readiness/block/legacy acceptance; reuse request IDs; exercise cooldown and seven-day expiry boundaries through controlled fixture timestamps; mutate stale consent revisions; verify operator-only report evidence and suspension. With feature disabled after data exists, new browsing/contact/promotion stop while authorized history/private reflection/report/block/close remain reachable. No real GPS/Bluetooth or external email is invoked.
- [ ] **Migration assertions:** baseline old fixture state equals its state after the additive migration and failed promotion. Old direct invite/reveal/Atlas/roadmap flows pass. Do not claim full migration safety from mock snapshots alone. Document operator backup/recovery prerequisites without running backup/restore against production.
- [ ] **Layout assertions:** 320/393/430px and desktop, 44px effective touch targets, no overflow or exact-location implication; deterministic radar/list agreement and reduced motion; invite/accept primary actions near the top; browser Back/forward dirty guard and account switch; legacy header alignment unaffected. Inspect screenshots of each primary phone state.
- [ ] **Run full verification:** API and web `npm test`, API/web type checks, web lint, web production webpack build, complete isolated database runner, real browser runner. Record actual counts, failures, skips and pre-existing warnings. Do not equate default gated test skips with a complete integration pass.
- [ ] **Operator handoff:** document flags/catalog/cohort/moderator setup, adult attestation limits, public field consent, immutable invitation snapshots, history/block/report behavior, report coverage requirement, rollout disable/rollback without data loss, and separate approval needed before launch. Leave DISCOVERY_ENABLED false and do not insert real cohort users.
- [ ] **Final review:** request one fresh whole-change review if executing natively, or the required per-task/final reviews if subagent-driven. Address confirmed important issues through a failing regression and one fix pass. Do not push, merge, deploy, or enable discovery without the matching user instruction.
- [ ] **Commit:** Verification scripts/runbook and final documentation only, message `test: verify discovery isolation and pilot rollout safety`.

## Plan self-review and handoff

Coverage map: opt-in/adult/public privacy/manual area → Tasks 1–2 and 7; starter lifecycle/caps → Task 3; owner drafts/reflection/mutual build → Task 4 and 8; safety/moderation → Task 5 and 8; preference-aware exact notifications → Task 6; compact mobile/dirty/account guards → Tasks 7–9; additive preservation/default-off/operator readiness → Tasks 1 and 9. Each Review Focus entry has an owning red assertion and real verification path above.

Dependency scan: Task 2 consumes Task 1 config/HTTP/DTO conventions; Task 3 consumes published profile admission and quotas; Task 4 consumes canonical connection locking/state; Task 5 reuses the same canonical contact block and lock order; Task 6 extends existing nullable notification context without changing legacy output; Tasks 7–8 consume the same owner-stamped responses and stable context IDs. Task 9 verifies these interfaces with a real disposable DB. No parallel implementations may edit shared schema or registrars concurrently without a controller-owned integration step.

Self-review corrections: included mandatory standalone reflection, cross-surface block behavior, rollout-off history authorization, a non-live test DB source, profile draft/publication separation, exact cross-route notification navigation, and preservation of the separate header alignment diff. All new successful responses use `{ownerId,value}`; the request helper checks ownerId and unwraps `.value`. No flattened-read/wrapped-write inconsistency is left for the implementer to guess.

The first handoff is an implementation plan, not a completed feature. The feature remains absent from the app until execution, independent review and verification are complete. Live enablement is a separate decision after the small pilot's operator prerequisites are met.
