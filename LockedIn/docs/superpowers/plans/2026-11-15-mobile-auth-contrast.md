# Mobile Authentication Contrast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep decorative circles away from mobile authentication text.

**Architecture:** Use the shared authentication stylesheet's existing 600px media query to suppress both panel pseudo-elements. No component or form behavior changes.

**Tech Stack:** Next.js, Sass, Chromium, Vitest.

**Spec:** `../specs/2026-11-15-mobile-auth-contrast-design.md`

## Global Constraints

Hide circles at widths <=600px. Preserve styles above 600px and all existing content, spacing, typography, and form behavior.

## Review Focus

Both pseudo-elements must be hidden; include the 600/601px boundary; retain desktop decoration; preserve visible text and avoid horizontal overflow. Both authentication routes share the same component.

### Task 1: Mobile-only decoration override

**Files:** Modify `apps/web/src/components/styles/authPage.module.scss`.

**Interfaces:** Existing shared `.authTestimonial` panel; no interface changes.

- [x] Run the existing web test suite to establish baseline.
- [x] Run a Chromium regression harness using compiled production Sass at 320, 393, 600, 601, and 1280px. Expect the mobile pseudo-element visibility assertion to fail before implementation.
- [x] Add `display: none` for `.authTestimonial::before` and `::after` in the existing max-width 600px media query.
- [x] Repeat browser checks; expect hidden circles on mobile and visible circles above 600px, readable content and no overflow. Run `npm test` and `git diff --check` successfully.
- [ ] Review the scoped diff, commit the change and design/plan, and push the current feature branch as requested. Do not merge or deploy.

## Verification record

The isolated Sass/Chromium panel check failed before the fix (`320px before` was `block`, expected `none`). After the fix, both decorations were hidden at 320/393/600px, present at 601/1280px, plum remained unchanged, and the panel had no horizontal overflow. This fixture checks the production stylesheet, not full-page authentication flows. All 112 web tests and TypeScript checking passed. Independent read-only review found no actionable issues. Full-page rendering, measured contrast ratios, and authentication behavior were not independently tested by the reviewer; those are unchanged by the scoped pseudo-element override.
