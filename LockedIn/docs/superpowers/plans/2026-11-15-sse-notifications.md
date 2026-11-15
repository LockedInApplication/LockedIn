# SSE Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Durable private notification inbox with authenticated SSE and safe navigation.
**Architecture:** Notification feature owns persistence, task-transition derivation and streaming. Explicit transactional wrappers around successful domain writes compare metadata-only before/after tasks, resolve old tasks, create new records, then signal after commit. UI inbox is independent from journey form state.
**Tech Stack:** Existing Fastify, Prisma/Postgres, Next/React, native EventSource; no new dependency.
**Spec:** ../specs/2026-11-15-sse-notifications-design.md (approved by user).

## Global Constraints

- Preserve current uncommitted navigation work and all existing data/sharing rules.
- No notification emails, browser push, chat, scheduled reminders, Redis or account setup.
- Stream/inbox never contains private responses, summaries, notes, wording or selection values.
- Commit/push only if separately requested; implementation remains in current isolated worktree.

## Review Focus

- Repeated identical submit: task keys derive from entity/phase/version, not request time.
- Relationship ended: eligibility filter removes old inbox access and live checks revalidate.
- Cross-account IDs: read mutation scoped by recipient and active membership.
- Unsent input: stream must never replace overview/remount a form; navigation prompts before discard.
- Lost/reordered signals: reconnect refetches inbox; periodic fingerprint check catches cross-worker changes.

## Task 1: Durable task transition notifications

Files: services/api/prisma/schema.prisma and migration; api/src/features/notifications/{notification.types,notification.tasks,notification.catalog,notification.repository,notification.service}.ts and specs.
Interface: `withNotifications(relationshipId, actorId, work(tx))`; derive tasks from metadata-only relationship snapshot; service persists/resolves task delta with domain write, then signals after commit.
- [x] Write failing tests for before/after delta: no-op silence, match supersedes choice, mutual consent, private Atlas selections, candidate version and completion, step acceptance/reflections.
- [x] Run targeted Vitest and observe missing feature failures.
- [x] Implement task derivation/catalog, Prisma model/migration and repository/service.
- [x] Add explicit tx parameter support to existing transactional services; wrap mutations in atlas/check-ins/conversations/roadmap and invitation acceptance. Keep email outside tx.
- [x] Generate Prisma types, run API tests/typecheck, and verify additive migration in isolated DB.

## Task 2: Inbox HTTP and authenticated stream

Files: notifications/{notification.routes,notification.stream}.ts and specs; journey.routes.ts registration.
Interface: GET inbox with 30/page cursor + unresolved unread count, PUT recipient read, GET stream with generic invalidation only; 15s heartbeat, 10s persisted fingerprint/access check, 4 streams/user.
- [x] Write failing authorization, paging, read/idempotence, stream isolation/cleanup tests.
- [x] Implement bounded store queries, connection registry, resync event, auth/session/access checks and shutdown cleanup.
- [x] Run API suite and actual HTTP streaming checks against test database.

## Task 3: Bell/inbox and safe destination navigation

Files: web/src/features/notifications/{notification.types,notification.client,use-notifications,NotificationBell,NotificationPanel,notification.module.scss,index}; journey WorkspaceHeader/JourneyWorkspace; AtlasView and roadmap target IDs.
Interface: independent bell state, `onOpen(notification)` callback; explicit refresh affordance instead of automatic overview replacement.
- [x] Write failing catalog/client/UI tests for unread, resolved/stale, empty/error and accessible controls.
- [x] Implement one EventSource per workspace, inbox catchup/pagination/read, reconnect handling and abort cleanup.
- [x] Add relevant entity navigation and generic stale target notice; preserve existing section query.
- [x] Track dirty form changes at workspace boundary; prompt before inbox navigation/explicit refresh; never refresh on stream event.
- [x] Run web tests/typecheck/lint/build and real-browser two-user streaming/draft checks.

## Task 4: Final verification and review

- [x] Complete API/web suites and canonical typechecks; git diff --check.
- [x] Isolated Postgres integration: atomic rollback, duplicate suppression, unread/read auth, stream reconnect and Next proxy streaming.
- [x] Fresh-context review, fix important findings with regression tests, record results.
- [x] Apply additive migration to local app DB only after test validation; restart app and verify public stream if available. No resets or real-user test progress.

Execution: user's 'do it' requests implementation now; execute inline without another handoff round. Keep a ledger; report environmental gaps honestly.

## Verification outcome

Implemented in the existing isolated worktree without committing/pushing. API59
unit/boundary tests and web81 tests pass; isolated Postgres integration10/10 pass.
Both canonical typechecks and web production build pass; lint has only the existing
avatar image warning. Real two-user Chrome checks verified live SSE through Next,
draft preservation, cancelled/confirmed navigation, read count, refresh, mobile and
Escape. Independent review identified duplicate create paths and renewed hearing
checks; regression tests reproduced and verified fixes for both. Local migration
is additive and existing application data was preserved.

Public app returns200 and unauthenticated stream401. An authenticated public check
was denied by auto-review because it would send an existing session cookie to the
public ngrok URL; no credential was transmitted. Do not retry without explicit
user approval. Local authenticated streaming is verified.

Follow-up: user explicitly approved the authenticated public check. It passed:
HTTP200, correct SSE content type, and the initial notification event arrived through
ngrok. No credentials or private account/inbox contents were printed.
