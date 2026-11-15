# Sender status and private invitation boundaries implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.

**Goal:** Sender status/withdrawal, seven-day decline pause, and owner-managed private invitation blocks.
**Architecture:** Extend the invitation slice with policy, status and block services. Use additive lifecycle/block records and ordered transactional user locks; notification transport only signals quiet updates. Independent invitation UI data never replaces journey drafts.
**Tech Stack:** Existing Fastify/Prisma/Postgres, Next/React, SSE; no new dependencies.
**Spec:** ../specs/2026-11-15-sender-invitation-status-design.md (approved).

## Global Constraints

- Preserve current uncommitted received-invitation implementation and existing progress.
- No blocked/reason/account-existence fields in sender DTOs or error responses.
- No decline/block alert, email, read receipt, automatic reminder, or auto acceptance.
- Decline pause is directional and seven days; invitation block prevents either direction until removed by its owner.
- Existing shared relationships are unchanged. No database reset, real test invitations/emails, commit or push requested here.

## Review Focus

- Exactly seven days vs one millisecond earlier; repeated decline never extends original time.
- Reverse invitation remains possible during pause, but not during a block; two independent blocks remain independent.
- Concurrent creation/acceptance/block/unblock/withdrawal must respect server rules and close stale links.
- Sender card exposes only recipient email already entered and neutral status; no account/block disclosure.
- Quiet status refreshes/read requests never alert the sender or discard unsent answers.

## Task 1: Policy and durable server enforcement

Files: prisma/schema.prisma + new migration; invitations/invitation.policy.ts, invitation-access.service.ts, invitation-status.service.ts, invitation-blocks.service.ts; existing invitation service/routes/notification reconciliation.
Interfaces: existing create/accept/decline plus listSentInvitations(userId,cursor), withdrawInvitation(id,userId), blockInvitationSender(token,user), listInvitationBlocks(userId,cursor), unblockInvitations(id,userId).
- [x] Write failing pure time-boundary and isolated-DB tests for status, pause, block privacy, concurrency, withdrawal/expiry and owner authorization.
- [x] Add explicit declinedAt and withdrawnAt; backfill prior declines from existing updatedAt. Add directional InvitationBlock records with unique owner/target.
- [x] Extract common locks and eligibility helpers; enforce policy under ordered user locks on create and accept, close pending pair invites on block, preserve original decline time.
- [x] Add recipient block/review controls and sender-only/owner-only management routes, strict page/cursor bounds and neutral DTOs/errors.
- [x] Run API suite/types and complete real-DB regression tests in disposable database, no email network calls.

## Task 2: Sender cards and block management UI

Files: invitations/InvitationManager, InvitationManagerContent, SentInvitations, use-invitation-list, invitation-management.client/types/styles and tests; review components, WorkspaceHeader/ConnectionStage/JourneyWorkspace and notification stream hook integration.
Interfaces: sender card embedded before connection; header opens exclusive manage screen; review adds confirmed Block action and decline visibility explanation; own block list has explicit Unblock.
- [x] Write failing SSR tests for neutral statuses, pending-only withdrawal, decline notice and explicit private block controls.
- [x] Implement independent paginated lists and quiet refresh via existing SSE signal, plus bounded visible-page polling for cross-worker recovery.
- [x] Keep management/review exclusive; dirty-input confirmation on entry; unblock never restores invitations/connections.
- [x] Run web suite/types/lint/production build.

## Task 3: Review and verify locally

- [x] Real Chrome two-user test with isolated data: sender pending/quiet decline, pause, private block/owner unblock, withdrawal, mobile and no background draft loss.
- [x] Fresh independent review; fix important findings RED→GREEN without a second review round.
- [x] Validate migration before additive local application; restart web, verify public reachability.
- [x] Update docs/ledger and report uncommitted state separately from baseline push.
