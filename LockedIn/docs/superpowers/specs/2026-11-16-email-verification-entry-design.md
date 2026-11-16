# Email verification entry points

## Intent

Help signed-in users with unverified emails find and complete verification without special URLs. Normal LockedIn remains usable; Discovery continues requiring a verified email and its existing pilot/safety gates.

## Approaches

1. Reuse the existing verification/resend page from Profile and Discovery (selected by the user). One delivery/error flow, with a page transition.
2. Inline sending forms on both screens. Fewer transitions, but duplicated interaction and error handling; not selected.

## Small-change design

- Profile & settings → Account security shows **Verify email** only for the authenticated account whose server profile says `emailVerified: false`. Navigation honors existing unsaved-change guards.
- Discovery's unavailable state explains that email verification is required when the current account is unverified, with **Verify email**. Do not imply verification is the only eligibility requirement or expose cohort/moderator configuration. Verified but otherwise ineligible accounts retain the existing unavailable state.
- Both actions use the existing `/verify-email?pending=1` page. Keep email addresses out of URL parameters; use the current authenticated account email to prefill when available. Retain the existing manually entered email flow for signed-out users.
- The resend page provides idle, sending, request-success and failure feedback, disables duplicate submissions while pending, and explains checking spam. A successful request is not proof of delivery or verification. Existing backend rate limits remain authoritative; no automatic retries or emails on page load.
- Provide an explicit **I've verified my email — check again** action for signed-in users. Re-fetch authoritative account/session state without a stale session-cookie cache; show a verified result only when confirmed by the server, with a safe fixed link back to Discovery or settings. Explain that verification may occur in another browser/tab. Account changes must reset account-scoped feedback and prevent old responses from updating the new account's UI.
- Database `User.emailVerified` and backend authorization remain the source of truth. React state tracks only request progress and feedback. Never set verification locally, trust a query parameter, or change the database from the browser.
- Existing signed verification links, expiry, callback validation and email provider are reused. Fix misleading copy implying normal login requires verification, without changing login policy. No secret values, session tokens or verification links are displayed in diagnostics.

## Constraints and non-goals

No new email provider, production configuration changes, bypass/manual verification, account enrollment, mandatory login verification, or unrelated header changes. Actual delivery still requires `RESEND_API_KEY` and an authorized `RESEND_FROM_EMAIL` on the backend; UI changes cannot replace that setup.

## Verification

Cover verified/unverified entry visibility, dirty-navigation protection, pending/success/failure sending states, already-verified refresh, stale sessions, account switching and unchanged Discovery admission. Run affected web tests, type checking and lint; exercise phone layout and the shared resend flow without sending to real accounts.

## Builder choices

Use existing Next.js, Better Auth, profile resources and styles. Choose the smallest reusable verification link/status component that fits those boundaries; no second auth-state store. Preserve unrelated dirty work. Implementation follows approval of this design and a short test-first plan.
