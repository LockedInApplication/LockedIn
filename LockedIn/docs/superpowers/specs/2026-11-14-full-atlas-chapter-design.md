# Full Atlas chapter viewer

The user requested the proposed View full chapter button and Superpowers workflow. Extend the completed-history fix already present in this worktree. Reopen the original saved chapter, rather than reconstructing it from the current chapter.

Each completed history entry and the current shared chapter receives a View full chapter button. It opens a native modal dialog showing the saved date, both people's definitions, examples and what the word does not mean, their understanding summaries and recorded check results, and the final shared definition. The view is read-only, includes loading/error/retry states, and preserves the current chapter and unsent form state when closed.

Use a dedicated authenticated GET endpoint with the chapter ID, SHARED status and relationship membership enforced together in the database query. Never expose an unfinished chapter or another relationship's responses. Return only the fields required by the viewer. Old SHARED chapters without newer proposal/approval records remain supported. Missing historical fields are marked unavailable rather than invented.

Approach: a modal preserves the current form and existing Journey URL; a new page would require form preservation/navigation, while permanently expanding every historical response would overwhelm the history. These implementation choices follow the user's approved request to revisit both people's shared answers and final agreement.

Keep the established playful typography, colors and shapes using a small feature-local Sass module. Preserve existing CSS, API contracts, database records, and migrations. No database writes, new runtime dependencies, exports, or changes to sharing consent.
