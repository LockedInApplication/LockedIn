# Tiny Lantern: a friendly guide to Together

## Intent and approach

Help each person understand what they can do after locking in without adding a required tour or another destination. The chosen personality is the **Tiny Lantern with the Gentle Host’s voice**: a small, slightly surreal character with warm, plain-spoken tips. A practical text-only guide would be simpler but loses the character; an animated sidekick with frequent jokes would draw more attention. Use the animated lantern with written, screen-specific help. Do not build an AI chatbot or a relationship coach.

## First version

- On each person’s first visit to **Together** after mutual Discovery lock-in, show one small, dismissible, in-page greeting: “You two are locked in! Keep chatting, make a plan, or try a guided conversation. No rush.” Use the active relationship’s server-confirmed lock-in state; the Together overview currently does not expose that state. Derive it from the linked Discovery connection without a database migration. A direct invite can open Together without mutual lock-in, so it does not trigger this greeting.
- Show the greeting at most once per account and shared space in that browser. Record that locally when shown; if browser storage is unavailable, offer manual help only. Do not infer a lock-in from a URL or a prior visit. Do not steal focus, redirect, or cover the existing actions.
- Keep a small **Need a hand?** control in the Together workspace. When someone opens it, show a short tip for the current view. Start with Together home, **Our next steps** (“Suggest an idea. You don’t have to pick a day yet.”), and **Guided conversations** (“Answer privately. You decide what to share.”). Manual help is also useful in direct-invite spaces; use neutral copy there. Do not put the companion in chats or introduce new notifications.
- Give the lantern one brief, silent greeting motion, with a still state when reduced motion is enabled. Exact artwork is left to implementation; the control and dismiss action must work on mobile and with a keyboard. No access to chat, private answers, or other personal content; tips depend on the current screen, not what people write.

## What stays the same

Keep existing chat, planning, check-in, and consent rules intact. No navigation redesign, tracking of tips, new account settings, or deployment is part of this design. Test both members’ first visits, dismissal and reload, manual help, account switching in the same browser, direct invites, and reduced motion. The underlying actions must work whether the guide is open, closed, or absent.
