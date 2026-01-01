# Goals Review — Virtual Matrix Scrolling

## User goal
Support **very large** matrix views (thousands of rows/cols) with scrolling and likely **virtual scrolling** so the UI remains responsive.

## Current baseline
- `MatrixTableControl` exists and is good for moderate sizes.
- For large sizes, full DOM tables become too heavy (layout + memory + activation).

## What “good” looks like
- DOM node count stays bounded while scrolling.
- Scrolling updates are smooth enough for practical use.
- Axis flip still works (rows↔cols), ideally without full re-render of the entire logical matrix.
- Deterministic checks exist: SSR structural markers + Puppeteer behavior assertions + screenshots.

## Non-goals (for this slice)
- Productionizing virtualization into `MatrixTableControl`.
- Complex sticky header UX polish.
- Perfect accessibility/keyboard navigation.

## Constraints
- Windows + PowerShell + Node only.
- Follow lab-first workflow: prototype + validate in `src/ui/lab/experiments/*`.
- Keep selectors stable using `dom.attributes[...]` for `data-testid`.
