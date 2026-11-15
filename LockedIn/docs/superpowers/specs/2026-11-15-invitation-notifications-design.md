# Invitation received notifications

User approved the walkthrough by asking to push the current build and implement it.

## Intent and scope

Before two people connect, B should receive a durable bell notification for A's
invitation. Opening it reviews who invited them; only a separate Accept action
creates the relationship. Decline is equally explicit. Acceptance notifies A using
the existing event. Expired/handled invitations remain labelled history, not
outstanding tasks. Existing email attempts and private links stay supported.
No notification or review may expose answers or implicitly consent to sharing.

## Approach

Reuse the durable notification model/SSE feature rather than a second inbox or
synthetic shared relationship. Add an optional invitation reference and make the
relationship reference optional, constrained to exactly one source. Invitations
remain a separate feature slice; notifications owns display/read/stream transport.

Existing users receive a notification in the same transaction as invite creation.
Repeated sending reuses the unexpired invite and notification. On authenticated
inbox access, reconcile matching pending invites so newly registered recipients
and pre-feature invitations are covered. Reconciliation is idempotent and uses
the authenticated account email/recipient ID, never a client-supplied recipient.

Invitations are eligible before relationship membership. Relationship-backed
notifications retain existing active-membership filtering. Invitation unread
counts exclude expiry/handled states even without a scheduled job. Listing old
invitations derives an effective resolved state; the token is not in notifications.

## Review and lifecycle

A recipient-only authenticated GET review endpoint accepts an invite token or ID,
returns inviter name, derived status, expiry and whether acceptance is currently
possible. Unknown/nonrecipient references both return404. No mutation on opening.
The existing accept endpoint remains, but revalidates pending/expiry/recipient
and both users' active relationship state under ordered user + invite row locks.
Concurrent accepts must create at most one relationship. Add decline endpoint.
Resolve received notifications atomically when handled; signal recipient and inviter
only after commit. Do not send an extra decline notification to pressure the inviter.

Both bell links (`?invitation=<id>`) and legacy emailed/private links (`?invite=<token>`)
open review, not auto-accept. Login preserves the review URL. ConnectionStage buttons
lead to the same review component. Review is exclusive, with no editable workspace
or navigation behind it; this prevents Back/Decline from discarding a later draft.
It remains accessible even when B already has a relationship, explaining why another
cannot be accepted. No answer/forms are refreshed by live events. Existing dirty-input
guard applies before bell navigation.

## Constraints and verification

Additive non-destructive migration only, no reset and no real test invitations/emails.
Test in an isolated Postgres database: existing user live SSE, repeated sends,
late registration, other-user denial, expiry/decline/read counts, concurrent acceptance,
and no relationship until explicit accept. Test SSR review states, safe destination,
and actual two-browser UI through Next proxy. Run both suites, types, lint, build.
Push of the pre-change baseline was requested and completed first; don't assume
the new work should also be pushed without a separate instruction.

## Delivered verification

164 tests pass across API/web/isolated DB. Actual two-user browser checks cover
pre-connection SSE, review-only opening/refresh, explicit decline and acceptance,
exactly one space, sender notification, connected recipient safety, and mobile
decision visibility. Independent review's draft-loss finding was reproduced and
fixed with the exclusive screen. The additive migration preserves application data.
