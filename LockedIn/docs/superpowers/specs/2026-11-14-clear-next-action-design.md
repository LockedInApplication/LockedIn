# Clear next action and navigation labels

The user selected two recommendations and explicitly requested implementation: lead each person to one obvious next action above the Home map, and rename Atlas, Roadmap and Chapters to destinations people understand.

## Scope and approach

Add a compact, playful Home card derived from the existing overview. Its single button navigates to an existing screen or focuses the current activity; it never submits answers or consent. Preserve the existing maps, privacy rules, data, forms and internal view keys.

Use these visible navigation labels: Home, Conversations, Understand each other, Our next steps, Past conversations. Keep every destination available. Give the longer labels readable mobile spacing using a scoped navigation stylesheet.

Approaches considered: a small derived card preserves existing flows and is the selected recommendation; a full guided wizard would change the product beyond the user's two selected changes. Implementation uses the existing React/Sass stack and no new dependency.

## Card behavior

- No relationship: retain existing invitation flow, no next-action card.
- Incomplete conversation: answer questions, wait for partner's answers, choose what to share, or wait for partner's reveal consent, matching SessionStage's guards in that order.
- Waiting copy must say whose action is outstanding and accurately describe privacy. Never claim already shared conversation answers are still private.
- After reveal: review incoming next-step proposals before general suggestions, and offer due reflections only when reflectionAvailable is true and the user has not reflected.
- Pending topic choices: review a partner's suggestion, resolve differing choices, or view one's saved suggestion while waiting.
- An unfinished Atlas chapter can be resumed when there is no unfinished conversation. Before both submit, explain the automatic two-submission opening rule; after both submit, do not call the meanings private.
- Otherwise, guide to existing next steps or a new conversation. A waiting state offers viewing progress, not an action that falsely promises advancement.
- Show a single primary button and concise copy. Include no private response text, notes or answer values in the card.

## Constraints and validation

Do not change backend, sharing behavior, URL routing, database or email delivery. No onboarding, reduced feature set or new feature flow. Current unsent forms must not remount because the card was added. Existing global Sass cascade is frozen by refactor regression tests: use separate feature-owned modules.

Validate branch selection with meaningful tests (including both partners' different states), then actual navigation/focus in desktop/mobile Chrome with controlled read-only overview responses. Check the existing public link after rebuilding/restarting only the web process. Keep API and tunnel running. No database writes during browser checks.
