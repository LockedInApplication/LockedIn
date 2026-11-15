# Mobile header and action-first Home

Approved in conversation: user selected compact avatar menu and asked to implement.

## Intent and scope
Make account controls usable on phones and put the next action before Home's introductory content. Preserve desktop appearance, navigation callbacks, draft guards, notification behavior, and all relationship/consent rules.

## Approaches
- Selected: logo, existing bell, avatar disclosure on mobile; Profile, Invitations, Sign out inside it. Home greeting then next action, followed by partner details/navigation/map.
- Not selected: all account controls spread over two header rows; consumes too much vertical space.

## Design
Use an accessible button/disclosure panel, not a custom ARIA menu. Keep existing desktop controls. On mobile, show only logo, bell, avatar; each target at least44px. Menu closes on Escape, outside click, selection, and desktop resize; keyboard focus returns to its trigger on Escape. Existing guarded callbacks own navigation and signout. Keep the bell usable independently.

Render one next-action card, not separate desktop/mobile duplicates. Use responsive layout ordering with mobile greeting then card, partner details, nav and map. At desktop keep intro/nav/card/map visual order. Keep focus order consistent with visual order for interactive controls at each breakpoint. Pending activity/error notices stay visible. Disconnected/invitation/focused suggestion flows retain their current structure apart from the shared header.

## Non-goals and checks
No bottom navigation, app-wide typography refresh, auth-form changes, backend changes, push or deployment. Test320/360/390/430px and desktop, long names, menu keyboard/outside dismissal, existing dirty guards, exactly one action card, and primary CTA visibility within390×844. No real account mutations.
