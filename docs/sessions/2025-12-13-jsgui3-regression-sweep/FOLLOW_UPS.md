# Follow Ups – jsgui3 Stack Regression Sweep

- Decide whether `z-server/tests/e2e/app.e2e.test.js` is part of the npm upgrade gate (it’s Electron-focused, not directly jsgui3 SSR).
- Consider addressing the recurring Jest warning: `Force exiting Jest: Have you considered using --detectOpenHandles`.
- Update the dev dependency warning: `baseline-browser-mapping` suggests `npm i baseline-browser-mapping@latest -D`.
- If `*.check.html` artifacts are intended as committed baselines, decide whether to keep them tracked or move them under `tmp/` (to reduce accidental diffs).
