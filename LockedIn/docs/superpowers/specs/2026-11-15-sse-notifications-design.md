# Durable in-app notifications over SSE

Status: approved by user; implemented and verified locally. After explicit user
permission, the authenticated public ngrok smoke check also passed: HTTP200,
text/event-stream, and initial notification event received without exposing credentials.

## Intent and agreed scope

Help each person notice useful updates and find the next activity without refreshing.
The user selected SSE and approved saved notifications, authenticated live delivery,
a bell/inbox, safe handling of drafts, reconnect recovery, and modular feature slices.
Existing email behavior stays unchanged. No browser push, chat, scheduled reminders,
online indicators, notification emails, or automatic reveal/approval in this release.

## Approaches

- Polling alone: simple but cannot provide immediate server-pushed updates.
- WebSockets: supports two-way messaging, unnecessary for this notification-only scope.
- Saved notifications plus SSE: selected by the user. Normal HTTP remains responsible
  for mutations; a server-to-browser stream announces persisted inbox changes.

Implementation choices below are the builder's proposals, not additional user requests.

## Existing integration points

Fastify API and Prisma/Postgres already own the domain state. The Next.js client
uses same-origin `/api` requests rewritten to port 8000, including through ngrok.
Cookie authentication uses Better Auth's existing `getAuthenticatedUser` helper.
There is no persistent in-app inbox or stream currently. Email calls exist separately.
Journey section state is now URL-backed. Existing uncommitted navigation/card work
must be preserved. No new framework, Redis service, or external account is required.

## Backend boundaries

`features/notifications` owns types/catalog, repository, service, routes, stream,
and tests; its public interface hides persistence and connection details.
Other feature slices call this interface with structured event metadata only.
Do not import private answers, summaries, notes, or proposed wording into notifications.

Add a Notification model with database-generated sortable sequence ID, recipient ID,
relationship ID, event kind, entity ID/type, source version/deduplication key,
createdAt, nullable readAt, and nullable resolvedAt. Use database uniqueness on recipient + event key.
Foreign keys cascade on user/relationship deletion. Index recipient + sequence ID.
Client IDs are serialized strings, not JavaScript BigInts.
Store event metadata, render generic approved messages from a catalog, and derive
destinations from an allowlist rather than accepting arbitrary URLs.

When a domain transition completes or supersedes an earlier task, set resolvedAt on
its outstanding notifications in that same transaction. Keep them in inbox history
with an 'Already completed' or 'Updated' label, but exclude them from unread/actionable
counts even if the person never opened them. In particular, a conversation match
resolves both people's earlier choice notifications and creates the ready update.
Resolve older candidate-approval notifications when wording is replaced or shared.
Resolving is not the same as the user reading it; retain readAt separately.

Persist domain change and its notification records in the same transaction for
each covered workflow. Publish a live signal only after commit. If a transaction
rolls back, neither state nor notification is committed. Notification persistence
errors fail that mutation rather than silently losing updates. Email failure must
not undo a committed change. Repeated identical submits must not generate duplicates;
legitimate edits use the entity's committed version/update marker.

## First-build events

- Invitation accepted: notify inviter that the shared space is ready. Invitation
  delivery to someone without an account remains the existing email/link flow.
- Conversation choice created/changed: notify the partner; a match replaces the
  outstanding choice task with a conversation-ready update to both people.
- Check-in responses both submitted: sharing-review update to both people. Do not
  send private answers or claim they have been revealed.
- Check-in mutual consent reached: shared-ground-ready update to both people.
- Atlas chapter started/response submitted: notify the partner generically; when
  both submit, notify both that the understanding activity is ready.
- Atlas heard summary/check, wording proposal/selection/resolution: notify only
  the person who has a useful next action. Pending private selections must not leak.
- Atlas candidate ready: approval-needed updates; both approvals: chapter-complete
  updates to both people, once per candidate version.
- Next-step proposal: notify partner; acceptance: notify proposer. Both reflections
  submitted: reflection-ready update to both, without outcomes or notes.

Use actual transition results to determine recipients and events; never infer a
successful transition from a request alone. No alerts on rejected requests, no-ops,
or repeated reads. A transition-to-event mapping will be explicit in the implementation plan.

