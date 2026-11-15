# Private profile and settings

Status: approved by the user, November 15, 2026.

## Intent

Give each signed-in person one familiar, private place to manage identity,
security, notifications, and safety without adding steps to relationship conversations.
The user selected a dedicated page rather than a slide-out panel.

## Approaches

- Dedicated Profile & settings page (selected): clear navigation, space for explanations,
  and a stable URL; requires leaving the current workspace view.
- Slide-out panel: quick edits, but cramped for security and privacy controls.

## Proposed delivery boundary

Build a usable first release with identity, security, notifications, and blocked accounts.
Data export and account deletion remain part of the intended account controls, but are
proposed as a separately designed follow-up, not nonfunctional buttons. Approval of
this document explicitly approves that sequencing. Current cascading user relations
make deletion capable of destroying shared records; do not enable raw auth-user deletion.
No existing user data is deleted or rewritten as part of this feature's deployment.

## Page and interaction

- Authenticated `/profile` page, accessible without an active relationship.
- Header avatar plus visible “Profile & settings” label; keyboard accessible.
- Clear “Back to our space” link. Existing workspace unsaved-draft confirmation must
  run before entering this page. Preserve existing workspace navigation and invitation controls.
- Small, readable sections: Your details; Account security; Notifications; Privacy & safety.
- Existing paper/plum colors, playful accents, modest headings, responsive single-column
  layout on small screens. Avoid a second roadmap or oversized decorative hero.
- Per-section save state, validation, success/error feedback; no success until persistence
  succeeds. Warn before discarding edited forms. No infinite-growing history lists.

## Your details

- Editable preferred display name, trimmed, 1–80 characters. Do not edit identity email here.
- Use existing `displayName` as the preferred label with current name fallback; show one
  field to avoid confusing users with two names. Saving must update current UI and the
  label seen by their partner after normal refresh.
- Avatar selection from a small built-in set of code-native illustrations or initials,
  with an explicit reset to initials. Store a validated preset identifier. Arbitrary image
  URLs and file uploads are out of scope: no new storage or remote-image privacy exposure.
- State explicitly: this page is private; your chosen name and avatar appear to your partner.
  Do not imply a name change rewrites text already written in historical notifications.

## Account security

- Read-only account email and actual verification status, without implying verification
  is required in the current development configuration.
- Change password using existing authentication APIs, current password plus new password
  confirmation; enforce the installed auth library's password policy. Revoke other
  sessions on successful password change. Never log or persist plaintext passwords.
- Existing password recovery remains available. A recovery request reports only request
  acceptance, never guaranteed email delivery.
- Sign out using the existing flow. Do not enable email changes in this first release.

## Notifications

- Independent toggles for relationship activity emails and in-app activity notifications,
  both initially enabled to preserve current behavior for existing accounts.
- Security, password-reset, verification, and account-recovery email cannot be disabled here.
- Preference changes are owner-only and take effect server-side for future activity.
  Existing notifications remain saved. Re-enabling does not replay suppressed activity.
- Turning off in-app activity suppresses future activity entries and their attention UI,
  not relationship-data refresh, invitation visibility, or SSE state invalidation.
  Preserve quiet invitation-status updates and all existing consent boundaries.
- Relationship invitation emails count as relationship activity email. Preferences apply
  to registered recipients; a new recipient without an account has no saved preference.
- No change to reveal consent, email provider configuration, or delivery tracking.

## Privacy & safety

- Reuse current blocked-accounts service and pagination, including unblock confirmation.
- Keep the current invitation-manager access working; share the control instead of
  duplicating its policy logic. Blocking remains private and does not end a shared space.
- Explain that unblocking does not automatically resend or restore invitations.

## Architecture and authorization

- Feature-based vertical slices in web and API; page composes small settings sections.
- Authenticate all reads and writes; derive the target user from the session, never from
  a client-supplied user ID. Reject unsupported fields and invalid preset/name/preference values.
- Add minimal additive database fields/models for avatar preset and notification preferences,
  with explicit defaults. Reuse existing `displayName`, auth client, and invitation controls.
- Centralize preference decisions in notification/email services rather than copying checks
  into every activity route. Audit every existing relationship email and activity producer.
- Avoid account-specific cache leaks; clear local settings on sign-out/account switch.
- Sensitive endpoints and responses must not disclose partner settings or private answers.

## Goals and anti-goals

Working settings, understandable privacy labels, accessible navigation, persisted preferences,
and behavior-preserving relationship flows. No public profile, discovery, biography,
relationship score, social feed, photo uploads, fake settings, or destructive account reset.

## Verification

- Owner-only settings reads/writes, unauthorized access, invalid payloads, persistence,
  and default compatibility tests.
- Notification/email enabled and disabled cases, security-email exception, recipient-specific
  preferences, no replay, and continued SSE refresh while activity alerts are disabled.
- Password errors/success/session revocation; no accidental account deletion capability.
- Avatar/name rendering, save/error/dirty states, account switching, blocked-list reuse.
- Desktop/mobile authenticated browser checks and workspace regression tests; use synthetic
  users for writes and never alter real user settings for testing.
- Run relevant API/web tests, type checks, lint, production build, and diff checks.

## Builder decisions

Exact component names, preset illustrations, field/model arrangement, and test organization
are left to implementation within the existing stack. Inspect installed auth documentation
and types before using update/password APIs. Any dependency change or shared-history deletion
policy is outside this design and must be brought back for approval.
