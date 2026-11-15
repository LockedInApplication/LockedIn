# Compact mobile conversations

## Intent

Phone testers find the conversation page too wordy and must scroll to find a partner's suggestion after opening a notification. Make the promised action immediately visible while preserving the playful LockedIn styling.

## Approaches and selection

- **Compact browser (selected by user):** partner suggestion first, scannable topic rows, details on tap. Makes browsing fast without showing every explanation.
- **One topic at a time:** less visible information but more navigation to compare topics. Not selected.
- **Scroll-only notification destination:** smaller change but leaves surrounding information competing for attention. Prefer a focused suggestion view instead.

## Scope and layout

1. On the conversations view, replace the large introductory section/member card and repeated explanatory choice board with a compact title and short contextual sentence. Keep access to workspace navigation, profile, invitations, and notifications.
2. Place a partner's pending suggestion before the topic list, with their name, topic title, and a clear review action. A user's own pending choice remains visible in a compact status area with withdrawal available.
3. Show topic icons, titles, and a short subtitle in compact rows. All existing topics remain accessible. Tapping a row opens a topic preview with the fuller description, existing prompt count, and an explicit Suggest action. Merely opening a preview must not submit a choice.
4. Move explanations into a 'How choosing together works' disclosure. Keep 'Either works for me' clearly available as an explicit alternative; do not hide essential privacy or consent information solely inside the disclosure.
5. Conversation-suggestion notifications open a focused suggestion view within the app, without the large introduction or roadmap above it. Show who suggested the topic, title, short description, explicit accept action, choose-another action, and a 'Back to our space' link. Opening the view never accepts it.
6. Preserve existing rules when a conversation is already active. Explain why new suggestions cannot start and offer a direct route to the active conversation instead of presenting enabled controls.

## Safety and stale state

Resolve the notification's suggestion against current server state. Withdrawn, replaced, already matched, and ended-relationship cases must not display actionable stale choices. Say what changed and offer an appropriate current destination. An old notification must not silently accept a replacement suggestion. Existing authentication, account isolation, dirty-answer navigation guards, disabled/busy states, and server-side mutual-choice validation remain in force.

## Non-goals

No changes to question content, matching rules, answer visibility, reveal consent, database retention, email delivery, or unrelated home/map sections. The mockup's bottom navigation is exploratory and is not included as an app-wide redesign. Do not add artificial topic rankings or recommendation claims.

## Implementation choices left to builder

Reuse the existing Next.js/React frontend, feature-based modules, SCSS design tokens, navigation, and notification infrastructure. Choose a small focused route/query state and accessible preview component that supports direct links, Back, keyboard focus, and narrow screens. Only extend notification identity metadata if needed to distinguish stale suggestions safely; do not change unrelated notification behavior.

## Acceptance

- At a typical 390px-wide phone viewport, the opened suggestion's title and primary response are visible without scrolling past global introductory content.
- The conversation browser shows useful topic choices immediately, with partner suggestions before general browsing.
- Previews and navigation never submit choices; submitting, accepting, withdrawal, and Either remain explicit.
- Long names/titles, loading/error states, active sessions, stale notifications, and keyboard/screen-reader use remain understandable.
- Regression tests cover explicit choice actions, mutual-choice behavior, focused notification navigation, stale identity handling, and preserved draft guards. Check mobile layout and desktop usability before completion.

## Status

Approved by the user on November 15, 2026; inline implementation authorized and implemented locally. Compact browser and focused suggestion notification destination verified with 111 web tests, 97 API unit tests, and 40 disposable-database integration tests. Production build and canonical typechecks pass. Independent review findings addressed. Not pushed or deployed.