## HTTP and SSE contracts

- Authenticated `GET /api/journey/notifications`: paginated most recent inbox,
  unread count across eligible items, cursor; bounded page size, private/no-store.
- Authenticated `PUT /api/journey/notifications/:id/read`: recipient-scoped,
  idempotent; return 404 for another person's ID, never imply ownership.
- Authenticated `GET /api/journey/notifications/stream`: same-origin EventSource,
  cookie authentication, `text/event-stream`, private/no-store, proxy buffering
  disabled, heartbeat comments, cleanup on disconnect and server shutdown.

Stream payloads are invalidation signals only, not answers or full overview objects.
On connect/reconnect, issue a resync signal and fetch the authoritative inbox.
Unread changes also signal the user's other tabs. No exactly-once transport claim:
the inbox is authoritative, delivery can repeat, and rendering deduplicates by ID.
Existing notifications remain available after application restarts.

For the current single API process, a per-user connection registry provides immediate
post-commit signals. A bounded periodic database check recovers missed signals and
changes from another worker without requiring Redis. This is not an in-memory-only
notification store. Periodic checks revalidate session/access; expired sessions close
the stream. Reconnect authentication failure stops the loop and returns to sign-in.
Cap concurrent streams per user and release timers/listeners on all close/error paths.
Use one stream per mounted workspace, not per component or notification item.

Every inbox query excludes ended/blocked relationships or lost membership. Notification
clicks recheck destination access through existing APIs. Relationship exit invalidates
inbox eligibility and closes affected access on the next bounded stream check.

## Frontend behavior

`features/notifications` owns API client, types, inbox/stream hook, bell, panel,
notification item, local scoped styles, and tests. Journey imports only its public API.
The header hosts the bell with accessible unread count and a keyboard-operable panel.
Use the existing playful color/style system, restrained motion and reduced-motion support.
Provide loading, empty, reconnecting, and retry/error states. No sound or blocking popups.
Reading/opening a notification never submits, reveals, accepts, or approves anything.

Each notification links to an allowlisted workspace section and, where supported,
its relevant entity. Add scoped entity focus/selection only where needed; keep the
existing full-chapter and URL section navigation working. Do not promise exact-entity
navigation if a destination cannot select it; implement that selection for covered targets.
Stale targets show a neutral no-longer-available/already-completed state, not an error
that forces resubmission or implicitly restarts an activity.

Live delivery updates only inbox state. Do not replace the overview or remount forms
while someone is editing. Show a small 'New activity — refresh when ready' affordance
for domain updates. On explicit refresh/navigation, fetch new domain state; warn before
discarding a dirty draft. The existing next-action card then derives from that overview.
Closing/reopening the inbox does not lose journey inputs. Abort old requests on logout
or unmount and clear recipient-specific state to prevent cross-account leakage.

## Verification and rollout

Add a non-destructive migration; retain all existing relationship/chapter data.
Generate Prisma types. No database reset, production push, or unsolicited emails.
Test event mapping, transaction rollback/deduplication, recipient authorization,
inactive relationship filtering, pagination/read counts, SSE isolation/cleanup,
reconnect recovery, and no sensitive notification data. Test client read state,
keyboard accessibility, stale destinations, and draft preservation.
Run complete API/web suites, canonical typechecks, lint and production build.
Use two authenticated test users in an isolated test database for integration checks;
never fabricate progress for the user's real relationship. Browser checks must prove
actual stream delivery through the Next rewrite, not just mocked EventSource behavior.
Verify public proxy streaming if the current ngrok endpoint is available, without
publishing private data. Report any environment-dependent verification gaps explicitly.

## Remaining builder decisions

Exact module file names, stream heartbeat/check intervals, page size/caps, icons and
subtle animation are implementation details. Choose conservative bounds, document
them, and test their behavior. Deploying many workers can later replace the broker
with shared pub/sub without changing the durable inbox or client contracts.

## Design check

A fresh builder review identified notification retirement semantics as the only
important gap. The resolvedAt rule above addresses it as a conservative builder
choice: preserve history without presenting completed work as outstanding.
