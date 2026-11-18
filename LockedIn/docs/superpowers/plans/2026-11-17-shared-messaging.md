# Shared Messaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give directly invited partners chat using the same safe messaging system and UI as Discovery, without losing existing messages.

**Architecture:** Introduce neutral conversation identity and one message service over the existing message table. Source adapters retain Discovery policy while direct relationships use membership authorization. Extract the current chat UI and keep old API paths as compatibility adapters during an additive rollout.

**Tech Stack:** TypeScript, Fastify, Prisma/PostgreSQL, Next.js/React, SCSS modules, Vitest; existing notification broker/SSE and polling.

**Spec:** `LockedIn/docs/superpowers/specs/2026-11-17-shared-messaging-design.md` (approved by user).

## Global Constraints

- “Neither person needs Discovery enrollment or a published Discovery profile, and there is no additional lock-in step.”
- “Existing messages must remain intact.”
- “There must be no dual message store or copying that can duplicate a send.”
- “Unblocking or restoring an account must not silently reopen it.”
- “Unsent text remains local and is not persisted as a private draft.”
- “No new WebSocket infrastructure or multi-instance delivery guarantees in this scope.”
- “No database deletions are authorized or needed.”
- Preserve 30-message pages, 2,000-character limit, UUID request idempotency, report menu, bounded scroll and existing Discovery publication/privacy rules.
- No production database tests, auto-push, contract migration, new dependencies, full inbox or unrelated Discovery rewrite.

## Review Focus

1. Old clients sending while backfill runs: one stable message, same receipt, no missing history (Tasks 1–2).
2. Closed/legacy promoted relationships: empty chat only where explicitly permitted, never revived safety closures or exposed restricted transcripts (Tasks 1, 3).
3. Direct acceptance racing promotion/block/leave: one canonical conversation and no safety bypass or deadlock (Tasks 3–4).
4. Closed-chat reports: received-message evidence still reportable, with no general transcript access or partner-state disclosure (Task 4).
5. Account switching and refresh while reading older messages: no wrong-account send, draft leakage or scroll jump (Task 5).

## Execution conventions and file map

Paths are repository-relative from the outer checkout. `API` below means `LockedIn/services/api/src/features`; `WEB` means `LockedIn/apps/web/src/features`.

API new `messaging/` modules:
- `messaging.types.ts`: DTOs/results, no database queries.
- `messaging.config.ts`: rollout flag `SHARED_MESSAGING_ENABLED`, false by default; existing Discovery chat flag continues to govern old Discovery exposure.
- `messaging-conversation.service.ts`: conversation creation, association and source transitions under caller-owned locks.
- `messaging-access.service.ts`: locked conversation access and source-specific policy.
- `messaging-message.service.ts`: shared read/send, idempotency and postcommit effects.
- `messaging.routes.ts`: neutral HTTP routes and registration.
- `messaging-safety.service.ts`: message evidence, report/block and durable close helpers.
- `messaging-backfill.service.ts`: rerunnable source-aware association, consumed by deployment script.
- `test/*.integration.spec.ts`: tests named below; retain `DISCOVERY_INTEGRATION` local harness gating initially.

Shared HTTP primitives: create `LockedIn/services/api/src/lib/account-mutation-http.ts` for trusted origin, authenticated owner binding and strict request schemas; Discovery adapts without changing its header/error contract. Direct messaging uses `x-messaging-owner`.

Web new `messaging/`: `Chat.tsx`, `ChatPage.tsx`, `MessageSafetyActions.tsx`, `messaging.client.ts`, `messaging.types.ts`, `use-chat-refresh.ts`, `chat.module.scss`, `chat-state.ts` and colocated tests. Move reusable message actions rather than duplicate them. Discovery wrappers supply only their optional opening context/profile behavior.

At execution start read the spec and current instructions, use worktree skill to establish isolation, inspect dirty files and baseline tests. Preserve unrelated `kickbacks.vsix`. Mark steps only with actual command evidence. Commands below run from outer checkout unless a working directory is specified.

