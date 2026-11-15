# Compact Conversations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make mobile conversation browsing compact and open suggestion notifications directly into a safe, focused response view.

**Architecture:** Keep the feature-slice structure, existing workspace navigation, and mutual-choice service. Add a recipient-scoped suggestion resolver keyed by notification ID, and validate acceptance against the original notification under the relationship lock. Reuse the topic catalog and compact frontend components rather than building a second conversation flow.

**Tech Stack:** Next.js, React, SCSS, Fastify, Prisma/PostgreSQL, Vitest; existing browser verification tooling.

**Spec:** `docs/superpowers/specs/2026-11-15-compact-conversations-design.md`

## Global Constraints

- Preserve matching rules, answer visibility, reveal consent, question content, and notification preferences.
- Viewing a suggestion or topic preview never submits a choice.
- All existing topics, withdrawal, and Either remain accessible.
- Preserve account isolation, dirty-answer navigation guards, and busy/disabled states.
- No app-wide bottom navigation or unrelated home/map redesign.
- Use the existing isolated worktree; do not deploy, push, or merge without authorization.

## Review Focus

- Old notifications for an updated choice (same choice ID, different pack key) must not accept the replacement.
- Notification IDs belonging to another account must disclose no suggestion or relationship data.
- Withdrawn/recreated choices and ended spaces must fail safely even between opening and accepting.
- Choosing another topic, browser Back, and notification navigation must preserve existing draft guards.
- Long partner names/titles and mobile keyboard/focus behavior must not hide the primary response.

---

### Task 1: Recipient-scoped suggestion resolution and conditional acceptance

**Files:**
- Create: `services/api/src/features/conversations/conversation-suggestion.service.ts`
- Create: `services/api/src/features/conversations/conversation-suggestion.routes.ts`
- Create: matching `conversation-suggestion` unit/integration specs in that feature.
- Modify: `services/api/src/features/conversations/conversation.service.ts`, `conversation.routes.ts` (registration), existing notification helpers only where needed.

**Interfaces:**
- GET `/api/journey/notifications/:notificationId/conversation-suggestion` returns a discriminated result: `{status:'pending', relationshipId, partnerName, pack:ConversationPack|null, canStart:boolean}` or `{status:'unavailable', reason:'changed'|'resolved'|'ended'}`. Null pack means the partner chose Either, not a missing topic.
- POST the same path accepts the exact represented choice and returns the existing `{started:boolean,sessionId?:string}` result, or 409 when stale/ineligible.
- Services derive recipient from authentication; use the saved notification's relationship and event identity, never client-supplied identity. Other-owner/missing/suppressed/non-choice notifications return 404.

- [ ] Write failing tests: current choice resolves; same ID/new pack, withdrawal/recreation, resolved notification, missing/foreign notification, and ended relationship expose no stale actionable suggestion.
- [ ] Run `npm test -- conversation-suggestion` from `services`; confirm failures identify the missing implementation.
- [ ] Implement resolver using current relationship and choice state plus the existing notification event identity (`recipient`, kind, relationship, choice ID and pack key). Reuse the notification event-key recurrence convention; do not return raw event keys to clients.
- [ ] Add failing acceptance tests: pending starts only under existing matching rules; opening is read-only; stale acceptance returns 409 without creating/updating a choice or session; Either preserves existing semantics; active unfinished session blocks new starts.
- [ ] Validate notification identity and live choice while holding the existing relationship row lock, before calling the existing choice logic in the same transaction. Preserve notification delta/publishing and activity-email preference behavior; reuse shared post-choice effects instead of duplicating them.
- [ ] Run focused unit tests and disposable-DB integration tests; expect pass. Do not use the Render DB or real users for automated writes.
- [ ] Review diff and checkpoint this task with a scoped commit when Git write permission is available.

### Task 2: Compact topic browser and explicit topic previews

**Files:**
- Modify: `apps/web/src/features/conversations/ConversationLibrary.tsx`
- Create: `ConversationTopicPreview.tsx`, `ConversationChoiceSummary.tsx`, `conversation-library.module.scss`, `ConversationLibrary.spec.tsx` in the same feature.
- Modify: journey conversation types only as needed for backward-compatible display data.

**Interfaces:**
- Retain `ConversationLibraryProps` and its `onStart(packKey:string|null)` and `onWithdraw()` callbacks.
- Preview consumes `ConversationPack`, busy/canStart state, and an explicit submit callback; opening/closing does not invoke submit.

