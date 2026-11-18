# Shared messaging for Discovery and invited partners

Status: proposed; awaiting user approval before implementation.

## Intent and agreed behavior

Reuse one messaging system rather than build a second chat for invited partners. The user selected a shared-system refactor over adding direct-invitation exceptions throughout Discovery chat.

Accepting a direct invitation immediately creates both the shared relationship space and its conversation, atomically. Neither person needs Discovery enrollment or a published Discovery profile, and there is no additional lock-in step. Discovery connections retain their existing chat and keep that same conversation when mutually locking in. Existing messages must remain intact.

## Current constraints

- `DiscoveryMessage` belongs to `DiscoveryConnection`; message APIs, frontend context, reports and access checks are Discovery-specific.
- Direct invitation acceptance creates `Relationship` and two memberships but no chat. Only one active relationship is allowed per account.
- Existing chat already provides 30-message pagination, 2,000-character messages, idempotent sends, bounded scrolling, message action menus, polling and broker-triggered refresh.
- Discovery chat currently requires verified, admitted, nonsuspended participants with published profiles; pausing alone does not prevent chat.
- Blocks and suspension durably close contact for explicit locked-in pairs. Unblocking or restoring an account must not silently reopen it.
- Relationship guided conversations/reflections are not chat messages and must not be renamed or migrated as messages.

## Approaches considered

1. **Shared messaging domain (selected):** common conversation/message storage, message service, safety controls and UI, with source-specific authorization. More work initially; avoids duplicate messaging implementations and unrelated Discovery dependencies for invited partners.
2. **Extend Discovery chat:** add synthetic Discovery connections or direct-partner branches throughout existing chat. Smaller initial diff but creates artificial prompts, publication exceptions and long-term coupling. Rejected.

## Proposed architecture — builder recommendations

These details are engineering recommendations, not additional user decisions.

### Conversation identity and reuse

Introduce `ChatConversation` in a `messaging` feature, distinct from guided relationship conversations. Each conversation has exactly two ordered participants, an origin (`DISCOVERY` or `DIRECT_INVITATION`), optional unique Discovery connection and relationship associations, and durable closure metadata.

There is one conversation per Discovery connection and one per relationship, enforced by unique associations. Do not make the user pair globally unique: closed historical relationships/connections must remain separate and cannot be resurrected by a new invitation.

Discovery acceptance creates its conversation transactionally. Promotion attaches the new relationship to that existing conversation. Direct acceptance creates a conversation with the relationship; if this exact pair already has one eligible accepted Discovery connection, attach that conversation instead of splitting their active chat. Reuse never applies to closed, blocked or historically ended contact, or a conversation linked to another relationship. Both account locks, then source/conversation locks in a documented deterministic order, serialize invitation, promotion, close and moderation races.

Existing active relationships are associated through a rerunnable backfill, preserving their true origin. An explicitly mutually locked-in Discovery relationship always retains its original Discovery conversation and all its current eligibility/closure restrictions. If that conversation is closed, unpublished, out of rollout or otherwise unavailable, do not create a direct-origin fallback or enable relationship-only access.

Actual directly invited relationships receive an empty direct conversation unless the accepted eligible reuse rule below applies. Legacy `PROMOTED` relationships without explicit lock-in currently deny Discovery chat: preserve that restriction and their historical transcript, and propose a new empty direct-origin chat for the active legacy relationship, rather than expose the old transcript. That new conversation links only the relationship, not the restricted Discovery connection. Never provision an open fallback around a known block or durable safety/contact closure: backfill preserves those restrictions and records closure on the new conversation where applicable. These are the builder's conservative privacy recommendations.

For Discovery-first reuse at direct acceptance, eligibility means the existing source passes its current chat-access policy under locks, including publication/admission; accepted state alone is insufficient. Otherwise create a new empty direct conversation and do not import restricted messages. After legitimate reuse, relationship authorization replaces publication/admission requirements for the shared chat.

For the reverse order, an existing active same-pair relationship is canonical: a new/pending same-pair Discovery invitation cannot create another accepted chat or reset the relationship's consent. Return a safe conflict plus an existing-Messages destination only to the participants; keep decline/withdraw available. Do not silently merge historical transcripts. This is the builder's proposed overlap policy.

