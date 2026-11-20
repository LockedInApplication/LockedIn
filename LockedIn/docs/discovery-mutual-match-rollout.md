# Mutual Discovery matching rollout

Mutual matching affects only how people find and start new Discovery connections. It does not gate direct invitations, accepted conversations, or existing shared spaces. No cleanup is needed: existing people complete setup only when they choose to use Discover again.

## Deploy with matching off

1. Confirm the destination databases and backups with the operator. A Git staging branch does not prove there is a separate staging database. Never point the disposable test runner at a hosted database.
2. Apply the additive `20261120012000_mutual_discovery_preferences` Prisma migration. It creates two empty tables, with no backfill or writes to published profiles, existing chat, date plans, reports or invitations. Deploy the compatible API, then the web app. Keep `DISCOVERY_MATCH_PREFERENCES_REQUIRED` unset or `false` while deploying. Do not change Discovery admission or metro settings as part of this rollout.
3. From `services`, run `node scripts/verify-discovery.mjs` with an explicit disposable `DISCOVERY_TEST_ADMIN_URL`. Then run the two browser harnesses with `DISCOVERY_TEST_FILES=api/src/features/discovery/discovery-match-preferences.dates.spec.ts DISCOVERY_REVIEW_CASE=mutual-preferences node scripts/verify-discovery.mjs --browser --messaging-browser`. The focused file avoids unrelated integration fixtures in the browser moderation queue. Verify both flag states with separate browser sessions before requesting approval to activate the matching gate. This does not authorize enabling public Discovery or opening a market.

## Two-account checks with matching enabled

- An already-published profile with no matching setup should get **Set up matching**, not people or an auto-published result. Confirm a draft still requires publication, a paused account remains paused, and a current local area check is required when location gating is on.
- Have one person’s settings fit the other person but not the reverse. Neither should see the other. Update the second person’s choices, then verify both sides see each other. A birthday, matching gender, age range or preference reason should never appear on the other side’s card.
- Send a new Discovery invitation, then change settings or remove setup. The recipient must still be able to decline or report it. A previously accepted chat and a direct-invite chat must still send messages. Verify a stale profile or photo URL can no longer load for an unmatched stranger.
- Remove the matching setup from **Profile & settings → Privacy & safety → Manage matching preferences**. Verify the member can remove saved values without a recent location check, while locked in, suspended, outside the pilot, or with the matching flag off. An already-published account can rejoin only after explicit setup and any remaining existing gates.
- Open matching preferences in two tabs. After saving in one, saving from the stale tab should ask you to reload saved preferences. It must not restore wider settings over a newer, narrower choice.

## Privacy and rollback

- Verify application logs with synthetic values: no birthdays, gender selections, age ranges or request bodies in matching logs, including invalid payloads or query strings. Monitoring should use counters or generic error messages only.
- A date of birth is self-reported, not age or identity verification. Deleting matching setup deletes all submitted values. Correction and re-enrollment windows last 30 days each and expired deadlines are ignored immediately. The API removes up to 500 expired guard rows at startup and hourly while running, so expired rows may remain until a sweep. Guards store no old birthdays and are removed when the owner account is deleted.
- Turn `DISCOVERY_MATCH_PREFERENCES_REQUIRED` off to restore earlier Discovery behavior without deleting submitted data. Setup and edits are unavailable while off; removal stays available. Leave the additive schema in place. Do not roll back by dropping either table or deleting profiles, chats, or existing plans.
