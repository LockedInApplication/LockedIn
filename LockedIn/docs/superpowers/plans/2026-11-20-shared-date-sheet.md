# Shared Date Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let two people choose a venue and time from one private planner while chat keeps only the original invite.

**Architecture:** Reuse the existing date plan state machine and immutable message evidence. Opt the new web client into a compact transcript and independent date receipts, leaving existing client defaults unchanged. Reuse date-spot search and detail components inside the sheet, and derive privacy-safe bell entries from the same receipt data.

**Tech Stack:** Fastify, Prisma/PostgreSQL, React/Next.js, SCSS, Vitest, existing browser smoke harness.

**Spec:** [Shared date sheet design](../specs/2026-11-20-shared-date-sheet-design.md)

## Global Constraints

- Both accepted Discovery and direct-invite/shared-space chats use the same behavior. Preserve existing access, moderation, rate limits, revision, expiry and lock-in rules.
- Keep one actionable plan per conversation, all historical activity, and existing clients' inline planner. No new persisted drafts, browser push, email, bookings, or external calendar sync.
- Only the selected public venue and proposed time are shared. No starting areas, API tickets or private travel data in the transcript or notifications. Calendar file export remains optional.
- Keep scheduling behind `DATE_PLANS_ENABLED`; maintain normal messaging and explicit place shares when off. No staging or production changes as part of implementation.

## Review Focus

- A lost response is retried after the original ticket expires or the provider goes down: return the original invite, not a duplicate or failure (Task 1).
- A partner uses the old inline client: it sees and can act on the same invite; its legacy acknowledgement still works (Tasks 1 and 2).
- Before cutover, some dates were read and some were not; afterward one plan is opened while a newer one is unread: don't resurrect seen updates or clear the other plan (Task 2).
- More than a page of hidden events span a history boundary: return full pages of visible items in order, with stable text anchors (Task 2).
- A stale request completes after a different sheet is opened or access is revoked: it cannot render stale details, acknowledge another plan, or permit a mutation (Tasks 2 and 3).

### Task 1: Trusted venue, one invite, and scoped plan details

**Files:** `services/api/prisma/schema.prisma`, migration `20261120010000_shared_date_sheet`, `services/api/src/features/date-plans/{date-plan-types,date-plan-service,date-plan-routes,date-plans.integration.spec}.ts`, `services/api/src/features/date-spots/date-spots.routes.ts`.

**Interfaces:** Consume the current `readDateSpotTicket(ticket, conversationId, ownerId, secret, now)` and `openConversation`. Extend `DatePlanAction`'s existing `propose` variant to take exactly one of `sourceMessageId` and `ticket`. Add `GET /api/messaging/conversations/:id/date-plans/:planId` returning `{plan, activity, canAct}`, and `GET .../date-plans/venues` returning authorized shared places as `{id, name}` with an optional exclusive sequence cursor. Add `planDetails` to the existing date-spots endpoint, returning the existing safe `VenueDetails` shape.

- [ ] **Write integration assertions.** In `date-plans.integration.spec.ts`, assert a direct offer increments the number of transcript rows by one, contains an actionable `propose` on the legacy endpoint, and keeps the venue provider ID and ticket out of the response. Assert exact retry with the same request ID produces the same invite even after ticket expiry, while a changed request gives 409. No provider details call is made in either case. Preserve the existing shared-place proposal tests; also assert the picker includes an earlier share outside the most recent message page and rejects foreign/ordinary messages. Assert plan detail only returns partner-scoped activity for the exact plan, even after cancellation, and loses access under the current closure/block rules.
- [ ] **Run the isolated integration harness** (`cd LockedIn/services && DISCOVERY_TEST_ADMIN_URL=<local-test-admin-url> node scripts/verify-discovery.mjs`) and confirm the new route/direct proposal assertions fail for the intended reason.
- [ ] **Implement the venue anchor and routes.** Add nullable server-only `ChatDatePlan.venuePlaceId`; for direct offers generate the proposal row ID first and use that row as `sourceMessageId` without setting `DiscoveryMessage.dateSpotPlaceId`. Keep legacy shared-place anchors and wire format. Reuse the normal quota, pair locks, message records and post-commit broker. Include the selected input variant in the retry fingerprint without changing the hash for old shared-place requests. Resolve the authorized plan or shared row before a provider call and re-authorize afterward; saved plan text and time do not depend on the provider.
- [ ] **Re-run the isolated suite, then commit** the scoped venue/plan changes and test together.

### Task 2: Compact transcript and independent date activity

**Files:** `services/api/src/features/messaging/{messaging-message.service,messaging-unread.service,messaging.routes}.ts`, `services/api/src/features/discovery/discovery-chat.routes.ts`, `services/api/src/lib/account-mutation-http.ts`, new `services/api/src/features/date-plans/date-plan-read.service.ts`, `date-plan-routes.ts`, Prisma migration `20261120011000_date_plan_receipts`; tests in `date-plans.integration.spec.ts`, `messaging-unread.integration.spec.ts`, and `services/scripts/verify-discovery.mjs`.

