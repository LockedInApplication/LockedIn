# Full Atlas Chapter Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline, preserving the user's earlier native execution choice.

**Goal:** Reopen completed Atlas chapters from their history without losing current progress.

**Architecture:** Add an authorized read-only chapter endpoint and a reusable button/native dialog. Keep fetched historical data separate from the current chapter and its forms.

**Tech Stack:** Existing Next.js, React, Sass, Fastify, Prisma, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-14-full-atlas-chapter-design.md`

## Global Constraints

- Preserve the existing in-progress chapter, private answers, database records and migrations.
- Only members of the chapter's relationship may fetch a SHARED chapter.
- Historical views offer no editing, approval, or submission controls.
- Support legacy SHARED chapters without proposal/approval records.
- Keep prior uncommitted completed-history work and unrelated original-checkout files intact.

## Review Focus

- Unauthorized or unfinished chapter IDs return no historical responses.
- Own/partner summaries and confirmation statuses are attributed correctly.
- Missing legacy responses remain readable without inventing confirmation.
- Closing, Escape, retry and request cancellation preserve current form state and keyboard focus.
- Latest completed chapter and older entries each provide the viewer.

### Task 1: Authorized historical chapter endpoint

**Files:** Atlas API `atlas-chapter.service.ts`, `atlas-chapter.routes.spec.ts`, `atlas.routes.ts`.
**Interfaces:** `getCompletedAtlasChapter(chapterId: string, userId: string)` returns an explicit completed-chapter payload or null; GET `/api/journey/atlas/:chapterId` consumes it.

- [x] Write endpoint tests for member/partner views, legacy version zero, logged-out requests, other relationships, unfinished and missing IDs, and safe field serialization.
- [x] Observe failures before adding the endpoint.
- [x] Implement a membership/SHARED-filtered query and readonly route, returning 401 or 404 as appropriate with `Cache-Control: private, no-store`.
- [x] Run API tests and TypeScript. Expected: pass; no writes.

### Task 2: Full chapter button and viewer

**Files:** Atlas frontend `AtlasChapterButton.tsx`, `AtlasChapterDialog.tsx`, `AtlasChapterContent.tsx`, `atlas-chapter.module.scss`, types, history/discovery integration, and rendering tests.
**Interfaces:** `AtlasCompletedChapter`, `AtlasChapterButton({chapterId, wordTitle})`, dialog close callback, readonly content payload.

- [x] Write failing tests for history/current chapter buttons and full saved content without mutation controls, including incomplete legacy records.
- [x] Implement the button and native dialog with loading/error/retry, abort-on-close, Escape dismissal and focus restoration. Implement paired responses, understanding checks and final agreement.
- [x] Attach buttons to every historical entry and the current SHARED chapter. Preserve current-stage component identity.
- [x] Run frontend tests, lint, TypeScript and production build. Expected: pass with the existing avatar warning only.

### Task 3: Review and live verification

- [x] Review authorization, readonly rendering, dialog lifecycle, and compatibility with actual saved legacy Support data.
- [x] Run both test suites and relevant build/type checks; do not create test database records or send emails.
- [x] Restart the scoped API/web processes from the updated worktree; preserve the existing ngrok tunnel.
- [x] Verify authenticated historical GET for both partners, unauthenticated rejection, and the public app serving the viewer assets.
- [x] Record verification and preserve a recoverable implementation checkpoint. No merge or unrelated changes.

## Verification record

- 38 web tests and 43 API tests pass; frontend lint has only the existing avatar image warning.
- Frontend TypeScript and webpack production build pass; canonical services type check (`npm exec tsc -- --noEmit --skipLibCheck`) passes. The alternate API subdirectory tsconfig reports 12 pre-existing unchecked-index errors in unchanged atlas.state.ts and atlas.service.spec.ts.
- Superpowers review found a missing-response edge case in the current SHARED stage. Two failing regression tests reproduced it; the completed-stage fallback now always provides the viewer.
- Real Chrome verification used existing member sessions without logging in or submitting forms: both partner views, private cache, logged-out/unfinished rejection, complete saved content, read-only controls, Close/Escape, focus restoration, retry, pending-read cancellation, preserved current draft, responsive mobile layout, no runtime errors or mutating requests, and unchanged chapter database records.
- Production web and API run from this worktree; existing ngrok tunnel is preserved.
