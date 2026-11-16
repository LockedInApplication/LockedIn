# Discovery pilot: local verification and handoff

Date: 2026-11-16. Implementation checkpoint: `bb7fdeb` on `codex/feature-slice-refactor-complete`. This is a local, disabled-by-default feature—not a production launch. Nothing was pushed, merged, deployed, enabled for real accounts or migrated against production.

## Evidence

- Entire API suite in a newly created, guarded local database: **222 tests / 38 files passed, zero skipped**. Includes real PostgreSQL transactions, API authentication, notification SSE, legacy invitations, account settings and conversation integration.
- Additive migration rehearsal: exact before/after snapshot across 16 old tables, including active/archived sessions, private answers/reveal choices, accepted next steps/reflections, chapter proposals/selections/both approvals, membership IDs and notification preferences.
- Web: **124 tests / 29 files passed**; TypeScript clean. ESLint has no errors and the pre-existing `components/avatar.tsx` image warning. Existing Vite native-config warning also remains.
- API TypeScript: **20 pre-existing diagnostics**, independently reproduced on the pre-feature archive: five in `atlas.service.spec.ts`, seven in `atlas.state.ts`, seven in `conversation-suggestion.integration.spec.ts`, one in `invitation.service.ts`. No new discovery diagnostics. This is not a clean API type check.
- Production webpack build and real synthetic multi-account browser workflow passed. Actual profile publication, area browsing, exact notification route, two separate invitations, acceptance/decline, owner-only drafts, explicit immutable sharing, standalone reflection, existing-space preservation, mutual exactly-once promotion, report form, moderator suspend/restore, block/unblock boundaries, disabled admission/history, and account switching were exercised.
- Modern Navigation API and fallback-history Back/Keep editing preserve unfinished text. Canceling a close action does not approve a later navigation. A newly created shared-space link appears only after checking the caller's current relationship; blocking does not hide or end an existing deep space.
- Layouts checked at 320/393/430/1280/1920px with reduced motion, no horizontal overflow and at least 44px effective button/input targets. Existing header alignment check passed nine widths, including classic-scrollbar geometry. Primary phone profile/browse/invitation/starter/reflection/moderation screenshots were visually inspected.

The final combined run uses `verify-discovery.mjs --browser`, then web tests/types/lint. The browser fixture builds its own production preview with an explicit local proxy and free owned ports; it does not mock discovery business logic or use live accounts. The database is removed in `finally`; screenshots/logs are kept in the printed system-temporary directory.

Independent whole-feature review of `5a62b9b..bb7fdeb`: **completed**. It identified no Critical issues, four Important frontend issues, no Minor issues, and no declined-to-judge items. The author verified and addressed the four findings in one test-driven fix pass; this is not a claim of a second independent review of the fix commit.

| Review finding | Fix and regression |
| --- | --- |
| Typing while profile Save/Publish is pending can be discarded by the revision-keyed remount. | All editable fields and consent are disabled until the real response is installed. A delayed real save/publish response checks every editing control; the original regression failed on enabled controls. |
| Query-only history changes discard an invitation hello without confirmation. | Navigation identity includes pathname and query, fallback restoration keeps the full source URL, and a new editor gets fresh guard state. Modern and fallback Back/Forward tests cover repeated Keep/Leave/Keep cycles and retained hello text. |
| Choosing Build while a response is dirty can promote and strand unsaved text. | Readiness offers the existing explicit save/discard decision before a potentially promoting request. Keep editing preserves text and creates no relationship; private Save still creates no shared snapshot. |
| Older shared responses and the original received invitation cannot be selected for reporting. | A labeled content selector and excerpt identify the exact immutable evidence. The browser reports version 1 after version 2 exists and verifies the stored server snapshot is version 1; the received invitation remains selectable. |

Each interaction regression was observed failing before its production fix and passing afterward, with the full web suite green after each. Final combined post-review verification passed: API 222/222 (zero skips), all four browser regressions together and the complete real multi-account workflow, production webpack build, web 124/124, web TypeScript and lint (zero errors, one existing warning). The fresh API type check still reports exactly the 20 baseline diagnostics listed above. `git diff --check` passed. Final phone profile/starter screenshots were visually inspected. Live rollout still requires the separate operator approvals in the runbook.

## Decisions and costs if wrong

1. New-entry admission is separate from authorized history/safety access. Broad cohort checks must not strand old data; a wrong boundary could expose new contact or hide history.
2. Discovery-created canonical blocks retain a nullable safe public-name label; old lists use it without widening ownership. A wrong serializer could change legacy labels or reveal private account names.
3. Existing installed dependencies were reused, with no setup-only install. Missing optional tooling must fail clearly rather than silently rewrite dependencies.
4. The block-label column landed with the foundation; its legacy serializer behavior landed with safety controls. Both surfaces were tested to avoid an integration gap.
5. Browsing requires adult attestation, explicit publication and unpaused visibility. This intentionally rules out invisible browsing; a different product choice would need explicit approval.
6. Candidate intentions match exactly, not through inferred compatibility. This can produce a smaller honest pool rather than invented predictions.
7. Republishing edits preserves pause; only Resume reverses it. Copy must explain why a newly published edit may still be hidden.
8. Canonical pair/lock order comes from PostgreSQL `ORDER BY id`, not JavaScript sorting. The local collation differs for mixed-case IDs; getting this wrong risks constraint failure or deadlock.
9. Sender-scoped invitation request IDs were added in a separate nullable additive migration. Extra schema is carried to guarantee stable retries without rewriting old attempts.
10. Pause retains pending invitation acceptance, subject to current admission/attestation/consent and safety checks. A paused person may receive an acceptance of an already-sent invitation, but never a new invitation.
11. Restricted report evidence/source/request IDs and moderator request IDs were added additively. Without durable snapshots, later edits could change what a report meant; existing records remain untouched.
12. The old notification CHECK was extended to exactly one of three contexts, retaining zero/two-source rejection. A faulty constraint could admit ambiguous notifications; real SQL tests cover it.
13. The existing profile leave guard was parameterized instead of installing another history bootstrap. A mistake could lose a draft; both browser mechanisms and existing history tests cover the change.

## Separate work preserved

The user's pre-existing header-alignment edits in `WorkspaceHeader.tsx`, `workspace-header.module.scss` and `check-header-alignment.mjs` remain separate and uncommitted. Discovery-specific header additions were staged independently; none of those original edits were reverted or bundled silently.

See [operator runbook](discovery-pilot-runbook.md) for cohort/moderator/catalog configuration, report coverage, consent limits, backups, flag-off recovery and approval requirements. Broad manual areas and an illustrative radar are implemented; no GPS, Bluetooth, exact distance, location tracking or photo upload is added.
