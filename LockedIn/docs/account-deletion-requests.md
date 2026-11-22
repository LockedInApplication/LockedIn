# Assisted account deletion

In **Profile & settings → Delete account**, members can still delete an eligible account with their current password. **Request account deletion** creates one private manual-review request for the signed-in account, with a reference that remains visible after a reload. It does not delete data, sign anyone out, change visibility, or send an email. The request contains no reason, password, or copied email address.

## Release and coverage

Apply the additive `20261121011000_account_deletion_requests` migration before deploying the API. Verify the API is live before deploying the web. Assign a privacy operator to review the queue before inviting people to use this path; no email alert or automatic completion is wired up. A Discovery moderator does not receive access by being a moderator.

## Review queue

An authorized privacy operator with database access can list pending requests oldest first. Only look up the account email when needed to follow up; do not export the queue to shared channels.

```sql
SELECT id, "userId", "requestedAt"
FROM "AccountDeletionRequest"
ORDER BY "requestedAt" ASC
LIMIT 100;
```

Use the request reference when following up. Review photo cleanup and protection of safety evidence before authorizing deletion. The queue is not permission to bypass those safeguards or issue a raw user delete. A completed account deletion clears its queue row through the foreign key. Do not remove pending rows just because they were read.

## Local acceptance

From `LockedIn/services`, with `DISCOVERY_TEST_ADMIN_URL` pointing at an isolated localhost Postgres server and Playwright available, run:

```sh
LOCKEDIN_BROWSER_SCENARIO=together-exit node scripts/verify-discovery.mjs --messaging-browser
```

The harness creates an isolated database. Its two-account scenario captures verification mail locally and uses a fake venue provider. It covers invite, verify, chat, plan a date, mutual Lock In, both maps, the check-in entry, leaving Together, and the deletion request receipt after reload.

## Automatic photo cleanup

Apply `20261121012000_account_photo_cleanup` before deploying the API. Existing manual requests stay manual and do not authorize new deletion. Enable `ACCOUNT_PHOTO_DELETION_ENABLED=true` on the API only after the code and schema are live and a privacy operator can monitor exceptions. Use the existing production Cloudinary configuration. If it is missing, an account with files still to delete uses manual review; confirmed photo history with no remaining file does not need Cloudinary.

The API wakes the cleanup worker on a new confirmed request and retries while the service is running. The production Cloudflare Worker in `ops/photo-cleanup-cron` also wakes the API every 30 minutes so pending work can resume after Render sleeps. It has no public route, database URL, or Cloudinary credentials. It can only ask LockedIn to process jobs that members have already authorized. A successful trigger confirms the round ran, not that every queued asset was erased.

1. Keep `ACCOUNT_PHOTO_DELETION_ENABLED` unset or false in the production API. Generate a dedicated 32-byte secret, encoded as 64 lowercase hex characters. Store it as `ACCOUNT_PHOTO_CLEANUP_TRIGGER_SECRET` in Render's production API environment and as an encrypted Cloudflare Worker secret with the same name. Do not log it or store it in version control.
2. Deploy the API with automatic photo deletion still off. Deploy the Worker with its checked-in schedule, with `workers_dev` and preview URLs disabled. Do not copy production credentials into staging or Cloudflare.
3. Verify an actual scheduled run reports a completed round before enabling the feature in the production API. Use the local integration suite to exercise photo deletion and provider failure; do not use real accounts to test failures. Check Worker failures and the private manual queue routinely.

Turning the flag off stops new automatic deletions; leave retries running so already confirmed jobs can finish. The existing `npm run discovery:photo-worker -- --once` command remains available to operators in the API environment if they need to run a round manually. Do not roll back the session-safety code while a request has state `CLEANING_PHOTOS` or `CLEANUP_NEEDS_REVIEW`.

- `MANUAL_REQUEST`: The member used the existing request form. Their account is still available.
- `CLEANING_PHOTOS`: The member confirmed deletion using their password. Sessions are revoked and their Discovery profile and photos are hidden. The worker keeps the account and photo pointers until erasure is confirmed.
- `CLEANUP_NEEDS_REVIEW`: Cleanup stopped because of records that must be preserved or a job that could not finish safely. Leave sessions revoked. Investigate the stored provider reference and retention constraints before resuming or completing the request. Never remove the request row to clear a failure.

Add `state` to the queue query above to distinguish requests. The receipt shown after sign-out confirms that cleanup started; it does not claim completion or send a completion email.
