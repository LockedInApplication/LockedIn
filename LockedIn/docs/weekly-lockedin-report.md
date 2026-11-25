# Weekly LockedIn report

**Built for testing; not approved or enabled for live reporting.** The published [Together privacy notice](https://lockedin-web-76oy.onrender.com/privacy) describes plan and memory totals for couples who both agreed to the Together pilot. It does not describe reporting on signups, accepted invites, or Inbox activity. The new report has separate permission records and a separate key. It does not change Together eligibility or use its roster, key, or activity.

## What the totals mean

The report covers a completed Monday–Sunday UTC week. Accounts are counted once globally; the connection totals below are shown separately for Discover and direct invites.

- **Signups:** accounts created that week with permission at signup. Granting permission later does not add older signups.
- **Verified accounts:** how many of those same accounts have a verified email when the report runs. We do not have a verification timestamp to reconstruct which day verification happened. The number can change when rerun.
- **Accepted invites:** invitations accepted that week after both people granted permission. A direct invite that reuses a Discover chat counts as a direct acceptance, without creating a second counted chat.
- **First two-way chats:** among chats opened by those invites, both people sent a regular message within seven days of acceptance. One chat is attributed only to its original route. Date-plan and place-share events do not qualify.
- **Repeat two-way chats:** among those same chats, both people sent again after the first exchange's UTC day and within seven days of that exchange. They don't have to send on the same day as each other. Inbox messages at or after mutual Lock In are excluded from both chat metrics.

Newer weeks can show signup and invite totals while chat follow-up is still pending. The full first-chat window matures seven days after week end; the repeat window matures after fourteen. A null is pending or withheld, never zero. Read the two readiness flags to tell which windows are complete. Don't show totals for groups with fewer than five distinct accounts or pairs. Suppress small subtotals and complementary cells too, so subtracting two published totals doesn't disclose a small group.

The query uses existing dates, verification status, internal IDs, and message type markers. It never selects message text, emails, names, exact locations, photos, recordings, or note content. It doesn't add a tracking SDK or store a copy of activity. No individual rows or caller-selected account, geography, or partner filters are available. Deletions and withdrawals can change past totals.

## Before turning on live reporting

The additive migration can deploy while reporting is off. It installs an empty permission table and does not add any accounts or change Together.

1. Review and approve a separate notice for this purpose. Tell existing users what will be used, when it starts, and how to make or withdraw their choice. Set up and verify the separate permission process before including real accounts. The migration creates an empty private table; there is no automatic enrollment, user enrollment/withdrawal UI, bulk import, or analytics backfill in this change.
2. Record only permission actually given for this report, with its original time. Do not treat a Together opt-in, ordinary app use, or silence as permission. Before launch, provide a way to withdraw from this report; removing that account's permission excludes its contributions from future requests, including reruns. App content stays untouched.
3. After approval, verify the migration is applied, use `npm run report:lockedin:key` from the services folder on the authorized Mac, and configure only its **public** key as `LOCKEDIN_REPORT_PUBLIC_KEY` on the production API. The CLI installs a separate signing helper in Keychain; the current Together key cannot authorize this report. Enable `LOCKEDIN_REPORT_HTTPS_ENABLED=true` only after notice, permission, and access review. Keep it unset for now. Disabling the flag removes this endpoint without affecting Together.

Once approved and enabled, ask here: “Show me the weekly LockedIn report.” The local command is `npm run report:lockedin`, or `npm run report:lockedin -- YYYY-MM-DD` for the Monday of a completed UTC week within the last 52 weeks. Access is read-only, signed, and uncached. No dashboard, routine delivery, sharing, or production setup was added.

### Draft notice for review, not published

> If you choose to join weekly app reporting, we use your signup date and email verification status to understand whether account setup is working. When both people have agreed, we count accepted Discover or direct invites and whether both people send a message in Inbox and return to that chat. We count those actions only after permission and don't include messages sent after mutual Lock In. We use internal IDs and dates to match actions without reading the words you send.
>
> Authorized LockedIn operators see weekly totals with small groups hidden. They don't get a list of people, private content, or activity for any individual account. You can decline or withdraw without changing how you use LockedIn. Withdrawing keeps your activity out of future requests, including reruns for earlier weeks. The Together pilot has its own separate choice.

Add the effective date and the actual link to the reporting choice before this draft is sent or published. Publishing it alone does not record permission.

## Local verification

Use the existing `scripts/verify-discovery.mjs` harness with an explicit disposable localhost admin database. The report integration spec seeds synthetic accounts and messages, then checks the same aggregate through a signed API request. Never point tests at a live database or use the production report key.
