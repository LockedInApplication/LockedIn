# Mutual lock-in and connected profile viewing

## Approved behavior

Both people explicitly choosing to lock in opens a shared space, hides both
profiles from Discovery, and prevents either from sending or accepting new
Discovery invitations. A one-sided choice is withdrawable and changes no access.
Existing conversations and their messages remain usable: locking in must never
remove chat access. Clicking the partner's name in chat opens their public profile
again without requiring a new invitation.

## Approaches

The user approved pausing Discovery only while retaining existing conversations.
Disabling all chats was rejected explicitly. Merely hiding the Discover navigation
is insufficient because old tabs and direct API calls must obey the same rule.
Enforce the pause server-side and expose separate browse/chat capabilities.

## Constraints and implementation decisions

- Build on Fastify, Prisma/Postgres and Next.js; no new dependencies.
- Separate explicit lock-in consent from legacy build-readiness choices. Never
  reinterpret earlier choices or already-promoted spaces as exclusivity consent.
- Use account-first locking and an atomic transaction to create exactly one
  shared space, mark the mutual lock-in and pause both profiles.
- Apply the browse/invitation restriction while that lock-in's relationship is
  active. Ending it does not automatically republish either profile; the existing
  explicit unpause control governs republication afterward.
- Preserve existing chats, including the pair that locked in. Keep block,
  suspension, closure and account-verification checks in force. Do not close other
  connections or erase messages, opening replies or safety evidence.
- Connected profile viewing is read-only and restricted to the participants in
  accepted connections or their active promoted shared space. Show only current
  published public fields and approved photos, never private drafts, location
  coordinates, authentication fields or other relationships. Honor blocks,
  suspension, revoked photos and withdrawn publication. A Discovery pause alone
  does not remove profile access from existing connections.
- Provide a dedicated connection-scoped profile endpoint and accessible UI with
  return-to-chat, loading, unavailable and retry states. Keep ordinary candidate
  endpoints protected; connected media authorization must use the same policy.
- Explain before confirming: both profiles will be hidden, new invitations stop,
  and existing chats remain available. No production writes/deploy without a
  separate release request.

## Non-goals

No automatic closure of chats, deleting history, calendar integration, WebSockets,
automatic exclusivity for legacy shared spaces, or exposing unpublished profiles.

## Verification

Disposable-database tests cover one-sided consent, old-client rejection, duplicate
and concurrent confirmations, hidden candidates, direct invitation/unpause bypass,
continued messaging and partner profile/photo access. Web tests and local mobile/
desktop browser checks cover consent, name-to-profile navigation and return to
chat. Run both unit suites, TypeScript, lint and the production web build.
