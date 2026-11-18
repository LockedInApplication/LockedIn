# Shared messaging rollout

This release adds chat to directly invited shared spaces and reuses Discovery chat. No message copying, historical transcript import, deletion, automatic send or new Discovery exclusivity consent is involved.

`SHARED_MESSAGING_ENABLED` is server-only and defaults to **false**. `DISCOVERY_CHAT_ENABLED` still governs Discovery chat. A successful web deployment alone is not evidence that the API schema, writers or backfill are ready.

## Deployment order

1. Keep the shared capability off. Schedule maintenance/read-only gating for contact mutations while **any** old acceptance, promotion, leave, close, block, unblock, moderation or account-deletion writer remains live. A flag alone cannot upgrade those writers or make their mixed-version mutations safe.
2. In the intended API deployment environment, from `LockedIn/services`, apply expansion migrations:

   ```sh
   npm run prisma -- migrate deploy
   npm run prisma:generate
   ```

   `20261118002000_shared_messaging` adds conversation identity, nullable associations and indexes. It does not replace the message table or rewrite messages/reports. Keep old columns and routes.
3. Deploy upgraded API code **everywhere**, still with shared messaging off. Check the deployed commit/version for every API instance, job and other writer; drain old instances. Web-only success is insufficient. Keep contact mutations gated until this is verified.
4. With the intended `DATABASE_URL` already supplied securely by that deployment environment, run:

   ```sh
   npx tsx scripts/backfill-messaging.ts --check
   npx tsx scripts/backfill-messaging.ts --apply
   npx tsx scripts/backfill-messaging.ts --check
   ```

   The first check may exit 1 for sources awaiting association. The final check must exit 0. It prints counts only: conversations, unassociated messages, invalid message associations, invalid conversations and active two-member relationships without chat. All but the total conversation count must be zero. Stop on integrity mismatches; do not repair them by deleting or merging histories. Never paste credentials, tokens, message text or raw database errors into deployment logs/support chats.
5. Verify message IDs, counts, sequences, request receipts, timestamps and existing report evidence against a pre-deploy read-only snapshot/count record. Review the backfill output and source origins. Explicit Discovery lock-in keeps Discovery policy even when unavailable; legacy nonexplicit promotions get an empty, separate relationship chat, with known closure/block/suspension retained.
6. Enable `SHARED_MESSAGING_ENABLED=true` on **all** current API writers, deploy the compatible web version and remove maintenance gating only after all writer versions and flags match. Direct invitation acceptance now creates the shared space plus chat atomically. No Discovery profile/publication or extra lock-in consent is required. Acceptance can still succeed for an unverified person; chat remains unavailable until both accounts qualify.
7. Run the two-account smoke test below. Monitor generic API failures, association counts and safety actions; do not log message content. No staging or production push/backfill was performed by implementing this release.

## Idempotence and compatibility

Backfill is bounded, rerunnable and source-aware. It associates messages only with their exact original connection; no message is copied. Upgraded old routes and new routes share persistence and receipt checks. Old-version writes with a null conversation association remain readable via their exact authorized source and are associated on a later run. Both old and new request uniqueness indexes remain.

One eligible accepted Discovery chat can be reused by a direct invitation for that exact pair; its history and IDs remain. Restricted/closed history is never imported. New historical relationships are not globally merged by user pair. Direct-first overlap returns a safe conflict, with a conversation destination only when currently authorized. Decline/withdraw remain available.

## Disable and rollback

Disable the shared flag everywhere first; this hides the new entry and neutral/direct APIs without deleting data. Keep the expanded schema and upgraded safety/source writers. Prefer a forward correction or compatible application rollback that retains those writers.

Upgraded block and suspension writers record durable closure even for an active shared space that hasn't been backfilled yet. Unblocking or restoring an account does not reopen that conversation when the flag is re-enabled.

**Do not run old safety/contact writers against live mutations after enabling this feature.** If a binary rollback truly requires them, gate all contact mutations for the entire old-writer interval, not just the new chat endpoint. An old block/unblock implementation cannot record durable closure on direct conversations; a later integrity check cannot reconstruct removed blocks. Re-upgrade and verify all writers before enabling mutations or the shared flag again. Do not drop new tables/columns or use a destructive down migration.

For a failed/partial backfill, keep the capability off, investigate source mismatches and rerun only after they are resolved. The script never clears an existing closure. Do not turn an explicit restricted Discovery relationship into a direct fallback.

## Smoke test

- Two verified accounts without Discovery profiles: send a direct invitation, accept, open Messages from the shared space, send in both directions and reload. No automatic message and no public-profile button should appear.
- Existing direct shared space: after backfill, the same Messages entry appears, without any Discovery onboarding.
- Existing Discovery chat: confirm transcript/receipt preservation, mutual lock-in keeps the same conversation and authorized public-profile viewing still works. Pausing alone does not disable accepted chat.
- Unverified actor gets their own verification guidance; partner restriction is generic. Outsiders and ended/closed contacts cannot read/send.
- Report via a received message's action menu. Confirm selected server-owned evidence in the existing moderator queue; profile-less accounts can be suspended/restored there. Restore/unblock never reopens closed chats. Direct close does not end the shared space; direct leave closes both shared and reused Discovery contact.
- On phone and desktop, conversation height stays bounded; older history preserves its visible anchor and incoming messages while scrolled show a jump control. Composer remains compact, unsent text is local-only, transient refresh errors do not unmount it, and switching accounts clears prior draft/history and aborts requests.
- With chat still open, return after more than one page of messages arrives. The chat fills the gap without moving the message you were reading. If the gap is larger than automatic catch-up can fill, the visible history stays intact until you choose **Jump to latest**; you can then load older messages normally.

## Local verification

Use only `scripts/verify-discovery.mjs` with an explicitly validated localhost `DISCOVERY_TEST_ADMIN_URL`; it creates/drops its own uniquely named disposable database. Never substitute Render/application credentials. Global migration/backfill rehearsal tests run before parallel API files so they cannot mutate other tests' in-flight fixtures.

The optional `--messaging-browser` argument runs `scripts/verify-shared-messaging-browser.mjs` inside that owned database. Supply an existing Playwright module through `LOCKEDIN_PLAYWRIGHT_MODULE` if it is not installed locally. It builds a local production webpack preview and uses synthetic users/cookies; it does not install dependencies or contact production. Screenshots/logs go to a new temporary artifact directory.