**Interfaces:** Read `presentation=sheet` on either messages route, `/api/messaging/unread`, and `POST .../read` (absent = legacy). In sheet mode the chat unread response adds `dates: {count, items}` where each item is `{conversationId, discoveryConnectionId, planId}`; no venue/time. `GET .../date-plans?presentation=sheet` adds `unreadUpdate: {planId, action} | null`. `POST .../date-plans/:planId/read` takes `{through}`, a sequence from a partner event returned in that plan's `activity`. Keep existing chat unread fields and mutation responses for legacy requests.

- [ ] **Write integration assertions.** After initial offer, counter, confirm and cancellation, assert sheet pages contain just the offer plus text/shared-place ideas; legacy pages contain all immutable transition rows. Insert more than 30 transitions and verify adjacent compact pages return visible entries without duplicates or false history exhaustion. Assert reading text leaves date alerts, reading an old date leaves both a newer plan update and unread text, reading a foreign message is rejected, opt-out hides badges not actions, and a legacy read still sees and acknowledges date events. In `verify-discovery.mjs`, apply through `20261119005000_chat_date_plans`, seed two dates and a legacy read watermark between them, then apply the remaining migrations; assert only the later event counts as unseen and both message rows are unchanged. Also test a text receipt higher than a date event after cutover and report evidence for a hidden partner update. Flag-off and blocked cases reveal neither date badges nor details.
- [ ] **Run the integration harness** and confirm assertions fail for missing sheet projection/receipts.
- [ ] **Implement projection and acknowledgements.** Filter non-proposal transitions before the database page limit; when plans are disabled retain the existing neutral legacy behavior and return no date activity. Add per-conversation/account legacy date watermark and per-plan/account receipt tables, both monotonic. Snapshot the effective old chat watermark (including the Discovery baseline) for historical date conversations in the migration. Only legacy chat acknowledgements advance the legacy date watermark after cutover. New clients advance only the applicable marker; validate the plan and through-event under the existing conversation gate. Group unread partner transitions by plan, applying the send-time suppression flag and current in-app preference. Use the existing authorized chat invalidation path after mutations and acknowledgement. Permission loss still prevents exposure or actions; don't create notification records or delete transcript rows.
- [ ] **Re-run the isolated suite, then commit** projection, migrations, receipts, tests and routes together.

### Task 3: One responsive planner and quiet in-app alerts

**Files:** New `apps/web/src/features/messaging/SharedDateSheet.tsx` and `SharedDateSheet.spec.tsx`; modify `Chat.tsx`, `ChatDateTools.tsx`, `DateSpots.tsx`, `DatePlanForm.tsx`, `use-date-plans.ts`, `use-chat-read.ts`, `chat-state.ts`, `{date-plans,messaging}.types.ts`, `chat.module.scss`; wire `apps/web/src/features/notifications/{message-alerts.client,notification.types,use-notifications,NotificationBell,NotificationPanel}` and the Discovery/shared chat entry points. Reuse `DateSpotVenue` and `MessageSafetyActions`.

**Interfaces:** `SharedDateSheet` owns a single open planner (browse, details, schedule, current or exact historical plan). `DateSpots` accepts an optional `onSelectSpot(spot: Spot)` for the explicit date workflow; standalone place sharing remains an explicit separate action. Bell links carry the opaque plan UUID in a query parameter and resolve inside the authorized chat.

- [ ] **Write frontend assertions.** In `SharedDateSheet.spec.tsx` and `Chat.spec.tsx`, assert a single header action, a compact invite binding the correct plan ID, and no previous below-chat planner buttons when the sheet is enabled. Assert the current proposer, counteroffer, terminal and historical views expose the correct actions; browsing must not send. Test that temporary search failure doesn't disable a saved place, unread labels are generic, old plan links cannot acknowledge newer plans, and a late request after switch/close is ignored. Cover display/focus behavior and composer preservation in the browser check below.
- [ ] **Run** `cd LockedIn/apps/web && npm test -- src/features/messaging src/features/notifications`; confirm the new assertions fail for the missing sheet behavior.
- [ ] **Implement UI and alert entry points.** Reuse a native dialog with bottom placement on mobile and centered placement on desktop. Keep chat mounted; return focus to the opener with `preventScroll`, falling back to the header action. Keep selection local to the open sheet; use one request ID per equivalent submission. Render activity and report actions inside the sheet (without opening a second top-level modal). Acknowledge only loaded details for that plan while the dialog is open and document visible. Subscribe via the existing chat refresh path, without displaying a refresh banner. Only opt new clients into sheet presentation when the planner is supported; launch exact plan links on both chat routes. Show a generic “Date update” in the existing bell panel, separate from unread chat.
- [ ] **Run frontend suites, targeted lint, and production build** (`npm test`, `npx eslint <changed frontend files>`, `npm run build -- --webpack` from `LockedIn/apps/web`). Then run a two-account browser check at mobile and desktop widths against an isolated local database for Discovery and direct-invite paths: recommend/place photos, send, notice unread, counter, confirm, optionally export and cancel; verify Escape, tap targets, focus, draft and scroll, including after older messages load. Repeat with the flag off. Record exact checks in the handoff and commit the scoped frontend files.
- [ ] **Review the integrated diff** for compatibility, authorization, unread races, and UX. Re-run the affected test commands after fixes; stop short of merging or deploying.