Local DB test runner: from `LockedIn/services`, with explicitly validated localhost `DISCOVERY_TEST_ADMIN_URL`, run `node scripts/verify-discovery.mjs`; set `DISCOVERY_TEST_FILES` to comma-separated test paths to target a task. It creates/drops only its unique owned disposable database. Never substitute application/Render credentials. Existing `.superpowers/sdd/2026-11-17-mutual-lock-in/run-local-tests.mjs` is an optional local wrapper, not a new runtime dependency.

---

### Task 1: Add conversation identity and safe rerunnable backfill

**Files:** modify `LockedIn/services/api/prisma/schema.prisma`; create `LockedIn/services/api/prisma/migrations/20261118002000_shared_messaging/migration.sql`, `API/messaging/messaging.types.ts`, `messaging.config.ts`, `messaging-conversation.service.ts`, `messaging-backfill.service.ts`, `API/messaging/test/messaging-migration.integration.spec.ts`, `LockedIn/services/scripts/backfill-messaging.ts`; update `LockedIn/services/scripts/verify-discovery.mjs` only for shared-migration fixtures.

**Interfaces:**
- Prisma `ChatConversation`: UUID id; ordered `userLowId/userHighId`; `origin: DISCOVERY | DIRECT_INVITATION | LEGACY_RELATIONSHIP`; `accessMode: DISCOVERY | RELATIONSHIP`; optional unique `discoveryConnectionId`, `relationshipId`, `directInvitationId`; nullable `closedAt/closureReason`; timestamps. Add relational constraints and participant indexes; never global pair uniqueness.
- Retain Prisma `DiscoveryMessage` delegate/table for compatibility; add nullable `conversationId`, make legacy `connectionId` nullable, retain old unique index and add unique `(conversationId, senderId, requestId)` plus `(conversationId, sequence)` index. No table copy/sequence reset.
- `DiscoveryReport.conversationId?: string` is additive; preserve existing fields and queue.
- `ensureDiscoveryConversation(tx, connectionId): Promise<ChatConversation>`; `ensureRelationshipConversation(tx, relationshipId): Promise<ChatConversation>` require ordered account locks; never clear closure. Both are rerunnable.
- `backfillMessaging(tx, {afterId?: string, limit: number}): Promise<{nextCursor: string|null; associated: number; created: number}>`; bounded repeatable batches. Script accepts `--check` for read-only counts and `--apply` for writes; never logs messages, tokens or connection strings.

- [ ] **Step 1: Write migration/backfill fixture tests.** Assertions include:
  ```ts
  expect(after.messages).toEqual(before.messages); // IDs, sequence, text, sender, request, timestamps
  expect(after.reports).toEqual(before.reports); // original fields/evidence unchanged
  expect(await runBackfillTwice()).toMatchObject({duplicateConversations: 0, duplicateMessages: 0});
  expect(explicitLockedClosed.accessMode).toBe('DISCOVERY');
  expect(explicitLockedClosed.closedAt).not.toBeNull();
  expect(legacyEmpty.messages).toHaveLength(0);
  ```
  Include plain active direct relationships, legacy promoted no lock timestamp, explicit eligible/ineligible lock-ins, current blocks, closed contact, ended relationships, and old-version message insert after initial backfill. Restricted legacy transcript stays solely in its original Discovery conversation; blocked fallback starts durably closed.
- [ ] **Step 2: Run migration test through disposable runner.** Expected RED for missing conversation schema/association; record failure, not setup errors.
- [ ] **Step 3: Implement additive migration, helpers and script.** Initial SQL adds compatible columns/tables only; backfill runs after upgraded writers, not as a historical transcript rewrite. Use connection UUID as deterministic conversation UUID when associated with Discovery; direct/legacy relationship-only conversations use relationship UUID. On conflict verify matching source/participants, otherwise fail safely. Explicit Discovery relationship always keeps source and restrictions. Legacy fallback does not attach restricted Discovery connection. Bind old messages only by their exact connection ID, preserving data. Keep flag false.
- [ ] **Step 4: Generate Prisma client and rerun tests.** From services: `npm run prisma:generate`; targeted runner must PASS including double backfill and old insert association. Assert no historical guided-conversation fixtures changed.
- [ ] **Step 5: Commit only Task 1 files** with `feat(messaging): add additive conversation identity and backfill`.