The backfill does not manufacture messages, consent, Discovery publications or lock-in timestamps. A legacy relationship without explicit Discovery lock-in does not gain Discovery exclusivity just because it gets chat.

### Shared message service and compatibility

Move persistence, pagination, send validation, idempotency and notification effects into one messaging service. Neutral endpoints use `/api/messaging/conversations/:id` and its `/messages` resource. Conversation metadata exposes only partner-safe identity, capabilities and authorized origin context, not raw account details.

Retain old Discovery message endpoints temporarily as thin authorized adapters into this service so old open tabs continue to work. They resolve by Discovery connection ID; they do not implement separate sends or reads. New shared endpoints enforce authenticated membership, trusted origin/account-binding on mutations, strict schemas, quotas and private no-store responses. Extract shared HTTP primitives rather than import Discovery mutation middleware into general messaging.

Reuse the existing message table through a Prisma model/table mapping instead of copying messages into another store. Preserve message IDs, sequence values, timestamps, sender IDs, request IDs, report evidence and original opening-message references. Add a conversation association; allow the old Discovery connection association to be absent for direct conversations. Enforce uniqueness for `(conversationId, senderId, requestId)` for new shared writes.

Use an expand/backfill/contract rollout. Initial migration is additive and keeps the conversation association nullable for old-version writes. Deterministic association/backfill makes it rerunnable. During mixed-version rollout the common service also reads and resolves legacy connection-linked messages lacking the new association, with idempotency checking both mappings. Do not tighten constraints or remove compatibility columns/routes until old deployments are gone and association counts are verified. There must be no dual message store or copying that can duplicate a send.

### Authorization and safety

Every read/send checks current account state, conversation membership, block state and durable contact closure under the same locks used for close/moderation. Outsiders receive a generic not-found response. Never trust a client-provided partner ID.

- Discovery-origin conversations retain current Discovery eligibility rules, including publication and rollout admission, so this refactor cannot bypass existing restrictions.
- Direct-origin conversations require an active shared relationship containing exactly these participants, verified accounts, and no block/suspension. They do not require Discovery admission, location, publication or a Discovery profile. Honor existing suspension records even when enforcing direct-origin access; absence of a Discovery profile is not a suspension.
- Preserve existing invitation acceptance eligibility rather than adding a new verification gate to invitations: acceptance may create the relationship and conversation while messaging is temporarily unavailable due to verification/suspension. Explain the acting user's verification requirement without disclosing the partner's moderation state. Reads/sends remain denied until both accounts qualify. Later qualification enables a never-closed conversation, but never clears a durable closure. Existing invitation block restrictions still prevent acceptance.
- A Discovery conversation reused for a directly accepted invitation transitions explicitly to relationship-authorized access in the same transaction. This transition must not clear prior closure or suspension. Its Discovery/profile viewing routes retain their separate publication/privacy checks.
- Ending a direct relationship denies further message reads/sends through the ordinary chat APIs but retains records. Existing Discovery-origin relationship-ending behavior is preserved. Neither ending nor unblocking automatically reopens a closed conversation.
- Blocks and moderation suspension close affected conversations durably, including direct-origin chats, without erasing messages or ending a relationship implicitly. Account deletion follows existing deletion policy and must handle the new relations.

Closing a reused chat from either its Discovery entry or shared-space entry closes the one canonical conversation everywhere and marks linked contact closed. It does not end the relationship; explain this before confirmation. Leaving a directly accepted relationship ends that relationship and durably closes its conversation and any reused Discovery contact, so neither entry can reopen access. Keep historical entries read-only/unavailable as existing source privacy permits, never as a bypass to messages/profile access. Explicit Discovery-lock-in relationship ending retains the already implemented behavior. These lifecycle distinctions are builder recommendations, not automatic relationship deletion on chat close.

Generalize the existing reporting service and moderation queue rather than add a second queue. Message reports capture server-owned evidence, participant identity and optional conversation association. Keep legacy report IDs, connection links, source IDs, evidence and moderator access intact. Profile/photo reports remain Discovery-specific. Support report/block on direct chat without Discovery participation. No permanent report button under every message: retain the existing message action menu.

