# Save a memory: pilot

After a shared plan is marked done, past plans opens to it. In a mutually locked-in space, either person can choose **Save a memory**. The Behind the Photo composer starts with the plan's title and displays its date, if it has one. Nothing is saved until the person shares a photo. The first shared photo becomes the plan's memory; both people can reopen it and use the existing written or voice details. Undoing Done does not remove a saved photo.

Apply the additive `20261125020000_plan_memories` and `20261125030000_together_weekly_report` migrations and deploy the API before the web release. The normal API start command runs `npm run prisma -- migrate deploy`. There are no new reminder settings, push notifications, or prompt features in this phase.

The public Together notice is at `/privacy`. Deploy the API with the additive `20261125040000_together_reporting_opt_out` migration before deploying the web control. Either partner can privately opt out from **Profile & settings → Privacy & safety → Together reporting**. Opting out is saved against that account and withdraws its existing pilot enrollments. There is no in-app enrollment or undo in this phase, and no notification goes to the partner. Opt-out does not alter their Together content or access.

## Ask for the report

On the Mac with the report key, you can ask in the desktop Codex chat, “Show me last week’s Together report.” It runs only when requested; nothing is scheduled, published, or added to Moderation. From `LockedIn/services` the same command is:

```sh
npm run report:together
npm run report:together -- YYYY-MM-DD
```

Omit the date for the latest finished week or supply the Monday of a finished UTC week in the last 52 weeks. The end date is exclusive. The database fixes the cohort; the reader cannot choose or look up a pair.

- **Plans:** distinct plans first proposed, accepted, and marked done during the week while enrolled. Those are separate activity counts, not a same-plan funnel. A counteroffer does not create another plan. Undoing Done clears its completion timestamp, not the acceptance or the memory. Acceptance and completion dates begin with the new API; older dates are not guessed.
- **Shared actions:** count a pair once per week when one accepts the other's plan or adds the first partner detail to a plan-linked memory. The opt-in count is the number enrolled by the end of the week, not the number that opened the app.
- **Memories:** of plans still marked done that were completed that week, how many had a picture before week end, and how many had a detail from the other partner by then.
- **Repeat memories:** among pairs whose first two-person plan memory happened that week and who have had 30 days of follow-up, how many had another one 7–30 days later. Suppressed until at least five pairs qualify. The rest of the report is suppressed when fewer than five pairs were enrolled by week end.

The report reads only dates and the IDs needed to count each pair. The results contain no participant IDs, names, plan titles, message or note text, photos, recordings, or per-pair rows. It is a snapshot of records still present; deleting something or withdrawing changes past counts. No analytics copy is retained.

## Protected HTTPS access

The Mac with the dedicated signing key calls the production API over HTTPS. The private key is stored in the login Keychain; the local signing helper emits only a signature or public key. Only the public Ed25519 verifier is deployed. A request signs the method, exact report date (or default week), timestamp, nonce, and production origin. Proofs expire in 45 seconds and used proofs are rejected by the current server process. HTTP responses are not cached. No database login, app login cookie, or moderator role is used, and the route cannot select individual couples or perform writes. It has no enrollment or admin actions.

The verifier in `together-report.production.ts` applies only to the named Render production API service on the production branch. `npm run report:together:key` installs the local helper, creates a new signing key on a Mac, and emits only the public key. It does not replace an existing helper or Keychain item. `npm run report:together:key -- --show-public` emits the public half of the existing key. Never copy out the private item. Allow the dedicated Keychain item if macOS prompts during a report.

For emergency revocation, set `TOGETHER_REPORT_HTTPS_DISABLED=true` on the production API and deploy it. To replace a key, create a new dedicated Keychain item on the replacement Mac, deploy its public verifier using `TOGETHER_REPORT_PUBLIC_KEY` or update the existing public configuration in Git, and verify the old key no longer works. A configured empty public key disables the endpoint. Keep the public verifier server-side; do not configure keys in the browser or frontend.

## Optional direct database access

Use this only when there is already an approved connection to the PostgreSQL port. The HTTPS route does not need these steps.

1. After the migrations are live, use the database owner's existing verified-TLS `psql` connection to the Render database that the LockedIn API uses. Start `psql` from `LockedIn/services`. Do not paste the owner URL into chat or reuse it as the report login. Provisioning creates a disabled role and aborts if inherited public grants would let it access application data. See [Render’s PostgreSQL connection guide](https://render.com/docs/postgresql-creating-connecting#external-connections).

   ```psql
   \set ON_ERROR_STOP on
   \i scripts/provision-together-report-reader.sql
   SET password_encryption = 'scram-sha-256';
   \password lockedin_report_reader
   ALTER ROLE lockedin_report_reader LOGIN;
   ```

2. Set a unique strong password at the hidden `\password` prompts. In **Keychain Access** on the Mac that runs Codex, [add a password item](https://support.apple.com/guide/keychain-access/kyca699a9058/mac) named **LockedIn Together Reporting** with account **lockedin_report_reader**. The password item contains only the reader's URL: `postgresql://lockedin_report_reader:READER_PASSWORD@RENDER_EXTERNAL_HOST:5432/DATABASE_NAME`. Use the full Render database hostname and a URL-safe generated password (or percent-encode it). The runner verifies TLS for remote connections. Do not expose Postgres or widen its IP allowlist for reporting; use the database's existing approved access path. If that path is not reachable, do not enable a broader one as a workaround.
3. Run `npm run report:together:db` once to confirm direct access. The command reads that Keychain item without printing it. On other machines, inject `LOCKEDIN_REPORT_DATABASE_URL` from an approved secret store; it never uses the application's `DATABASE_URL`. A one-time Keychain or network approval may be needed. To revoke access, run `ALTER ROLE lockedin_report_reader NOLOGIN;` and `REVOKE EXECUTE ON FUNCTION lockedin_reporting.weekly_together_report(DATE) FROM lockedin_report_reader;` as the owner, then remove the local Keychain item.

## Enroll the pilot cohort

Only the database owner or their approved operator enrolls participants. After both partners agree, privately set `approved_pair_id` in `psql` to the canonical Together relationship ID and insert it using the current time. Do not backdate enrollment or share the roster.

```sql
INSERT INTO lockedin_reporting.pilot_pair (relationship_id)
VALUES (:'approved_pair_id') ON CONFLICT DO NOTHING;
```

Encourage members to use the private opt-out control to withdraw. Existing enrollments are removed, and the report rechecks that each enrolled space has two accounts and neither has opted out, so adding an old enrollment again cannot override a withdrawal. App content stays untouched. The report login cannot insert, see, or remove roster rows. An empty roster is safe and displays no totals.

## Before broadening reporting

Do not remove the pilot roster, expand the query, or backfill existing activity in this release. Publishing the notice is not consent or a direct user announcement. Separately send existing users a clear notice before any broader rollout, with the new scope, effective date, link to the notice, and their choices. Collect affirmative permission where required before including a pair; silence does not enroll them. Keep the same protected totals-only access and small-group threshold. This release does not send announcements or enroll anyone automatically.

Next, ask pilot participants whether they missed notes their partner actually sent before adding a notification. Test one optional plan-based **Moment for Us** separately after that.
