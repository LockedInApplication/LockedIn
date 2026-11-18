# Mutual Lock-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pause new Discovery activity on mutual lock-in without removing chat, and reopen the partner's public profile from chat.

**Architecture:** Keep browse admission separate from conversation eligibility. Use additive consent fields on DiscoveryConnection and existing account locks for atomic promotion; authorize connected profiles and photos through a shared connection-scoped policy.

**Tech Stack:** Fastify, Prisma/Postgres, Next.js, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-17-mutual-lock-in-design.md`

## Global Constraints

- Existing conversations and their messages remain usable: locking in must never remove chat access.
- Never reinterpret earlier choices or already-promoted spaces as exclusivity consent.
- Preserve blocking, moderation, publication and approved-photo boundaries.
- No new dependencies; no production writes/deploy without a separate release request.

## Review Focus

- An old client posts build consent without accepting lock-in terms: reject it.
- Two confirmations race with invitations or another promotion: serialize on accounts.
- Browse access is disabled but an existing chat sends/loads: allow it safely.
- A profile is paused, suspended or its photo revoked: distinguish pause from withdrawn authorization.
- The relationship ends or a stale tab attempts to unpause: never silently republish.

### Task 1: Explicit lock-in and separate discovery/chat admission

**Files:** `services/api/prisma/schema.prisma`, additive migration `20261118001000_discovery_mutual_lock_in/migration.sql`, `services/api/src/features/discovery/discovery-lock-in.ts`, `discovery-promotion.service.ts`, `discovery-connection.view.ts`, `discovery-connection.service.ts`, `discovery.schemas.ts`, `discovery.policy.ts`, `discovery.types.ts`, `discovery-profile.service.ts`, `discovery-candidates.service.ts`, `discovery-chat.routes.ts`; tests in the existing discovery test directory.

**Interfaces:** `isDiscoveryLockedIn(tx, userId): Promise<boolean>`; readiness body `{ready, consentVersion, exclusiveConsent:true}`; capability fields `canChat:boolean` and `discoveryLockedIn:boolean`; connection `lockedIn:boolean`. Consent fields are `lowLockInVersion`, `highLockInVersion`, `lockedInAt`.

- [ ] Add failing integration assertions for legacy consent rejection, one-sided/revoked consent, concurrent idempotent promotion, both profiles paused, candidates hidden and invitation/unpause bypass denied.
- [ ] Add tests showing existing message reads/sends survive mutual lock-in, but blocking and suspension still deny access. Include old readiness rows and existing promoted spaces without `lockedInAt`.
- [ ] Run targeted tests using `services/scripts/verify-discovery.mjs` in its disposable localhost database; confirm failures reflect missing behavior.
- [ ] Complete the additive migration and partial implementation already in this worktree. Keep conversation admission independent of lock-in. Permit messaging in the mutually locked-in promoted pair, without reopening legacy closed chats. Enforce candidate/invitation restrictions under existing locks.
- [ ] Regenerate Prisma, rerun targeted tests, then all API integration tests. Verify legacy fixture preservation and relationship-ended/manual-unpause behavior.
- [ ] Commit only this task's files after verification/review.

### Task 2: Connection-scoped public profile and media

**Files:** Create `services/api/src/features/discovery/discovery-connected-profile.service.ts`; modify `discovery-connection.routes.ts`, `photos/photo-access.service.ts`; create `test/discovery-connected-profile.integration.spec.ts`.

**Interfaces:** `GET /api/discovery/connections/:id/profile` returns the normal owner-scoped public-profile envelope. `findConnectedProfile(tx, actorId, profileId)` supplies authorization for profile media without broadening ordinary candidate visibility.

- [ ] Write failing tests: participant sees published fields/approved photos after acceptance and lock-in; outsider gets 404; blocked/closed/expired/unpublished/suspended profile gets 404; drafts and precise locations never appear. Revoked media remains denied.
- [ ] Run targeted tests and confirm failure.
- [ ] Implement shared connection/profile authorization and use it for the profile endpoint and ordinary media fallback. Retain existing media recheck before/after provider reads.
- [ ] Run profile and photo integration suites, including paused-versus-withdrawn publication and stale asset cases.
- [ ] Commit only verified task files.

### Task 3: Consent and name-to-profile UI

**Files:** `apps/web/src/features/discovery/BuildTogetherPanel.tsx`, `ConnectionPage.tsx`, `discovery.types.ts`, `ConnectionStatus.tsx`, `connection-status.ts`, `DiscoveryChat.tsx`; create `ConnectedProfile.tsx`; update web tests and `docs/discovery-chat-rollout.md`.

**Interfaces:** UI sends `exclusiveConsent:true` only after explicit confirmation; connected-profile component takes `connectionId` and a close callback; render existing `DiscoveryProfileCard` without reply actions.

- [ ] Add failing tests for explicit lock-in copy/confirmation, withdrawal, legacy promoted copy, retained chat when `canDiscover:false, canChat:true`, and name-to-profile navigation with no reply/invitation actions.
- [ ] Run tests to confirm failures, then implement confirmation and read-only profile view with loading/error/retry/return-to-chat states. Preserve chat component state while viewing profile.
- [ ] Verify keyboard focus return, mobile layout, chat after promotion, partner profile opening and revoked/blocked profile unavailable states in local browser with synthetic/disposable accounts.
- [ ] Run web/API unit suites, API TypeScript with `--skipLibCheck`, web TypeScript, changed-file ESLint, production web build and `git diff --check`.
- [ ] Review the full branch for privacy/concurrency regressions. Record migration/release steps and hand off without pushing until requested.
