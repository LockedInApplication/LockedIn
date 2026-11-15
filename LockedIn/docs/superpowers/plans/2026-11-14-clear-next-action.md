# Clear Next Action Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline, preserving the user's previously selected native execution method.

**Goal:** Show one clear next action above the Home map and replace three abstract navigation labels.

**Architecture:** Derive an action from existing JourneyOverview data in a pure feature-local helper, render a small card with one navigation callback, and use scoped Sass for the card/navigation. Reuse all existing screens and guards.

**Tech Stack:** React, Next.js, Sass modules, Vitest and existing bundled Playwright.

**Spec:** `docs/superpowers/specs/2026-11-14-clear-next-action-design.md`

## Global Constraints

- Existing sharing rules, backend, data and email delivery remain unchanged.
- Never submit/consent from the next-action button; it navigates or focuses only.
- No relationship means no card; never include private answer values in its copy.
- Preserve the existing root Sass cascade; add scoped modules.
- User approved the two concrete recommendations; resolve routine implementation details without another approval round.

## Review Focus

- One partner can be finished while the other still has an action; waiting copy and privacy must match the viewer.
- A future revisit date must not produce a premature reflection CTA; use the server's reflectionAvailable.
- A partner's proposal must be reviewed rather than presented as already accepted.
- Atlas opens after both submit, unlike conversations; never imply separate reveal consent there.
- Long labels and the single CTA must remain readable and keyboard accessible on mobile.

### Task 1: Derive and render the next action

**Files:** Create `apps/web/src/features/journey/journey.next-action.ts`, `journey.next-action.spec.ts`, `components/NextActionCard.tsx`, `components/NextActionCard.spec.tsx`, `next-action.module.scss`.

**Interfaces:** `getNextAction(overview: JourneyOverview): NextAction | null`; NextAction has title, description, buttonLabel, target (`current`, `conversations`, `atlas`, `roadmap`) and waiting. Card consumes overview, busy, onNavigate(view), onFocusCurrent().

- [x] Write failing branch tests for missing/complete/one-sided responses and reveal consent, partner proposal priority, due/future reflections, conflicting/waiting topic choices, and Atlas submission/privacy states. Assert the selected destination and waiting state; do not duplicate implementation in expected values.
- [x] Observe failures, implement the pure helper and card, and verify rendered card has one navigation button with no private answers or mutation form.
- [x] Run the entire web suite. Expected: pass.

### Task 2: Integrate and rename navigation

**Files:** Modify `JourneyWorkspace.tsx`, `components/WorkspaceNav.tsx`, `components/SharedJourneyPath.tsx`; create `workspace-nav.module.scss`.

**Interfaces:** Consume Task 1's card. Preserve existing WorkspaceView keys. Navigation labels are Home, Conversations, Understand each other, Our next steps, Past conversations.

- [x] Place card before SharedJourneyPath in the existing Home fragment; reuse a keyboard-friendly focusCurrentAction callback for card/map. Preserve SessionStage identity and unsent form state.
- [x] Rename three destination labels and corresponding map CTA text; update scoped nav spacing for desktop/mobile without changing root stylesheet output.
- [x] Run web tests, lint, TypeScript and webpack production build. Expected: pass, with existing avatar image lint warning only.

### Task 3: Review and live verification

- [x] Final review of new state logic, privacy copy, form identity and responsive/accessibility behavior. Independent reviewer was dispatched but failed due to account usage limit; author performed the final review instead.
- [x] Verify in Chrome with controlled GET overview fixtures: each CTA opens its existing destination; current action receives focus; an unsent form survives rerenders; waiting and future reflection states never claim premature progress. No mutation requests or DB writes.
- [x] Rebuild and restart scoped web process on 3001, preserve API/ngrok, confirm the public app serves updated assets.
- [x] Record test/build/browser results and hand off the live changes. No push or merge requested in this task.

## Verification

64 frontend tests pass, including 23 derived-action cases and 3 card rendering checks. Frontend TypeScript and webpack production build pass. ESLint has only the pre-existing avatar image warning. The legacy Sass checksum remains unchanged.

Real Chrome checks passed for every renamed destination, first conversation CTA, current-task focus, unsent answer preservation, waiting/reveal review, and partner proposal navigation without acceptance. At 390×844 the primary button is visible without scrolling and all labels fit without horizontal overflow. No runtime errors or mutation requests. The mobile screenshot was inspected. Public ngrok journey returns 200 and serves both updated feature bundles.
