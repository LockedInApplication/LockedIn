# In-app Message Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make new messages easy to find inside LockedIn and remove routine manual refresh prompts without losing draft text or the reader’s place.

**Architecture:** The API stores one read watermark per conversation member, using the existing ordered message sequence. The existing notification stream prompts the notification bell and chat to re-read their own data; reconnect and polling recover missed signals. The shared workspace and Discovery refresh their own data without reloading the page.

**Tech Stack:** Fastify, Prisma, PostgreSQL, Next.js/React, Vitest, existing SSE and local browser harness.

**Spec:** `LockedIn/docs/superpowers/specs/2026-11-19-in-app-message-alerts-design.md`.

## Global Constraints

- “No phone push, email alerts, calendar changes, or new date-planning work.”
- “Use a generic label and do not include message text in notification data.”
- “Never reload the whole page to apply routine activity.”
- Keep the existing messaging and Discovery rollout flags, existing notification links, and draft-discard safeguards for user-initiated navigation. No push/deploy as part of this plan without a separate request.

## Review Focus

- A newer message arrives between fetching and acknowledging the transcript: Task 1 proves it stays unread.
- The same partner retries a send, sends in bursts, or opens multiple tabs: Tasks 1–2 prove one entry per conversation and monotonic acknowledgements.
- The stream reconnects after a message was missed: Task 2 tests recovery without depending on an event arriving again.
- The chat is hidden or scrolled back: Task 3 verifies nothing unseen is marked read or jumps the viewport.
- A shared update arrives mid-edit or immediately as a save begins: Task 4 verifies the refresh is deferred, then reapplied when safe.

---

### Task 1: Store read state and expose authorized unread chats

**Files:** `LockedIn/services/api/prisma/schema.prisma`, new additive migration, new `api/src/features/messaging/messaging-unread.service.ts` and `test/messaging-unread.integration.spec.ts`, existing `messaging.routes.ts`.

**Interfaces:** `GET /api/messaging/unread` returns the existing owner envelope with `{count, items: [{conversationId, discoveryConnectionId}]}`. Count distinct accessible conversations (cap at 100 and display 99+); newest unread partner message first. `POST /api/messaging/conversations/:id/read` accepts `{through: string}` and returns `{through: string}` in the owner envelope. Reuse positive signed-64-bit decimal validation from chat pagination, the existing mutation identity checks, and the shared conversation access policy, including its supported legacy Discovery path when neutral chat is off.

- [ ] Add disposable-DB tests: initial incoming message causes one entry for the recipient and none for the sender; a retried send preserves one entry; outsider read/list cannot access chat state; blocked/closed chats disappear. Assert that a second send before acknowledgement of the first remains unread; repeated/older acknowledgements do not move the marker backward; a sequence not in the chat cannot advance it. Test both accepted Discovery and direct-partner destinations.
- [ ] Run the focused local harness, `node .superpowers/sdd/2026-11-17-shared-messaging/run-local.mjs api/src/features/messaging/test/messaging-unread.integration.spec.ts`; expect missing endpoint assertions before implementation.
- [ ] Add `ChatReadState(conversationId, userId, through)` with composite primary key, account lookup index, cascading foreign keys, and an atomic max update. Reuse `messageScope` and filter only partner messages beyond the watermark. Bound and batch list queries; enforce current access before counting, avoid taking write locks in the list, and lock the pair only for acknowledgement. Initialize existing chats at their current latest sequence during migration so historic conversations do not suddenly light up; new conversations read from zero.
- [ ] Generate Prisma, rerun the focused tests, and commit the API slice after the migration fixture proves existing messages are unchanged.

### Task 2: Show unread chats in the notification bell

**Files:** `LockedIn/apps/web/src/features/notifications/{use-notifications.ts,NotificationBell.tsx,NotificationPanel.tsx}`, new `message-alerts.client.ts`, extend panel/navigation tests; `JourneyWorkspace.tsx` and `DiscoveryShell.tsx` for existing navigation guards.