- [ ] Write failing component tests: partner suggestion precedes topic list; own pending choice and Withdraw remain visible; all six topics are reachable; Either is explicit; preview open/close causes zero choice calls.
- [ ] Run `npm test -- ConversationLibrary` from `apps/web`; confirm expected failures.
- [ ] Replace verbose cards/choice board with compact rows, one contextual sentence, a compact choice summary, and an accessible How-it-works disclosure. Keep a short privacy line visible. Prefer showing all six short rows rather than hiding topics behind the mockup's illustrative More section.
- [ ] Implement accessible topic preview with prompt count/description, explicit Suggest, safe focus restoration, Escape/Back behavior, and disabled submission when busy/ineligible. Use existing dialog patterns; introduce no dependency.
- [ ] Add tests for partner Either, differing own/partner choices, active session guidance, unknown catalog keys, and long text. Ensure either/no-choice are not conflated.
- [ ] Run focused tests and web typecheck; expect pass. Checkpoint scoped changes.

### Task 3: Focused notification destination and compact workspace integration

**Files:**
- Modify: `apps/web/src/features/notifications/notification.navigation.ts`, `.spec.ts`
- Modify: `apps/web/src/features/journey/JourneyWorkspace.tsx`, navigation helpers/specs and responsive shell styles.
- Create: `apps/web/src/features/conversations/ConversationSuggestionView.tsx`, `conversation-suggestion.client.ts`, and view/resolution tests.

**Interfaces:**
- Conversation-choice notification destination becomes `/journey?view=conversations&suggestion=<notificationId>`; add notification `id` to the destination function's accepted fields and update all callers/tests.
- Focused view loads Task 1's recipient-scoped endpoint and accepts only through its POST. Browser/topic-list suggestions continue using existing explicit choice actions.
- Choosing another removes suggestion query state and shows the browser; Back to our space returns home through existing guarded navigation.

- [ ] Write failing destination tests for encoded notification IDs and unchanged invitation/atlas/roadmap destinations.
- [ ] Write failing focused-view tests: loading/error/retry, pending topic/Either, changed/withdrawn/resolved/ended states, active-session guidance, and acceptance conflict refresh. Navigation alone must not POST.
- [ ] Implement a focused authenticated view keyed by user and notification ID; abort outstanding loads on account/ID change and reject late responses. Refresh current workspace after acceptance using existing action machinery.
- [ ] Omit oversized intro/member card/roadmap for the focused destination. Use compact title/header for general conversation browsing while retaining workspace controls and other page layouts.
- [ ] Cover malformed/foreign IDs, reload/deep links, browser Back, choosing another with drafts, and SSE invalidation while a suggestion is open. Revalidate before enabling acceptance and retain server-side stale validation as the final authority.
- [ ] Run navigation/view tests, existing journey dirty-guard tests, and typecheck; expect pass. Checkpoint scoped changes.

### Task 4: Verification, review, and handoff

**Files:** Approved design and this plan; any narrowly scoped regression fixes exposed by verification.

- [ ] Verify mobile at 390×844 and 320px width plus desktop: suggestion title and primary action visible without scrolling past introductory content; long names/titles wrap; all topics accessible; no horizontal overflow.
- [ ] Browser-test mock API scenarios for topic preview, explicit accept, acceptance409, stale notification, active session, own withdrawal, Either, keyboard/Escape focus, browser Back, and dirty-answer navigation. Use synthetic accounts/data only.
- [ ] Run web `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build -- --webpack` from `apps/web`.
- [ ] Run API `npm test`, canonical `npm exec tsc -- --noEmit --skipLibCheck`, and the existing disposable-database integration workflow from `services`.
- [ ] Run `git diff --check`; inspect staged scope and exclude local mockup/server artifacts and secrets. `.superpowers/` is currently untracked; keep it out of product commits.
- [ ] Request one independent whole-change review using the requesting-code-review skill; address findings and rerun affected checks.
- [ ] Mark design/plan status with actual verification results. Report local completion and remaining merge/deploy steps; do not claim hosted UI has changed.

## Execution handoff

User approved native execution. Implementation and review-fix pass completed locally. Verification: web111, API97unit plus40 disposable-database integration tests, typechecks, lint (one pre-existing avatar warning), production webpack build, and mobile/desktop browser checks. Changes remain uncommitted and undeployed pending integration choice.

Implementation decisions: inline accessible topic previews instead of a modal; all six compact rows visible; existing early history delegate extended to protect journey drafts on browser Back. No matching, reveal-consent, schema or real-data changes.
