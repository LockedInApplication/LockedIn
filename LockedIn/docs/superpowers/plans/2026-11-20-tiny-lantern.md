# Tiny Lantern Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each person an optional, friendly guide to Together without interrupting chat or adding onboarding steps.

**Architecture:** The authenticated Journey overview exposes an `isMutuallyLockedIn` boolean on its active relationship. A keyed Together component owns its greeting and help state, using browser storage only to remember a greeting for this account and space.

**Tech Stack:** TypeScript, Fastify, Prisma, React/Next.js, SCSS modules, Vitest, existing disposable localhost Playwright harness.

**Spec:** `LockedIn/docs/superpowers/specs/2026-11-20-tiny-lantern-design.md`

## Global Constraints

- No database migration, AI, analytics, notification, new setting, or deployment. The component receives only opaque IDs, the eligibility boolean, and the current view, never message or private-answer content.
- No change to chat, navigation, plan actions, check-in actions, or consent. The guide sits in the page, does not steal focus or redirect, and works without motion.
- Use these strings: “You two are locked in! Keep chatting, make a plan, or try a guided conversation. No rush.”; “Need a hand?”; “Suggest an idea. You don’t have to pick a day yet.”; “Answer privately. You decide what to share.”

## Review Focus

- A legacy promoted connection lacking `lockedInAt` must not be celebrated as a lock-in. Task 1 fixture.
- Storage blocked on read or write must leave help available without repeatedly auto-opening. Task 2 policy tests.
- Signing into the second member in the same browser must not reuse the first member’s account-scoped greeting state. Task 2 policy and browser tests.
- Opening a deep link to a plan or conversation request must not show the automatic welcome or take focus from the target. Task 2 browser checks.
- A 320px viewport with reduced motion must display a still, keyboard-accessible lantern without covering the existing page. Task 2 browser checks.

---

### Task 1: Expose active mutual lock-in to Together

**Files:** Modify `LockedIn/services/api/src/features/relationships/relationship-access.service.ts`, `LockedIn/services/api/src/features/journey/overview.service.ts`, and `LockedIn/services/api/src/features/journey/overview.service.spec.ts`.

**Interfaces:** `buildJourneyOverview(userId, authenticatedUser?)` keeps its existing inputs and response, adding `relationship.isMutuallyLockedIn: boolean` only when `relationship` exists.

- [ ] Add overview tests with `expect(overview.relationship?.isMutuallyLockedIn).toBe(true)` for an active relationship linked to `PROMOTED` Discovery with a non-null timestamp, `false` for a direct relationship with no link, and `false` for a promoted legacy link with `lockedInAt: null`. Keep `expect(overview.relationship).toBeNull()` for accounts with no active relationship; assert timestamp and Discovery connection fields are not in the response.
- [ ] From `LockedIn/services`, run `DATABASE_URL=postgresql://test:test@127.0.0.1:1/test npm test -- api/src/features/journey/overview.service.spec.ts`. Expect new boolean assertions to fail initially.
- [ ] Include only `state` and `lockedInAt` from the optional linked `discoveryConnection` in `getActiveRelationship`. Compute and return the boolean in the overview from that relation; do not return raw connection metadata. The helper already restricts membership and active status. This is additive and needs no client coordination or migration.
- [ ] Rerun the focused command; expect no failures. Commit only the task files as `feat(api): expose mutual lock-in in Together overview`.

### Task 2: Add and verify the Tiny Lantern in Together

**Files:** Modify `LockedIn/apps/web/src/features/journey/journey.types.ts` and `LockedIn/apps/web/src/features/journey/JourneyWorkspace.tsx`. Create `LockedIn/apps/web/src/features/journey/components/TinyLantern.tsx`, `LockedIn/apps/web/src/features/journey/tiny-lantern.ts`, `LockedIn/apps/web/src/features/journey/tiny-lantern.spec.ts`, and `LockedIn/apps/web/src/features/journey/tiny-lantern.module.scss`. Extend `LockedIn/services/scripts/verify-shared-messaging-browser.mjs` in its `navigation` scenario.

**Interfaces:** Add optional `isMutuallyLockedIn?: boolean` to the web overview relationship type for compatibility with older API responses. Export `claimTinyLanternWelcome(getStorage: () => Pick<Storage, "getItem" | "setItem">, userId: string, relationshipId: string): boolean` and `tinyLanternTip(view: "home" | "roadmap" | "conversations"): string`. Render `TinyLantern({ userId, relationshipId, isMutuallyLockedIn, view })` on these three normal routes only, passing `overview.relationship.isMutuallyLockedIn === true` and using a stable key unique to the user and relationship.

- [ ] Test `expect(claimTinyLanternWelcome(storage, "u1", "r1")).toBe(true)` then `false`; assert `true` for `("u2", "r1")` and `("u1", "r2")` on the same fake store. Assert `false` if the provider or write throws and exact text for both contextual tips. In the browser scenario add assertions for a visible greeting on Home for both mutual members, no repeat after navigating away/reloading, absence for direct invite, no auto-welcome on a fresh Roadmap deep link, manual tip via keyboard, and focus/body-width invariants. Use the same context with a replacement session cookie to verify account isolation; use the existing reduced-motion context to assert the ornament has no running animation.
- [ ] From `LockedIn/apps/web`, run `npm test -- src/features/journey/tiny-lantern.spec.ts`. Expect a missing module until the helpers exist. If a localhost fixture is available, confirm the new browser greeting check also fails without the UI.
- [ ] Implement the helpers and component. Use a namespaced, collision-safe key (version plus both opaque IDs); return `true` only after a successful first write. Claim only on the normal Home view with a true server flag; React effect replay must not close a greeting that was just claimed. Manual help works regardless of the flag and shows only the view’s tip. Use a single dismissible inline disclosure, with `aria-expanded`, a named close button, and keyboard focus preserved/restored to the trigger when closing help. Use a decorative local lantern shape and one brief, silent CSS motion disabled under `prefers-reduced-motion: reduce`; avoid fixed positioning. Do not mount it in invitation management/review, conversation suggestion review, or Inbox. Keep existing workspace actions and focus logic unchanged.
- [ ] Rerun the focused test, then run `npm test`, `npx tsc --noEmit`, and lint only the changed web TypeScript files. Run `npm test` and `npx tsc --noEmit --skipLibCheck` in `LockedIn/services` using a dummy local database URL for unit tests; integration with a real database must use only an owned, migrated localhost fixture. With that fixture and a local Playwright module available, run `LOCKEDIN_BROWSER_SCENARIO=navigation node --import tsx scripts/verify-shared-messaging-browser.mjs` from `LockedIn/services`, setting a test-only `BETTER_AUTH_SECRET` and the fixture `DATABASE_URL`. Expect the `PASS navigation` line, including the new assertions and the existing Roadmap/chat checks. Record any checks that could not run.
- [ ] Commit only the task files as `feat(web): add Tiny Lantern help in Together`. Leave deployment for a separate request.
