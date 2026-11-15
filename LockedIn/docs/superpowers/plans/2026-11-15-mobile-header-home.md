# Mobile Header and Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax for tracking.

**Goal:** Mobile account disclosure and an action-first Home without desktop or behavior regressions.
**Architecture:** Feature-scoped header/account components and SCSS; reposition the one existing next-action component in the workspace shell with responsive slots, avoiding duplicate forms/IDs. Reuse every existing callback.
**Tech Stack:** React/Next.js, SCSS, Vitest, browser checks.
**Spec:** `docs/superpowers/specs/2026-11-15-mobile-header-home-design.md`

## Global Constraints
Preserve desktop appearance and existing guarded callbacks. No backend/schema/consent changes. No push/deploy. Mobile targets at least44px. Use existing isolated worktree.

## Review Focus
- Dirty forms remain protected when menu actions navigate.
- Escape/outside-click and desktop resizing do not strand focus.
- Bell popup and account disclosure cannot obscure one another.
- Mobile CTA fits390×844 with long partner names and no duplicate action card.
- Desktop visual/focus order remains consistent; no interactive CSS-order inversion.

### Task 1: Compact mobile account header
Files: modify `apps/web/src/features/journey/components/WorkspaceHeader.tsx`; create `MobileAccountMenu.tsx`, `workspace-header.module.scss` and component tests in that feature.
Interfaces: retain WorkspaceHeader's props; MobileAccountMenu consumes user, optional onProfile/onInvitations and async onSignOut callbacks, shared notification node remains singular.
- [x] Write/observe failing render and browser tests for the labeled disclosure,44px targets, Escape/outside dismissal, keyboard access, and guarded selection.
- [x] Implement compact header with existing desktop actions and one mobile disclosure. Avoid menu roles requiring arrow-key menus. Close safely on Escape/outside selection/desktop resize; prevent bell and avatar overlays from overlapping.
- [x] Run focused tests then full web suite; checkpoint only scoped files if committing is appropriate.

### Task 2: Action-first mobile Home and verification
Files: modify `JourneyWorkspace.tsx`, `next-action.module.scss`; add focused layout tests/browser coverage. Preserve existing NextActionCard callbacks; optional cardRef supports breakpoint focus handoff.
Interfaces: one action-card instance; reuse current overview, busy, guarded onNavigate and onFocusCurrent callbacks.
- [x] Write browser regression asserting card CTA above introduction/nav on390px, exactly one action-card heading, no overflow at320/360/390/430px, desktop intro/nav/card order.
- [x] Implement compact Home greeting and responsive positioning. Prefer a small Home lead component with one subtree rendered in an appropriate slot by breakpoint over CSS reordering interactive controls. Maintain notices, partner details, and existing Home session stage.
- [x] Verify disconnected/focused suggestion/invitation/profile navigation, long names, busy state, menu callbacks and draft cancel. Run web tests, typecheck, lint, webpack build, diff check.
- [x] Request independent whole-change review, fix important findings with regression tests, report results and leave undeployed.

## Execution
User's “yes do that” authorizes implementing the approved compact design here, continuing the inline approach already selected. No further planning approval loop. Tasks share only the workspace shell; no backend interfaces change.
