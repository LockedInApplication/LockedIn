# Roll out date planning in chat

Date planning is off unless the API service has `DATE_PLANS_ENABLED=true`. It is independent of `DATE_SPOTS_ENABLED`: switching off venue search and live place details does not remove scheduling for venues already shared in chat.

1. On staging first, run the release's normal `prisma migrate deploy`. The shared sheet uses `20261120010000_shared_date_sheet` and `20261120011000_date_plan_receipts` on top of the original `20261119005000_chat_date_plans`. These migrations are additive and leave old messages and read markers in place.
2. Deploy the matching API **before** the web build, with planning off for first-time enablement. The new web build requests sheet presentation and separate unread counts; clients that do not request sheet presentation can still use the inline planner after the API upgrade. Confirm ordinary chat and enabled venue search still work.
3. Set `DATE_PLANS_ENABLED=true` on the Render **API** service and restart/redeploy that service. Check that the running API has the migration before exposing the flag. Repeat in production only after the smoke test passes.

## Two-account smoke test

- In a writable Discovery conversation and an accepted direct-invite conversation, open **Plan a date** in the chat header. Browse, review a public venue and choose it. Check that available photos appear and that browsing and choosing don't send messages.
- Set a time and **Send invite**. Check that chat gets one compact invite, the proposer sees **Waiting for their reply**, and the other account gets a separate **Date update** in LockedIn when in-app activity is enabled. Open it from the bell and check that the right plan opens without clearing any unread text.
- On the second account, **Suggest another time**. Confirm that the first account gets the update without losing a typed message or scrolling away from older messages. The chat should still have one invite, which opens the plan's current details and activity.
- Confirm from the first account. Both accounts should see **Date confirmed**. Download the calendar file and check the venue and time. It creates no external calendar event or invitation by itself.
- Cancel from either account. Verify the calendar download is gone, the original invite still opens its now read-only plan, and ordinary chat continues. In staging, also turn off venue search and verify that **Use a shared place** still works from the sheet.

If date planning needs to be withdrawn, set `DATE_PLANS_ENABLED=false` and restart/redeploy the API. Leave the additive migration and stored data in place. Existing plan events remain as generic text in chat, and normal messaging continues. Downloaded calendar copies are not updated or deleted by LockedIn.
