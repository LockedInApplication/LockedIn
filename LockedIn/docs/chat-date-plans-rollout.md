# Roll out date planning in chat

Date planning is off unless the API service has `DATE_PLANS_ENABLED=true`. It is independent of `DATE_SPOTS_ENABLED`: switching off venue search and live place details does not remove scheduling for venues already shared in chat.

1. On staging first, apply Prisma migration `20261119005000_chat_date_plans` using the release's normal `prisma migrate deploy` configuration. It adds an empty plan table and nullable metadata to chat messages. It does not convert old suggestions or change old messages.
2. Deploy the matching API and web builds with the feature off. Confirm that ordinary chat and any enabled venue search still work.
3. Set `DATE_PLANS_ENABLED=true` on the Render **API** service and restart/redeploy that service. Check that the running API has the migration before exposing the flag. Repeat in production only after the smoke test passes.

## Two-account smoke test

- In a writable Discovery conversation and an accepted direct-invite conversation, open **Plan a date** beside the composer. Browse, open a public venue and share it. **View place** should show available venue details and photos without sending a message.
- Use **Suggest a time** on that spot. Confirm that the proposer sees **Waiting for their reply** and the other account gets the ordinary unread chat badge if it is outside the chat and has in-app activity enabled.
- On the second account, **Suggest another time**. Confirm that the first account gets the update without losing a typed message or scrolling away from older messages. The original proposal should remain readable but no longer actionable.
- Confirm from the first account. Both accounts should see **Date confirmed**. Download the calendar file and check the venue and time. It creates no external calendar event or invitation by itself.
- Cancel from either account. Verify calendar download is gone, and send an ordinary message in each chat. In staging, also turn off venue search and verify that the previously shared venue still offers **Suggest a time**.

If date planning needs to be withdrawn, set `DATE_PLANS_ENABLED=false` and restart/redeploy the API. Leave the additive migration and stored data in place. Existing plan events remain as generic text in chat, and normal messaging continues. Downloaded calendar copies are not updated or deleted by LockedIn.
