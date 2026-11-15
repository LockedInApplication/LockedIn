# Sender invitation status, decline pause, and private blocking

Status: approved by user; implemented and verified locally.

## Intent

Give invitation senders closure while preserving recipients' ability to say no
without pressure or disclosure of blocking. Extend the existing invitation/SSE
feature, not relationship answers or consent rules.

## Agreed experience

- A sees a private sent-invitations status card: Pending, Accepted, Not accepted,
  Expired, or Withdrawn. Creation/pending does not claim confirmed email delivery.
- Acceptance retains the existing bell notification to A. Decline updates A's card
  quietly, with no separate decline notification, email, sound, or read receipt.
- B is told before declining that A can see the invitation was not accepted.
- Decline closes the invitation and prevents new A-to-B invitations for seven days.
  B can initiate an invitation during that pause. No automatic resend or reminder.
- B can separately block A from the invitation review. This lasts until B explicitly
  unblocks A; neither side can initiate a new invitation while that block is active.
  Only the person who created a block can remove it. If both people block, removing
  one block does not remove the other.
- Blocking closes outstanding invitations between those accounts. A sees only
  'Invitation not accepted', never a blocked label, block reason, or block notification.
  Future send attempts use a neutral unavailable response, not a disclosure of who
  blocked whom. This cannot guarantee A never infers a restriction from behavior.
- B has a way to view/manage their own invitation blocks. Unblocking does not restore
  closed invitations, remove the original seven-day decline pause early, reconnect
  accounts, or reveal any answers.

## Approaches considered

1. Explicit decline/block notifications: clear to sender but exposes the recipient's
   boundary-setting and can create pressure. Not selected.
2. Completely silent invitation removal: more private but leaves the sender unsure
   whether the app worked. Not selected.
3. Visible sender status plus quiet decline and private block: selected in discussion.

## Scope and safeguards

Invitation blocking only. It does not silently end, block access to, or otherwise
modify an existing shared relationship. Connected-partner blocking requires a
separate shared-space exit/privacy design. No last-seen/opened indicators, required
decline reasons, profile surveillance, or notification-driven acceptance.

Check eligibility on the server for direct API requests and reused links, not just
disabled buttons. Cooldowns are account-pair specific and measured from the decline
event. Repeated decline requests must not extend the original pause. Withdrawal
invalidates the pending link; it does not undo a decline or erase its cooldown.
Expiry is separate from a deliberate decline and does not create a decline pause.
Use existing authenticated recipient identity rules; never expose a recipient's
account existence through sender status or invitation errors.

## Builder choices proposed for approval

Use the existing feature-based invitation/notification modules and additive migrations.
Provide explicit sender withdrawal for pending invitations and explicit block/unblock
controls for the blocker, with confirmation before blocking. Persist lifecycle times
and block records; enforce the seven-day pause and block checks transactionally.
Reuse SSE to refresh status without overwriting unsaved answers.

## Verification required

Existing/new-user invitation flows still work. Tests must cover seven-day boundaries,
no cooldown extension on retry, directional pause vs two-way invitation restriction
while blocked, concurrent send/decline/block/unblock, owner-only block management,
neutral sender status/errors, withdrawal/expiry, stale links, and unchanged shared
relationship progress/consent. No real-user test invitations, emails, or database reset.

## Delivered verification

API68 + web92 + isolated notification/invitation/boundary integration28 =188 passing
tests. Actual three-account Chrome checks verify quiet sender status, generic resend
refusal, confirmed private blocks, own unblock, preserved decline pause, reverse
invitation/acceptance, withdrawal, mobile layout, unsent draft protection, and a
mounted account-switch regression with a deliberately delayed new-account response.
Independent review found no confirmed server-policy/authorization defect. Its
account-switch test gap was reproduced and fixed with account-keyed component state.
Production build/types pass; lint retains one pre-existing avatar image warning.
The additive local migration preserves shared spaces/answers and backfills original
decline timestamps. No new code was committed or pushed for this task.
