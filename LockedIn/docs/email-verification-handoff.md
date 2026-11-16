# Email verification entry points: handoff

## User flow

Unverified signed-in users have **Verify email** in Profile & settings → Account security and on the unavailable Discovery screen. Both use `/verify-email?pending=1`. Profile navigation retains unsaved-change confirmation. Verified accounts do not see those actions; normal login and all existing Discovery eligibility gates remain unchanged.

The shared verification screen always offers an unverified/unknown user a usable resend form, including pending, bare and expired-link URLs. It never infers verification from query parameters. Signed-in email is prefilled from the current account without putting it in new URLs; signed-out users may enter an email manually. Submission is explicit, disables duplicate requests and provides safe success/failure feedback. A successful request does not imply delivery or verification.

**I've verified my email — check again** reads the authenticated server session with `disableCookieCache=true` and `cache: no-store`. Only a matching server account's verified flag can show success. The screen also checks status on opening for signed-in users, including after a verification-link callback. Account-keyed state and operation generations prevent delayed responses from appearing on a different account. Safe fixed links return to Discovery/settings after confirmation.

## Delivery prerequisites

The backend still needs `RESEND_API_KEY` and an authorized `RESEND_FROM_EMAIL`. Configure those privately in Render; never put credentials or verification/session tokens in screenshots or logs shared for diagnosis. This change does not configure Resend, send live emails, mark accounts verified manually or change `REQUIRE_EMAIL_VERIFICATION`. Keep normal login available until email delivery is independently confirmed.

## Verification

- Behavioral RED→GREEN: pending page missing resend form, bare URL false verification, missing current-account prefill, fresh status/recipient checks, missing Profile/Discovery actions and disallowed guarded navigation.
- Web suite: 140 tests across 33 files pass. Web TypeScript passes. ESLint: zero errors, one existing `components/avatar.tsx` image warning; existing Vite config-loader warning remains.
- Local production webpack build and browser acceptance use synthetic API responses only; no provider calls, real emails or production writes. Covers signed-in/out, pending/bare/expired URLs, delivery/network failures, duplicate submits, account switching during delayed delivery, stale ordinary-session flags, explicit fresh status checks, unsaved Profile cancel/leave and preserved Discovery denial after verification.
- 320/393/1280px verification layouts fit the viewport with 44px controls. Verification/confirmed phone screenshots visually inspected. Profile/Discovery phone entry screenshots are captured by the same runner.

Reproduce from `LockedIn/apps/web`: `npm test`, `npx tsc --noEmit`, `npm run lint`, then `node scripts/check-email-verification.mjs`. Supply `LOCKEDIN_PLAYWRIGHT_MODULE` if Playwright is not locally installed; the runner creates an owned local production preview, prints a temporary screenshot directory and shuts it down afterward. It requires local port/browser permission. Do not run a second build in the same `.next` output concurrently.

## Implementation decisions

1. Reuse installed dependencies; no setup-only install. If tooling is missing it must fail clearly, not alter dependency files.
2. Recheck authenticated ownership before sending; temporary session-read failure can block resend until retried, rather than select a recipient from stale account state.
3. Fresh account-scoped status determines Discovery prompt visibility; an extra read costs a request, and a failed read retains a generic unavailable state without granting access.
4. Discovery navigation permits only the exact fixed verification route; future route variants need an explicit allowlist change, rather than allowing arbitrary return URLs.

Independent review and final disposition will be recorded after the completed implementation checkpoint. This work does not include the user's separate header-alignment edits and is not pushed or deployed by this handoff.
