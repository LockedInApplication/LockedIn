# Our Week Together

In a mutually locked-in space, either partner can open **Our Week Together** from a quiet link below Talk, Plans, and Memories. It is a private look back at the last completed Monday–Sunday week (UTC): up to four plans marked done, four shared photos, and the most recent topic marked discussed. An empty week has no prompts or tasks. Opening or skipping the recap sends no notification and creates no record.

Opening a row takes you to the original plan or photo. **Our Week Together** takes you back from both. If a photo belongs to an envelope, captions already shared on that envelope are visible on the photo; they aren't copied into the recap. Private drafts, check-in answers, messages, and captions are not included in the recap response.

The read uses the same relationship, mutual lock-in, block, suspension, and leave checks as Memories. Both partners lose access when the space ends. This screen does not change either of the independent reporting features or their permission rules.

Apply the additive `20261125060000_our_week_together` migration before deploying the web change. It stores a date on future **Mark discussed** actions and clears it when a topic is reopened. Older topics stay in Room to Talk; their discussion dates are not inferred from edits.
