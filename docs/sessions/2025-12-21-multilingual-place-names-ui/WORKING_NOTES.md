# Working Notes – Multilingual Place Names UI

- 2025-12-21 — Session created via CLI. Add incremental notes here.

## Artifacts

- SVG mock written: `place-names-matching-ui.mock.svg`

## Lab prototype (jsgui3-server)

- Added lab: `src/ui/lab/experiments/040-gazetteer-place-names-matching-view/`
- Fixed `NYI` crash by using `Active_HTML_Document` so SSR has `head` + `body`.
- Check passes: `node src/ui/lab/experiments/040-gazetteer-place-names-matching-view/check.js`
