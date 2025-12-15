# Working Notes – Lab: Activation Contract + MVVM Bindings

- 2025-12-14 — Session created via CLI. Add incremental notes here.

## Notes

- Created session after an initial small patch (process correction: session-first going forward).

## Validation

- `node src/ui/lab/experiments/025-mvvm-bindings-library/check.js`
- `node src/ui/lab/experiments/026-activation-contract-lab/check.js`

## Fixes applied

- Activation warning noise: checks now fail only if warnings mention the experiment custom types (generic tag fallbacks like `style`/`main` are tolerated).
- SSR missing-type scan (026): tolerate missing `data-jsgui-type` on `head`/`body` (observed in generated HTML), while still failing on any other tags.
