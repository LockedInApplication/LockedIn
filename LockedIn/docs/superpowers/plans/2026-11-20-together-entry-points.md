# Together Entry Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make guided conversations and the Roadmap easy to find in Together, and add a direct handoff from shared answers to the check-in’s existing proposal form.

**Architecture:** Together owns navigation and unsaved-input protection. A small presentational component renders the two destinations. The guided check-in owns its existing consent flow and exposes a callback only after reveal. Neither part depends on the new day-one plan API.

**Tech Stack:** React, Next.js, Sass modules, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-20-day-one-roadmap-design.md`

## Global Constraints

- Keep **Together → Our next steps** as the one Roadmap.
- Inbox remains the place to chat; the Roadmap does not post planning activity into the transcript.
- The check-in’s existing next-step action and consent rules remain.
- This first slice is navigation and handoff only. Independent plans and projection of confirmed dates are separately testable backend/UI changes; do not imply that either already works.

### Task 1: Two destinations and a post-reveal handoff

**Files:**
- Create: `apps/web/src/features/journey/components/TogetherDestinations.tsx`
- Create: `apps/web/src/features/journey/together-destinations.module.scss`
- Modify: `apps/web/src/features/journey/JourneyWorkspace.tsx`, `apps/web/src/features/check-ins/SessionStage.tsx`, `apps/web/src/features/check-ins/AlignmentStage.tsx`, `apps/web/src/features/roadmap/NextStepForm.tsx`
- Modify: `apps/web/src/features/journey/workspace-header.module.scss` to keep the mobile dock fixed to the viewport regardless of stylesheet order.
- Test: `apps/web/src/features/journey/components/TogetherDestinations.spec.tsx`
- Test: `services/scripts/verify-shared-messaging-browser.mjs` (navigation scenario)

**Interfaces:** `TogetherDestinations({ onNavigate }: { onNavigate: (view: "conversations" | "roadmap") => void })` uses the existing guarded workspace navigation. `SessionStage` passes an optional `onProposeNextStep: () => void` to `AlignmentStage` only after both consent. The callback navigates to `/journey?view=roadmap#step-propose`; the existing hash handler focuses the proposal form.

- [x] Write tests using `renderToStaticMarkup`: the destinations render one button each for “Guided conversations” and “Our next steps”; `SessionStage` shows “Make this a next step” only after mutual reveal.
- [x] From `apps/web`, run `npm test -- src/features/journey/components/TogetherDestinations.spec.tsx` and verify it fails because the destination component is missing.
- [x] Render visible home actions alongside the existing current-activity card and journey path. Wire the guided handoff to the existing guarded navigation and add `id="step-propose" tabIndex={-1}` to the legacy form section. Never populate the form from people’s answers.
- [x] Run full `npm test`, `npx tsc --noEmit`, targeted ESLint, and `git diff --check`. In the disposable browser fixture, check both entry points at 320, 393, and 1280 pixels; verify the guided handoff focuses the empty proposal form and Inbox still opens chat.
- [x] Commit this slice with `feat(web): connect Together conversations and roadmap`.