**Interfaces:** `fetchUnreadChats(userId, signal): Promise<UnreadChats>`, matching Task 1. Unread entries have a separate generic “New message” action in the bell; open `/connections/<id>` for Discovery and `/messages/<id>` for direct chat, preserving the active shell's navigation guard. Opening from the bell does not itself mark anything read.

- [ ] Test a generic unread entry, correct safe/encoded chat destination, no message preview, no duplicate entry, unchanged existing notification links, and restoring unread state after reconnect. Verify ordinary alerts stay usable if unread fetch fails.
- [ ] Run `npm test -- NotificationPanel notification.navigation` from `LockedIn/apps/web`; expect missing unread-entry behavior.
- [ ] Fetch unread state on mount, chat signal, reconnect/focus and the existing recovery interval. Combine conversation count with the bell badge, and use an accessible quiet announcement for newly observed unread conversations, not for initial hydration or repeated identical results.
- [ ] Rerun focused tests and commit the bell slice.

### Task 3: Acknowledge only the messages the reader has seen

**Files:** `LockedIn/apps/web/src/features/messaging/{Chat.tsx,chat-state.ts,chat-state.spec.ts,Chat.spec.tsx,messaging.client.ts}`.

**Interfaces:** `readThroughSequence(items: ChatMessage[], visible: boolean, followingLatest: boolean, hasDeferred: boolean): string | null`. POST the exact rendered partner-message sequence accepted by Task 1; successful acknowledgement triggers an unread-badge refresh without forcing a transcript reload.

- [ ] Assert the helper returns null for a hidden tab, history scroll, deferred gap, empty or self-only transcript; returns the highest displayed partner sequence at latest; and after jumping to latest uses the newly rendered page, not the old one. Add browser assertions that a typed draft and scroll offset survive an incoming message.
- [ ] Run `npm test -- chat-state Chat.spec`; expect missing read-tracking behavior.
- [ ] Acknowledge after render/scroll state is current, coalesce pending writes, retry on subsequent visibility/reconnect, and abort stale account/conversation requests. Retain the existing follow-latest, pagination and draft behavior.
- [ ] Rerun the focused tests and commit the acknowledgement slice.

### Task 4: Replace the global refresh banner with in-place updates

**Files:** `LockedIn/apps/web/src/features/journey/JourneyWorkspace.tsx`, `LockedIn/apps/web/src/features/discovery/DiscoveryShell.tsx`, targeted view tests and, only if needed, a shared `use-quiet-refresh.ts` hook.

- [ ] Add tests: a genuine activity event updates clean data without the global prompt; dirty/busy state defers a burst into one refresh on the next clean transition; an older response cannot overwrite newer edits; explicit failed interactions retain their local retry or conflict feedback. Assert the normal update path never calls page reload.
- [ ] Run the two targeted view tests and confirm the existing banner or missing deferred refresh causes failure.
- [ ] Replace generic activity banners with a coalesced refresh revision. Preserve form identity and existing explicit navigation guards; gate applying fresh data both before the request and when it returns. Make workspace clean transitions observable rather than waiting on a mutable ref alone. Use scoped invalidation for Discovery capabilities and existing child data that listen for activity.
- [ ] Rerun focused tests and commit the quiet-update slice.

### Task 5: Release-readiness check

- [ ] Run the full web suite and production build: `npm test && npm run build -- --webpack` from `LockedIn/apps/web`. Run the disposable API migration/integration suite with `node .superpowers/sdd/2026-11-17-shared-messaging/run-local.mjs` from the workspace root.
- [ ] Use two synthetic accounts in isolated local browser contexts. Check an off-chat badge, hidden-tab and history behavior, real-time arrival, reconnect recovery, both chat destinations, and badge clearing only after the latest message is seen. Trigger activity while typing in both surfaces: draft and scroll stay put and neither global banner appears.
- [ ] Review cross-account/closed-chat behavior and migration before offering deployment; report test counts, any baseline failures, and the explicit production migration requirement.
