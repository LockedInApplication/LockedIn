# Mobile authentication panel contrast

## Intent
Keep the login and signup information readable on phones: decorative circles currently sit behind gold and white text.

## Approved direction
At viewport widths of 600px or less, hide both decorative pseudo-elements on the authentication information panel. Keep its solid plum background, existing copy, typography, spacing, and form behavior. Keep the design above 600px unchanged.

## Approaches
- Hide the circles on phones (selected by the user): predictable contrast and a calmer panel.
- Shrink and reposition the circles: preserves more decoration but may still interfere with wrapped text.

## Scope and verification
Change only the existing mobile styles in `apps/web/src/components/styles/authPage.module.scss`. Both login and signup share this panel and receive the same improvement. Verify the circles are hidden at 393px and 600px, remain present at 601px and desktop, and content remains visible without horizontal overflow. No navigation, backend, form, or desktop redesign.
