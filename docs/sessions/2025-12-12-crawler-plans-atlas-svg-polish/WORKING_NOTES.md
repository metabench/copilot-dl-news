# Working Notes – Crawler Plans Atlas SVG Polish

- 2025-12-12 — Session created via CLI.

## Baseline

Command:
- `node tools/dev/svg-collisions.js docs/diagrams/crawler-improvement-plans-atlas.svg --strict --json`

Result:
- High: 0
- Medium: 0
- Low: 14 (`text-clipped` warnings where subtitle baselines slightly overlapped card header bars)

## Fix

Approach:
- Nudged the affected subtitle lines down by +4px so their rendered glyph bounds no longer touch/overlap the header bar rectangles.

Files changed:
- `docs/diagrams/crawler-improvement-plans-atlas.svg`

## Validation

Command:
- `node tools/dev/svg-collisions.js docs/diagrams/crawler-improvement-plans-atlas.svg --strict --json`

Result:
- Total collisions: 0
