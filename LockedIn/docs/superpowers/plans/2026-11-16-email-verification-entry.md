# Email Verification Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make verification discoverable for unverified users without restricting normal LockedIn.

**Architecture:** Keep the existing Better Auth delivery and signed-link handling. Add guarded entry actions to Profile and Discovery; extract the resend page into an account-scoped verification screen whose transient React state never overrides the server's verification field.

**Tech Stack:** Existing Next.js, React, Better Auth, Sass, Vitest; existing browser fixture tooling.

**Spec:** `docs/superpowers/specs/2026-11-16-email-verification-entry-design.md`

## Global Constraints

- Database `User.emailVerified` and backend authorization remain the source of truth.
- Normal LockedIn remains usable; Discovery continues requiring a verified email and its existing pilot/safety gates.
- No automatic retries or emails on page load; successful requests are not proof of delivery.
- No email addresses in new URL parameters, query-based verification success, bypass, new provider, production configuration changes, or unrelated header changes.
- Use existing dirty-navigation guards; preserve account ownership across async requests.
- Resend credentials and an authorized sender remain operator prerequisites, not code defaults.

## Review Focus

- Opening `/verify-email` without query parameters must not claim verification.
- `pending=1` must show a usable resend form, not only instructions.
- Provider exceptions must clear pending state and show retryable errors without leaking secrets.
- A response for an old account must not appear in a newly signed-in account's screen.
- Stale session-cookie status must not make Check again falsely report unverified or verified.

---

### Task 1: Shared verification screen and state

**Files:**
- Modify: `apps/web/src/app/verify-email/page.tsx` (thin Suspense wrapper).
- Create: `apps/web/src/features/auth/EmailVerificationPage.tsx` (account-scoped screen).
- Create: `apps/web/src/features/auth/email-verification.ts` (typed request/check helpers).
- Create: `apps/web/src/features/auth/email-verification.spec.ts` (request/status regressions).
- Create: `apps/web/src/features/auth/EmailVerificationPage.spec.tsx` (rendered states).

**Interfaces:** Consume existing `authClient.useSession`, `sendVerificationEmail` and `getSession` with cookie-cache disabled (verify installed API types). Produce the shared screen and typed server-session check; no new auth store. Signed-in forms use the current email; signed-out forms retain manual entry. A keyed account boundary discards old screen state.

- [ ] Write failing tests: pending and bare URL both show resend, bare URL never shows verified; server verified/unverified/error results determine feedback; provider error/throw clears busy; repeated clicks while pending make one request; account change invalidates old response; check uses fresh server state, and never trusts `verified` query parameters. Use existing server-render tests for markup and controlled promises for async transitions; browser tests cover interactive behavior.
- [ ] Run `npm test -- src/features/auth` in `apps/web`; observe behavioral failures before implementation.
- [ ] Implement request/check helpers and account-scoped screen. Always render resend controls for unverified/unknown status, with accessible alerts/status, 44px controls, and no misleading mandatory-login copy. A fixed callback returns to `/verify-email?pending=1`, where server status is checked. Show safe fixed Discovery/settings links after confirmed verification; keep explicit Check again available for signed-in unverified users. Don't print credentials or verification URLs.
- [ ] Run focused tests, complete web suite and `npx tsc --noEmit`; all new tests and existing tests must pass.
- [ ] Commit only task-owned screen/helpers/tests.

### Task 2: Profile/Discovery entry actions and end-to-end acceptance

**Files:**
- Modify: `apps/web/src/features/profile/ProfileSecurity.tsx`.
- Modify: `apps/web/src/features/discovery/DiscoverPage.tsx`, `DiscoveryShell.tsx` (pass authenticated verification boolean through account-scoped context, not a new backend gate).
- Create: focused ProfileSecurity and Discovery unavailable-state rendering tests beside those features.
- Add: task-scoped browser regression under `apps/web/scripts/` using installed Playwright, no production writes or real emails.

**Interfaces:** Profile action consumes authoritative `Profile.emailVerified` and existing `onLeave(path)`. Discovery consumes the authenticated user's verification status plus existing `me.canDiscover`; verification prompt must not promise access when other gates fail. Both navigate to `/verify-email?pending=1` through existing leave guards.

- [ ] Write failing tests proving unverified users see Verify email, verified users don't, existing discovery unavailable/history behavior remains, and Profile action calls guarded navigation rather than bypassing dirty state.
- [ ] Run focused tests to observe missing actions before implementation.
- [ ] Add the entry actions and clear copy; keep existing API admission logic untouched. Reuse styles; do not include unrelated dirty header changes.
- [ ] Run whole web suite, types, lint, and production build. Exercise signed-in/out resend, mocked delivery success/failure without external email, account switching, fresh status check and dirty navigation in local browser; inspect 393px and desktop layouts. Document exact tests/results and remaining operator email setup.
- [ ] Commit task-owned code/tests and verification evidence; use one independent final review under executing-plans, addressing Important findings with observed regression tests. Do not push or change Render without explicit authorization.

## Execution

Native execution is recommended: two tightly connected frontend tasks, existing worktree isolation and no backend schema change. Preserve the user's earlier preference for root implementation, pending plan confirmation. The final reviewer is independent; production email delivery cannot be claimed from local mocked-provider checks.

## Self-review

Both entry locations, existing resend behavior, server-authoritative refresh, account isolation, dirty navigation, delivery errors, mobile verification and operator prerequisites are covered above. Existing backend eligibility/verification gates remain unchanged. No additional dependencies or production database access are planned.

## Execution record

Tasks 1 and 2 completed with observed regression failures before implementation and green full web suites after each. Implementation checkpoints: `d30eb23`, `254f8c6`. Final independent review: ready to merge, no findings. See `docs/email-verification-handoff.md` for test evidence, decisions and operator prerequisites. No push, deployment or live email delivery was performed.