### Task 2: Extract one message service with neutral API and old-route adapters

**Files:** create `API/messaging/messaging-access.service.ts`, `messaging-message.service.ts`, `messaging.routes.ts`, `API/messaging/test/messaging.integration.spec.ts`, `LockedIn/services/api/src/lib/account-mutation-http.ts`; modify `API/discovery/discovery-chat.routes.ts`, `discovery.http.ts`, `LockedIn/services/api/src/app.ts`.

**Interfaces:**
- `ChatMessageView = {id:string; sequence:string; author:'self'|'partner'; text:string; createdAt:string}`; `ChatPage = {items:ChatMessageView[]; nextCursor:string|null}`.
- `ChatResult<T> = {ok:true; value:T} | {ok:false; status:number; error:string}`.
- `openConversation(tx, conversationId, actorId): Promise<ChatConversation|null>` locks ordered users, then source rows, then conversation; rechecks access. Establish same lock order everywhere before introducing callers.
- `listMessages(tx, conversation, actorId, before?:string): Promise<ChatPage>`; `sendMessage(tx, conversation, actorId, input:{text:string; requestId:string}): Promise<ChatResult<ChatMessageView>>`. Route publishes broker `chat` events only after committed new send.
- GET `/api/messaging/conversations/:id` returns `{id,partner:{publicName,avatarPreset},canChat,unavailableReason,opening?,profileConnectionId?}`; unavailableReason never reveals partner moderation state. Authorize metadata membership separately from message access: an eligible current member can see their own verification guidance or generic unavailable status without receiving a transcript/opener. GET/POST suffix `/messages` uses current DTO. GET `/api/messaging/relationships/:id/conversation` resolves authorized member's existing conversation, no GET-side creation.
- Neutral routes unavailable until shared flag true. Old Discovery routes resolve/create deterministic association under locks but preserve their old Discovery flag, response/header and mutation contract; service is the only read/send implementation.

- [ ] **Step 1: Write tests.** Pin 30 ascending displayed items from descending query, valid BigInt cursor bounds, strict body/params/query, 2,000-character limit, NUL rejection, trusted Origin and owner binding, no-store, outsider 404. Pin:
  ```ts
  expect((await sendViaOld(request)).id).toBe((await sendViaNew(request)).id);
  expect(await countMessages(request.requestId)).toBe(1);
  expect((await sendViaNew({...request,text:'changed'})).status).toBe(409);
  ```
  Include concurrent sends, legacy null-association receipt lookup, closed contact and direct account without Discovery profile/pilot membership.
- [ ] **Step 2: Run targeted integration tests.** Expected RED because neutral routes/service missing.
- [ ] **Step 3: Implement interfaces.** Access mode chooses existing Discovery pair/connection policy or active exact-two-member relationship policy, never a client-requested mode. Both require verified, nonsuspended accounts and no block/durable closure. Read legacy messages by `(conversationId=id) OR (conversationId IS NULL AND connectionId=authorizedSource)` only; check idempotency across the same scope before quota. New writes always set conversationId and set legacy connectionId only for associated Discovery source. Reuse existing quota storage behind a messaging wrapper, not Discovery admission middleware.
- [ ] **Step 4: Run new and existing chat integration tests.** Both PASS; confirm old-only clients continue using one table/service with shared flag off.
- [ ] **Step 5: Commit Task 2 files** with `refactor(messaging): share message service across chat routes`.

### Task 3: Wire acceptance, promotion and same-pair convergence

**Files:** modify `API/invitations/invitation.service.ts`, `API/discovery/discovery-connection.service.ts`, `API/discovery/discovery-promotion.service.ts`, `API/messaging/messaging-conversation.service.ts`; create `API/messaging/test/messaging-invitations.integration.spec.ts`.

**Interfaces:** `attachDirectRelationshipConversation(tx, {relationshipId, invitationId, inviterId, inviteeId}): Promise<ChatConversation>`; `attachPromotedRelationship(tx, {connectionId, relationshipId}): Promise<ChatConversation>` under shared lock order. Shared flag gates new direct creation/reuse; Discovery association itself is compatible.

