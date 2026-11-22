# Direct invites and mutual Lock In

With `SHARED_MESSAGING_ENABLED=true`, accepting a direct invite opens a private chat in Inbox. It does not start a Together space, send a message, or pause Discovery. The conversation can use the existing date-planning tools when those tools are enabled.

Either person can ask to lock in. The other person can confirm or choose **Not now**; the sender can withdraw while it is pending. The server ties a confirmation to that exact request and checks both participants and their current access. There are no automatic reminders.

Mutual consent attaches the existing chat to one Together space and pauses Discovery for both people. If the pair already has a direct-invite Together space, consent updates it in place; its members, check-ins, Atlas, roadmap, and chat stay intact. Leaving Together ends the Discovery restriction but does not automatically publish either profile again.

## Development rollout

1. Point the API and Prisma CLI at a verified development database.
2. From `LockedIn/services`, run `npm run prisma -- migrate deploy` and `npm run prisma:generate`.
3. Set `SHARED_MESSAGING_ENABLED=true` on the API and restart it. Leave any existing date-planning flags as configured.

Migration `20261121010000_direct_invite_mutual_lock_in` is additive with a widened notification-source constraint. No reset or deletion is required. Existing Together spaces are not grandfathered into exclusivity; both people have to choose it.
