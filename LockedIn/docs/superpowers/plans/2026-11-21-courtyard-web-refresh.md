# Courtyard Web Refresh Implementation Plan

> **For agentic workers:** Use native execution and test before implementing each task.

**Goal:** Bring the chosen Courtyard palette and Figtree typography into LockedIn and give verification actions breathing room.

**Architecture:** Use shared Sass tokens for the product theme and remove homepage-only palette and font overrides. Use actual layout groups on the verification page so its rhythm is consistent in pending, error, and confirmed states.

**Tech stack:** Next.js, React, Sass, Vitest.

**Spec:** User-approved Courtyard preview with Figtree as last previewed, plus the requested verification button spacing fix. This is a web-only change; preserve routes, verification behavior, and existing content flows.

## Task 1: Shared Courtyard theme

- [x] Add a compiled-CSS test of background, text, primary buttons, keyboard focus, and Figtree. Run it against the prior theme.
- [x] Update shared styles in `LockedIn/apps/web/src/styles/_globals.scss`. Use Courtyard canvas #F1F2E8, ink #242F2A, and forest action #365848; keep danger and success distinct.
- [x] Update `LockedIn/apps/web/src/app/page.module.scss` to inherit the shared palette and Figtree. Apply the new surface/selection colors to Discover and Inbox and preserve the homepage pause and reduced-motion behavior.
- [x] Run the appearance tests and production web build.

## Task 2: Verification spacing

- [x] Add rendered-markup coverage of the field/action separation and a compiled-CSS spacing check. Run against the crowded form.
- [x] In `LockedIn/apps/web/src/features/auth/EmailVerificationPage.tsx` and `email-verification.module.scss`, group account actions away from explanatory text; leave at least 24px between the email field and its button without increasing label-to-input distance.
- [x] Run the full web suite and check the pending/expired-link view locally. Verify mobile wrapping and keep resend and status-check behavior unchanged.

Review follow-up: darkened the shared control border and added a regression test for at least 3:1 against both Courtyard surfaces. All 267 web tests and the production build passed.
