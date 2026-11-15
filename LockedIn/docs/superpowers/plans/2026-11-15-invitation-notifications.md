# Invitation Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.

**Goal:** Notify B before connection and require explicit review/acceptance.
**Architecture:** Invitation services own transactional lifecycle and inbox reconciliation.
Notification transport includes invitation-backed records without weakening relationship access.
**Tech Stack:** Existing Fastify/Prisma/Postgres, Next/React, native SSE, no new dependency.
**Spec:** ../specs/2026-11-15-invitation-notifications-design.md

## Global Constraints

- No automatic acceptance, answer reveal, real test emails, database reset or extra push.
- Pre-existing active relationship notification permissions remain unchanged.
- Tokens are returned only by recipient-authorized review, never notification payloads.

## Review Focus

- Opening a legacy link must not POST acceptance; test browser network and relationship count.
- Same invite resent: one pending invitation/notification; exercise concurrent sends.
- Signup after invitation: authenticated inbox reconciliation discovers it once.
- Another account's token/ID:404, no inviter information or read mutation.
- Expiry/accept/decline: unread clears and stale buttons never perform another connection.

## Task 1: Durable pre-connection invitation lifecycle

Files: services/api/prisma/schema.prisma + additive migration; features/invitations/{invitation.service,invitation-notifications.service,invitation.routes}.ts; notifications repository/catalog/routes.
Interfaces: createInvitation(userId,email), ensureInvitationNotifications(authenticatedUser), reviewInvitation(reference,user,byId), acceptInvitation(existing signature), declineInvitation(token,user).
- [x] Write real isolated integration tests for receive/resend/reconcile/review/auth/expiry/decline/concurrency.
- [x] Run RED, implement optional source FK and DTO eligibility/unread projection.
- [x] Implement transactional invitation create/accept/decline + post-commit signals and recipient GET.
- [x] Generate Prisma and test additive migration in disposable database; complete API suite/types.

## Task 2: Explicit review UI and links

Files: web/features/invitations/{InvitationReview,invitation-review.types,invitation-review.client,invitation-review.module.scss,index}; JourneyWorkspace/ConnectionStage; notifications navigation/panel.
Interfaces: InvitationReview(reference,by,onHandled,onClose); notification destination ?invitation=id; legacy ?invite=token shows same component.
- [x] Write failing SSR state and navigation tests; observe RED.
- [x] Implement review GET and explicit Accept/Decline actions, errors/retry/stale state.
- [x] Remove mount-time acceptance. Route ConnectionStage and notification actions into review.
- [x] Run web suite, types, lint and production build.

## Task 3: Final review and release locally

- [x] Real two-user browser check through isolated Next/API: SSE before connection, review-only opening, decline and accept flows, mobile, no private-token payload.
- [x] Fresh independent review, important fixes with RED→GREEN and full suites.
- [x] Apply only the tested additive local migration, restart web, verify runtime.
- [x] Report baseline push and new implementation separately; no additional push implied.
