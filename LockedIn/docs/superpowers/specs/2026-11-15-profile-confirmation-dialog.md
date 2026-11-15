# Profile leave confirmation

User approved replacing the browser-native profile warning with a LockedIn-styled
confirmation. Scope is profile navigation only; refresh, tab-close, and external-origin
unload warnings remain browser-owned. No account, password, or database behavior changes.

## Implementation

- Reusable accessible `ConfirmDialog` uses a styled native HTML dialog in the top layer.
- Keep editing is initially focused. Escape cancels. Explicit Tab/Shift+Tab wrapping,
  focus restoration, background inertness, scroll locking, mobile sizing, and reduced-motion
  styling preserve keyboard and accessibility behavior.
- Async profile leave decisions protect Back to our space, recovery, sign-out and history
  traversal. Duplicate requests do not replace an unresolved decision.
- Failed sign-out resets navigation approval, retaining protection of unsaved drafts.
- Same-profile hash traversal does not authorize later departure or refresh.
- Legacy history entries receive positional metadata without removing Next's state.
  Cancelling traversal returns to the original position without truncating Forward history.
  The existing beforeInteractive delegate runs before Next's history listener.

## Verification

- Browser regression first reproduced absence of an app dialog.
- Browser checks verify explicit leave/keep, Escape, focus/wrapping, history cancellation,
  recovery, failed sign-out retry, native refresh protection, and 390px mobile layout.
- The full browser suite passes with the Navigation API enabled and disabled.
- Separate same-profile traversal and legacy Forward-history checks pass.
- 104 web unit tests, web TypeScript, production webpack build pass. Lint has no errors,
  only the existing unrelated avatar image warning.
- Independent focused code review found the hash-approval and Forward-history issues;
  both were fixed and verified. All browser API responses were synthetic; no app records
  or real credentials were used or changed.

This UI change accompanies the profile feature. The user subsequently authorized committing
and pushing them together. No new dependencies or database migrations were introduced
specifically for this confirmation UI.
