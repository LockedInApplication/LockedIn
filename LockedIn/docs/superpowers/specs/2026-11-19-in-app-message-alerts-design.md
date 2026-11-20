# In-app message alerts and quiet updates

## Intent

New messages should be easy to find while using LockedIn, even outside the conversation. Reading a chat or seeing changes elsewhere should not require a page refresh. Keep this release inside LockedIn: no phone push, email alerts, calendar changes, or new date-planning work.

## Approaches

- Use only the current live chat signal. This updates connected screens quickly, but missed signals cannot tell someone what remains unread after a reconnect or return.
- Keep durable unread state and use the existing live signal to refresh it. This is the chosen approach: it gives a reliable badge without building another notification channel or using a full reload.

## Message behavior

- Show a badge for conversations with unread messages in the existing in-app notification surface. An unread entry opens the conversation in the correct chat surface. Use a generic label and do not include message text in notification data.
- Track what each account has actually seen per conversation, using the existing ordered message sequence. A read acknowledgement is monotonic, authorized against the conversation, and cannot clear a newer message the client did not acknowledge. Sending a message never adds to the sender's unread count. The unread list excludes chats the viewer can no longer open.
- In a visible conversation at the latest messages, apply incoming messages quietly and acknowledge what is shown. If someone is reading older messages or the tab is hidden, preserve their place; keep the existing jump-to-latest affordance and leave newer messages unread until shown.
- Use the current notification stream as an invalidation hint, not a source of message content. Read the unread state on load, reconnect and the existing periodic recovery path. Avoid duplicate alerts from retries and across open screens.

## Replace the refresh banner

Remove the recurring global **Refresh when ready** prompts from Discovery and the shared workspace. Refresh data in place: apply safe updates immediately and defer data that would overwrite unsaved edits until editing ends. Never reload the whole page to apply routine activity. Keep targeted retry or clear conflict messages for actual failures at the feature that needs attention. Existing notification links and explicitly initiated navigation still work.

## Verification

Test with two accounts: send from either chat type while the other account is elsewhere; verify a persistent unread badge, the correct destination, and clearing only what was viewed. Cover repeated sends, reconnect, blocked/closed chats, newer messages arriving during acknowledgement, hidden tabs, and reading older messages. Verify live updates do not reset an unsent chat draft, overwrite an unfinished workspace edit, or jump the chat scroll. Check regular updates no longer show the global refresh banner.
