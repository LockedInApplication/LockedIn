# Private Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver an authenticated private profile with working identity, password, notification, and blocking controls.

**Architecture:** Feature-based profile slices in the existing Next.js web app and Fastify API. Session-derived settings endpoints persist additive User fields; centralized notification/email policy enforces preferences. Reuse Better Auth security APIs and invitation boundaries.

**Tech Stack:** Existing Next.js 16, React 19, TypeScript, SCSS modules, Fastify, Prisma/PostgreSQL, Better Auth, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-15-private-profile-design.md`

**Delivery status (November 15, 2026):** Implemented locally and independently reviewed.
All four review findings have regression coverage and are fixed. Verification: 104 web
tests, 84 API unit tests, 37 disposable-database integration tests; desktop/mobile browser
checks with modern and compatibility navigation, production build, canonical type checks,
and diff checks pass. Lint has one pre-existing avatar-image warning, no errors.
The pre-profile baseline was pushed as `94442b2`; the user subsequently authorized committing
and pushing the profile and styled-confirmation changes together on the feature branch.
Evidence and detailed task completion are recorded in this plan's `.superpowers/sdd` ledger.

## Global Constraints

- Private `/profile`; only chosen display name and avatar visible to partner.
- Display name trimmed, 1–80 characters; preset avatars only, reset to initials.
- Preserve existing behavior with both activity channels initially enabled.
- Security email cannot be disabled; disabling activity does not disable SSE refresh.
- No email changes, photo uploads, export, deletion, or destructive resets in this release.
- Preserve existing uncommitted invitation changes; no automatic commits or pushes.
- Test with synthetic users only. Additive migrations; never reset the database.

## Review Focus

- Account switch while loading/saving: never expose the previous person's settings.
- Pending invitation notification backfill: disabling and re-enabling must not replay suppressed activity.
- Draft navigation from workspace and profile: cancellation preserves unsaved values.
- Name/avatar defaults and partner refresh: old accounts render correctly without manual migration edits.
- Password failure and session rotation: failures keep the form usable; success invalidates other sessions without losing the active session.

## File responsibilities

All paths below relative to `LockedIn/`.

- API `services/api/src/features/profile/`: schemas, owner-scoped persistence, routes, and tests.
- API `features/notifications/notification-preferences.ts`: reusable delivery decision helpers, separate from profile HTTP.
- Web `apps/web/src/features/profile/`: typed client, account-scoped loader, page composition, independent details/security/preferences forms, avatar presets, styles, and tests.
- Existing invitation feature: extract reusable blocked-account section without moving policy logic.
- Existing journey/header/views: add profile navigation and consume the shared avatar representation.

### Task 1: Owner-scoped persisted settings

**Files:** Add `services/api/src/features/profile/profile.schemas.ts`, `profile.service.ts`, `profile.routes.ts`, `profile.routes.spec.ts`; modify `services/api/src/app.ts`, `services/api/prisma/schema.prisma`; add additive migration.

**Interfaces:** `GET /api/profile` returns `{id,email,emailVerified,displayName,avatarPreset,activityEmails,inAppActivity}`. `PUT /api/profile/details` accepts only `{displayName,avatarPreset}`. `PUT /api/profile/notifications` accepts only `{activityEmails,inAppActivity}`. Mutation replies return the persisted profile DTO. User identity always comes from `requireUser`.

- [ ] Write route tests asserting unauthenticated requests return 401; attempts to submit `id`, `email`, or unsupported fields return 400; another user's settings cannot be targeted.
- [ ] Add schema tests: whitespace-only/81-character names fail; surrounding whitespace trimmed; only `initials`, `spark`, `sun`, `moon`, `leaf` avatar values accepted; toggle values must be booleans.
- [ ] Run `npm test -- api/src/features/profile` from services and confirm failures before implementation.
- [ ] Add `avatarPreset String @default("initials")`, `activityEmails Boolean @default(true)`, and `inAppActivity Boolean @default(true)` to User; generate migration/client using existing Prisma scripts. Inspect SQL to ensure only additive columns.
- [ ] Implement strict Zod schemas, narrow DTO mapping, session-derived persistence and routes; register profile routes in `app.ts`. Return private/no-store responses; follow existing error conventions and origin protection for writes.
- [ ] Run focused tests and API TypeScript check; verify old-user defaults with a disposable database fixture. Do not touch real preferences.

### Task 2: Enforce notification preferences centrally

**Files:** Add `services/api/src/features/notifications/notification-preferences.ts` and `.spec.ts`; modify `notification.service.ts`, `notification.repository.ts`, `notification.stream.ts`, `features/invitations/invitation-notifications.service.ts`, `features/journey-notifications/journey-email.service.ts`; extend affected integration tests.

**Interfaces:** `activityEmailAllowed(email:string):Promise<boolean>` returns true for unregistered recipients; `inAppActivityAllowed(tx,userId):Promise<boolean>` reads owner preference. Existing broker's `publish(userId, activity=false)` remains state invalidation without an activity banner.

- [ ] Write failing tests: missing preferences preserve enabled behavior; disabled email suppresses relationship email only; disabled in-app creates no visible activity and still publishes quiet refresh; one person's preferences never suppress the other's delivery.
- [ ] Add invitation lifecycle fixture: invite arrives while disabled, recipient opens notifications while disabled, re-enables, then opens again; no old invitation alert is replayed, but invitation remains visible in the invitation list.
- [ ] Run focused tests to observe failure.
- [ ] Implement checks inside centralized delivery and persistence functions. Keep resolution/update work intact; don't gate business transactions on channel preferences.
- [ ] Prevent backfill replay with durable suppressed invitation occurrence handling (for example, a resolved notification marker excluded from list/count). Preserve uniqueness/idempotency and account ownership checks.
- [ ] Ensure existing notification history remains readable; no retrospective deletion. Keep security email functions outside the relationship-email gate.
- [ ] Run notification/invitation/email tests including stream behavior and disposable integration suite.

### Task 3: Profile page, details, avatars, navigation

**Files:** Add `apps/web/src/app/profile/page.tsx`; `features/profile/profile.types.ts`, `profile.client.ts`, `use-profile.ts`, `ProfilePage.tsx`, `ProfileDetails.tsx`, `ProfileAvatar.tsx`, `profile.module.scss`, corresponding `.spec.tsx`; modify journey `components/WorkspaceHeader.tsx`, `JourneyWorkspace.tsx` and relevant owner/partner view DTOs.

**Interfaces:** Web `Profile` matches Task 1 DTO. Client `loadProfile(signal)`, `saveProfileDetails(input)`, `saveNotificationPreferences(input)` use same-origin credentials and no-store. Shared `ProfileAvatar({name,preset})` renders deterministic code-native presets and initials; no arbitrary image URLs.

- [ ] Write failing SSR/client tests for private-page loading/error, correct name/avatar defaults, accessible avatar radio labels, save feedback and validation. Add account-switch test ensuring a late prior-account response cannot populate the current form.
- [ ] Add navigation tests: existing workspace dirty confirmation cancels profile entry; profile back-navigation cancel preserves edits; successful save allows exit. Test browser unload guard separately from internal navigation.
- [ ] Run focused tests and observe failure.
- [ ] Implement account-scoped fetch lifecycle, authenticated page redirect to existing login with safe return URL, small details form, built-in avatars, and name/avatar visibility explanation.
- [ ] Add visible Profile & settings entry to header using existing workspace draft guard; profile Back to our space goes to `/journey`. Preserve invitation links and notification controls.
- [ ] Extend narrow owner/partner journey DTOs and render chosen avatars in existing identity cards, with fallback for older fixtures. Refresh partner identity on normal data refresh without revealing private fields.
- [ ] Implement restrained responsive paper/plum styling, keyboard focus and status/alert regions; run unit tests and web TypeScript check.

### Task 4: Account security and persisted notification forms

**Files:** Add `features/profile/ProfileSecurity.tsx`, `ProfileNotifications.tsx`, security client helper and tests; modify `ProfilePage.tsx`.

**Interfaces:** `changeProfilePassword({currentPassword,newPassword,confirmPassword})` validates confirmation locally then delegates `authClient.changePassword({currentPassword,newPassword,revokeOtherSessions:true})`. No custom password storage/API. Notification form consumes Task 1 DTO and client.

- [ ] Inspect installed Better Auth types and runtime implementation for supported password bounds, session rotation and error response shapes (exclude source maps). Add tests for incorrect current password, mismatched confirmation, policy limits and successful other-session revocation.
- [ ] Test read-only email/actual verification status, security email exception copy, independent notification toggles, failed saves preserving values, and successful saves updating baseline dirty state.
- [ ] Run tests to verify failures.
- [ ] Implement forms using installed auth contracts; never log passwords; clear passwords after success and on unmount. Keep errors generic where appropriate and disable duplicate submissions.
- [ ] Wire existing sign-out and password recovery; report recovery request acceptance rather than inbox delivery. Guard sign-out if profile edits are dirty.
- [ ] Run focused tests and a disposable-auth integration check for password/session behavior.

### Task 5: Reuse blocked-account controls

**Files:** Add `apps/web/src/features/invitations/InvitationBlocks.tsx` and tests; modify `InvitationManager.tsx`, invitation exports, and profile composition.

**Interfaces:** `InvitationBlocks({revision=0})` owns existing list hook/error/loading/pagination/unblock confirmation and renders existing `OwnedInvitationBlocks`. No API or policy changes.

- [ ] Add failing tests for empty/loading/error states, pagination, cancel/confirm unblock and privacy explanation.
- [ ] Extract current block section into the shared component and render it in both profile and invitation manager. Preserve seven-day pause wording and existing confirmation.
- [ ] Run profile/invitation UI tests; verify neither entry point renders another person's blocks after account switch.

### Task 6: Verification and handoff

**Files:** Update plan checkboxes and any necessary tests; no unrelated cleanup.

- [ ] Run full web tests, `npx tsc --noEmit`, lint, and `npm run build -- --webpack` from web. Run API unit tests and TypeScript check using repository configuration.
- [ ] Run disposable database integration checks for profile ownership/defaults, preference suppression/backfill, security exceptions and session revocation.
- [ ] Review full feature diff against design: no deletion enabled, preferences private, safe mutation origins, shared avatars only, no draft-loss regression, no disabled SSE refresh.
- [ ] Browser-check desktop and 390px mobile: header entry, details save/reload, avatar reset, password errors, notification persistence, blocked-list pagination, sign-out and unauthenticated redirect. Use synthetic accounts and inspect horizontal overflow/console errors.
- [ ] Request independent final code review, resolve actionable findings and rerun affected verification.
- [ ] Report completed features and exact verification; distinguish mocked checks from real integration evidence. No commit/push without user request.

## Plan self-review

Spec coverage: identity/security/preferences/safety/navigation covered by Tasks 1–5;
architecture/privacy/regressions covered throughout and Task 6. Deferred export/deletion
are explicit approved non-goals. Review-focus cases each have an owning test above.
No additional dependencies or changes to consent/relationship business rules are needed.