- [ ] **Step 1: Write acceptance tests.** An eligible direct pair with zero Discovery profiles receives relationship plus conversation in one transaction; injected conversation failure rolls back invitation acceptance and membership. Concurrent acceptance produces one relationship/conversation. Retried acceptance retains existing invitation response contract without duplicate records. Verification-ineligible acceptance still creates space/conversation but message GET/send denied; metadata carries only safe unavailable guidance. Test Discovery-first eligible reuse preserves every message/id and changes accessMode to RELATIONSHIP; restricted transcript never imported. Direct-first same-pair Discovery send/accept returns safe conflict; only verified participants get authorized Messages destination; outsiders cannot probe it. Promotion attaches existing conversation; no new history split.
- [ ] **Step 2: Run targeted tests** and observe RED missing association/reuse behavior.
- [ ] **Step 3: Implement helpers and transactional callers.** Lock accounts, then invitation/Discovery source rows in a single deterministic global order, then conversations. Ensure every path obeys it, including replay. Maintain one-active-relationship constraint and existing invitation eligibility/notification behavior. Do not alter Discovery pause rules for direct acceptance. Old flag-off behavior remains unchanged.
- [ ] **Step 4: Run invitation, promotion, lock-in and new tests.** All PASS, including block versus accept and promotion versus direct accept races with bounded test timeouts.
- [ ] **Step 5: Commit Task 3 files** with `feat(messaging): open canonical chat when partners accept invitations`.

### Task 4: Generalize safety and durable lifecycle before exposing direct chat

**Files:** create `API/messaging/messaging-safety.service.ts`, `API/messaging/test/messaging-safety.integration.spec.ts`; modify `API/messaging/messaging.routes.ts`, `API/invitations/invitation-restrictions.service.ts`, `API/discovery/discovery-safety.service.ts`, `discovery-moderation.service.ts`, `discovery-connection.service.ts`, `API/journey/journey.routes.ts`, `API/profile/account-deletion.service.ts` and affected tests.

**Interfaces:**
- `closePairConversationsUnderLock(tx,a,b,reason:'BLOCK'|'SUSPENSION'|'CONTACT_CLOSED'): Promise<void>` and `closeRelationshipConversationUnderLock(tx,relationshipId): Promise<void>`; all callers lock accounts first.
- `reportMessage(actorId,input:{conversationId:string;messageId:string;reason:string;detail?:string;requestId:string;blockAlso:boolean}): Promise<ChatResult<{id:string;received:true}>>` uses existing allowed reason validation and moderation report table/queue.
- POST `/api/messaging/conversations/:id/reports`, `/block`, `/close`; UUID owner-bound idempotency for reports, current participant/safe-identity checks for safety actions. Block API does not accept arbitrary partner identity.

- [ ] **Step 1: Write safety tests.** Block/close/suspend followed by unblock/restore never reopens read/send, including direct pair with no Discovery profile. Closing from either entry closes same chat, preserves relationship ACTIVE and messages. Direct relationship leave closes conversation and reused Discovery contact; explicit Discovery leave preserves prior behavior. Previously received message remains reportable after closure/block, own/outsider message does not; evidence text/sender/time comes from database even if client lies. Legacy reports still viewable by moderators, no double reports on retry. Account deletion handles new FKs and follows existing policy without cascade surprises. Concurrent send versus close/block/suspend/leave has a consistent before-or-after outcome, never a postclosure commit authorized from stale state.
- [ ] **Step 2: Run targeted tests** and observe RED for direct safety coverage.
- [ ] **Step 3: Implement shared helpers and adapters.** Reuse existing report persistence/quotas and server evidence rules; profile/photo reports keep their original policies. Every mutation that can terminate access closes shared and linked legacy contact under same locks. Add explicit leave lifecycle helper instead of updating Relationship status outside account locks. Do not expose unavailable transcript merely to enable reporting; report authorization is its own narrow historical membership check. Never clear closure in backfill, unblock or restore.
- [ ] **Step 4: Run full local API suite through disposable runner.** PASS including legacy report/moderation/photo/invitation/deletion tests and races.
- [ ] **Step 5: Commit Task 4 files** with `feat(messaging): share reporting and durable contact safety`.

### Task 5: Extract reusable chat UI without changing Discovery behavior