### Frontend reuse and entry points

Extract the existing bounded chat UI into `features/messaging`: one composer, message list, pagination, retry logic, focus/scroll handling and safety menu. Remove its dependence on `DiscoveryShell`, Discovery request headers and required Discovery opening prompt. Supply authenticated account context, conversation metadata, refresh events and shared safety callbacks instead.

Discovery retains its current conversation entry and optional opening-context display. Direct partners get an explicit Messages entry in their shared relationship space and a stable neutral conversation URL; an accepted invitation exposes that entry without sending an automatic message. Existing shared spaces also expose it after backfill. Do not redesign navigation or build an all-conversations inbox in this change.

Reuse current safe partner name/avatar fields for direct partners; do not expose email or private relationship reflections. A direct partner without a published Discovery profile has no public-profile button. Existing authorized Discovery profile viewing continues independently from messaging access.

Keep the current constrained conversation viewport, compact composer, older-message loading and new-message indicator. Messages do not extend the entire page indefinitely. Unsent text remains local and is not persisted as a private draft.

Retain existing broker/SSE refresh integration plus 15-second visible-tab polling fallback. Generalize event consumption outside Discovery. No new WebSocket infrastructure or multi-instance delivery guarantees in this scope.

### Discovery lock-in semantics

This task adds messaging to direct shared spaces; it does not change existing Discovery exclusivity rules for direct invitations. Explicit mutual Discovery lock-in continues to pause Discovery and retain other accepted chats as implemented. Whether accepting a direct invitation should also hide both people from Discovery is a separate product decision, not an implied consequence of creating chat.

## Goals, non-goals and anti-goals

Goals: direct partners can message immediately after acceptance; existing spaces are covered; Discovery chat continues unchanged; one reusable message implementation and UI; preserve message and moderation history.

Non-goals: calendar sync, date planning, attachments, typing/read indicators, persistent drafts, new inbox design, new transport infrastructure, retrospective exclusivity consent, removing legacy database structures in the initial rollout.

Anti-goals: lost/duplicated messages, fake Discovery profiles/prompts, publication requirements for direct partners, automatic messaging without consent, new access to private profiles/reflections, weakening report/block behavior, restoring closed contact, or deleting production records.

## Verification and rollout requirements

Write failing tests first for direct acceptance and shared-service behavior. Test accounts with no Discovery profile or admission, old active relationships, existing Discovery messages, same-pair reuse, concurrent/repeated acceptance and promotion, idempotent send retries across compatibility endpoints, outsiders, blocks, suspension/restore, relationship ending and account deletion. Verify reports and moderator evidence for both origins and old reports after migration.

Migration verification includes before/after message counts, stable IDs/sequences, report associations, unique conversation links, backfill reruns and old-version writes during rollout. Rehearse on a disposable database, never production fixtures. Test old and new API routes against the same stored messages.

Frontend tests cover both origins with the same component, optional opener, no-Discovery entry, retry/history scrolling, account changes, closed access, report-menu accessibility and absence of private-draft controls. Browser verification covers desktop/mobile bounded scrolling, keyboard focus and sending/receiving between two accounts. Run API/web tests, type checks and the production webpack build.

Use production/staging branches only when the user requests a push. Deployment readiness requires successful database migration/backfill and both API/web versions verified; a green web deploy alone is insufficient. Keep direct-chat creation, relationship-authorized reuse and backfilled-chat exposure gated off until every acceptance, close, leave, block and moderation writer uses the common safety/lifecycle implementation. Old-client route adapters alone are not a safe mixed-binary rollout. Before rolling back to old writers, disable the new capability; it is acceptable for the new Messages entry to be temporarily unavailable rather than leave a safety bypass. Keep the compatibility path until rollback safety is verified. No database deletions are authorized or needed.

## Left to implementation planning

Exact field names, module splits, migration batching, lock helper extraction, test fixture organization and whether backfill runs as migration SQL or an explicitly verified deployment step are builder choices within the above invariants. Keep refactoring scoped to messaging dependencies, not a wholesale Discovery rewrite.
