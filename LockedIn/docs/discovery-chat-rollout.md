# Discovery chat pilot

## Scope

Text-only chat is attached to an accepted Discovery connection, not an independent
inbox. A profile reply expresses interest; acceptance opens Messages, where the
original invitation reply is displayed first with its saved prompt context.
The opener uses the existing invitation record, not a duplicated message row;
its report action uses the existing invitation-evidence path. The original reply
stays visible above paginated follow-up messages, including after reconnecting.

There is no separate private-response composer in the connection UI. Existing
shared responses and the owner's saved private drafts remain in collapsed,
read-only history. Private drafts are never automatically sent as chat messages.
Legacy invitations with no hello show their question without inventing a message.

No attachments, typing indicators, read receipts, date plans, calendar
permissions or push notifications are included.

The API checks both participants and current Discovery eligibility under the
same ordered account/connection locks as blocking and closure. Closing, blocking,
suspension or promotion stops chat access; blocked chats are not reopened by
unblocking. Existing starter-response history retains its separate access rules.

## Delivery and recovery

Messages are committed to Postgres before emitting a content-free signal on the
existing authenticated SSE stream. One stream is reused; there is no second
chat connection. The open thread reloads on stream open, signals, focus, online
and visibility changes, plus every 15 seconds while visible as a fallback.
History is loaded in bounded pages. A reconnect with more than a page of missed
messages resets pagination rather than stitching together a hidden gap.

Request IDs deduplicate retries; reusing an ID with different text is rejected.
Messages are plain React text, never rendered as HTML. Limits are 2,000 characters,
20 messages/minute and 300/day/account. No message bodies are added to logs,
notification rows, or stream payloads.

## Reporting and deletion

Each received message has a report action. Reports copy only that message's
server-side text, send time and public alias, not private starter drafts or
surrounding messages. The server permits reporting a previously received message
by its ID after chat closure; the closed chat itself is not readable through the
chat API. Reports must be made before leaving a blocked/closed chat if the user
needs the on-screen report picker.

Message history cascades with deletion of the user or connection. The existing
account-deletion service refuses accounts involved in safety reports, preserving
reported evidence for manual review. Backups and provider retention are unchanged.
Do not describe messages as end-to-end encrypted.

## Release

1. Keep DISCOVERY_CHAT_ENABLED unset or false.
2. Apply the additive 20261117190000_discovery_chat migration through the existing
   release process and regenerate Prisma. Do not run migrate dev in production.
3. Deploy API and web together, then enable DISCOVERY_CHAT_ENABLED=true on the
   authorized pilot API. Reload the web app to pick up capabilities.
4. Verify two accounts, reconnect/catch-up, reporting and block/close behavior on
   mobile and desktop before widening access.
5. To roll back access, set the flag false; do not drop message tables.

The broker remains process-local. Multiple API instances need shared live-event
delivery; the 15-second refresh still recovers database state. Free-service sleep
and offline browsers do not provide guaranteed instant delivery or reminders.