**Files:** create `WEB/messaging/Chat.tsx`, `messaging.client.ts`, `messaging.types.ts`, `MessageSafetyActions.tsx`, `use-chat-refresh.ts`, `chat-state.ts`, `chat.module.scss`, `Chat.spec.tsx`, `chat-state.spec.ts`; modify `WEB/discovery/DiscoveryChat.tsx`, `MessageActions.tsx`, `discovery-chat.ts`, `DiscoveryShell.tsx`, `WEB/notifications/use-notifications.ts`, `NotificationBell.tsx`; reuse the existing notification stream rather than open duplicate SSE sockets.

**Interfaces:** `Chat({conversationId,userId,partner,onAccessEnded,openingContext?,profileAction?})`; partner uses Task 2 DTO; optional context is ReactNode with no Discovery import in shared Chat. `messagingRequest<T>(ownerId,path,options):Promise<T>` sets neutral owner header, authenticated credentials/no-store, supports AbortSignal, and reuses JourneyApiError. `useChatRefresh({userId,onRefresh}):void` consumes authenticated existing broker events and visible-tab 15-second polling/focus/online fallback; cancels on identity change.

- [ ] **Step 1: Write shared component tests.** Same component renders with and without opener; direct chat requires no DiscoveryShell. Sent/received bubbles, 2,000 limit, retry uses same request UUID, duplicate events deduplicate IDs. Report only through menu; block ends local chat. Old-message pagination preserves visible anchor; new messages while scrolled show jump indicator. Identity switch aborts outstanding requests, clears prior draft/page/attempt and cannot send with old owner. Focus refresh never overwrites draft. Assert bounded viewport and compact composer classes; no private-save controls.
- [ ] **Step 2: From web run `npm test -- src/features/messaging/Chat.spec.tsx src/features/messaging/chat-state.spec.ts`.** Expected RED missing modules/behavior.
- [ ] **Step 3: Move existing state/scroll/composer/actions into shared modules.** Keep DiscoveryChat a source adapter that resolves neutral ID and passes ConversationOpening/current profile action. Do not duplicate JSX or change current safety/profile publication handling. Use one authenticated refresh source per mounted surface; don't forward private message content in events.
- [ ] **Step 4: Run shared tests and `npm test -- src/features/discovery`.** PASS; existing Discovery flows and closed-access cleanup remain covered.
- [ ] **Step 5: Commit Task 5 files** with `refactor(web): extract reusable conversation chat`.

### Task 6: Expose Messages in directly invited shared spaces

**Files:** create `LockedIn/apps/web/src/app/messages/[conversationId]/page.tsx`, `WEB/messaging/ChatPage.tsx`, `ChatPage.spec.tsx`, `WEB/journey/relationship-messages.spec.tsx`; modify `WEB/journey/JourneyWorkspace.tsx`, `journey.types.ts`, `API/journey/overview.service.ts`, `WEB/invitations/InvitationReviewContent.tsx` and relevant specs.

**Interfaces:** additive overview field `messaging:{enabled:boolean;conversationId:string|null}` scoped to current authorized active relationship; no transcript in overview. `ChatPage({conversationId:string})` uses normal authenticated app identity, not DiscoveryShell; Task 2 metadata determines chat/profile availability. Messages navigation uses `/messages/:conversationId` and back to shared space.

- [ ] **Step 1: Write entry-point tests.** Direct acceptance exposes Messages without an automatic send or Discovery onboarding. Existing backfilled shared space exposes same entry. Flag off hides new entry. Unverified actor sees own verification guidance, partner-ineligible sees generic unavailable status. No-publication direct pair has no profile button; valid authorized Discovery partner retains existing public-profile modal. Reload/direct URL, outsider and ended relationship show safe states without another user's data.
- [ ] **Step 2: Run relevant web/API tests.** Expected RED absent entry and overview field.
- [ ] **Step 3: Implement additive overview and neutral page.** Render an explicit Messages link within existing shared workspace rather than new global inbox/navigation redesign. Keep invitation acceptance destination in shared space with chat accessible immediately. Derive safe direct identity from current approved account display fields/avatar fallback, never email. No draft or private-reflection projection.
- [ ] **Step 4: Run entry tests plus journey/invitation/connected-profile suites.** PASS; old overview consumers tolerate added metadata and no Discovery enrollment lookup gates direct entry.
- [ ] **Step 5: Commit Task 6 files** with `feat(web): let invited partners open shared Messages`.

### Task 7: Rehearse rollout, verify whole feature and document handoff

**Files:** create `LockedIn/docs/shared-messaging-rollout.md`, `LockedIn/services/api/src/features/messaging/test/messaging-rollout.integration.spec.ts`; modify `LockedIn/services/scripts/verify-discovery.mjs` for upgrade rehearsal if needed; document config alongside existing env config examples without secrets.

**Interfaces:** `SHARED_MESSAGING_ENABLED=false` by default; checked consistently for direct creation/reuse/new entry/neutral APIs. Backfill tool Task 1, unchanged compatibility paths Task 2. No flag silently changes Discovery exclusivity.

- [ ] **Step 1: Write upgrade/rollback rehearsal test.** Seed old messages/report/explicit lock/legacy/direct relationships. Apply expansion, simulate old null-association send, upgrade all writers, rerun backfill, enable flag, send via both clients and compare IDs/counts. Disable flag before simulating old writers; neutral/direct chat unavailable, old Discovery behavior remains safe. No constraint contraction or deleting rows.
- [ ] **Step 2: Run rehearsal test** and observe RED for any missing rollout invariant before correcting tooling.
- [ ] **Step 3: Implement documentation/config and rehearsal support.** Document ordering: expand schema → upgraded safety/source writers with flag off → backfill/check → verify each live API writer version → enable shared flag → compatible web → two-account smoke test. Include explicit maintenance gating while any old writer exists, rerun and rollback procedures, safe counts/no secret output. Stop on counts or source-policy mismatch. Production/staging push/deploy requires user direction.
- [ ] **Step 4: Run full verification.** Disposable runner all API tests; from services `npx tsc --noEmit --skipLibCheck`; from web `npm test`, `npx tsc --noEmit --incremental false`, changed-file ESLint, `npm run build -- --webpack`; outer `git diff --check`. Record actual pass/fail counts and known skipped cases, not historical counts.
- [ ] **Step 5: Browser-test both origins with two accounts.** Direct invite with no Discovery profiles → accept → bidirectional chat → reload → report/menu → block/closure; existing Discovery transcript → promote → same chat/profile access. Verify desktop/mobile viewport/keyboard, older history anchors, new-message indicator, no giant page, identity switch, verification fallback, Messages entry for existing shared space. If browser unavailable report that verification gap and do not claim browser success.
- [ ] **Step 6: Request whole-branch review and resolve findings.** Follow requesting-code-review skill; verify corrections with targeted plus affected suites. Review migration/privacy/authorization first. No completion claim until evidence matches approved spec.
- [ ] **Step 7: Commit rollout/test/docs files** with `test(messaging): verify shared chat rollout and compatibility`; use finishing-a-development-branch skill for handoff. Do not push or run production backfill without user instruction.

## Self-review ledger

- Spec source identity, preservation and additive rollout: Tasks 1–2, 7.
- Atomic direct acceptance, eligible same-pair reuse, reverse-order conflict and promotion: Task 3.
- Source-specific access and unchanged Discovery publication policy: Tasks 2–3.
- Reports, moderation, durable block/close/leave and deletion: Task 4.
- Shared bounded UI, local-only unsent text, updates and profile privacy: Tasks 5–6.
- Existing spaces, old API tabs, mixed-binary gating and rollback: Tasks 1–2, 6–7.
- All five Review Focus cases have explicit checks. The original implementation review found that a block or suspension could be lost on an unbackfilled relationship while the capability was off. Regression tests failed first, then passed with durable closure in the upgraded safety writers. Related tests cover separate conversation closure and metadata authorization.
- Final local verification: 338 API tests passed, 1 skipped; 203 web tests passed; API and web type checks, changed-file lint, webpack build and both two-account browser flows passed. A non-overlapping refresh after more than one page of new messages can still reset loaded history, as in the prior Discovery chat; ordinary overlapping refresh and pagination keep the reading position.
- Current checkout preserved. No push, deployment or live database changes were performed.
