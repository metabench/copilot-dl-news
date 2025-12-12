# Working Notes – Art Playground: ListenerBag promotion

- 2025-12-11 — Session created via CLI. Add incremental notes here.

- 2025-12-11 22:16 — 
## 2025-12-11 — ListenerBag promotion

### Changes
- Promoted ListenerBag helper: src/ui/utils/listenerBag.js
- Refactored Art Playground controls to use ListenerBag:
  - CanvasControl: now uses ListenerBag for svg/document mouse listeners; adds deactivate() + internal dispose helper.
  - SelectionHandlesControl: now uses ListenerBag for handle mousedown listeners and per-resize document mouse listeners; adds deactivate() + internal dispose helper.
- Fixed ListenerBag relative require path for esbuild bundling (../../../../utils/listenerBag).

### Build
- Rebuilt Art Playground bundle: node scripts/build-art-playground-client.js

### Validation
- node src/ui/server/artPlayground/checks/art-playground.check.js (✅ 63/63)
- tests/ui/e2e/art-playground.puppeteer.e2e.test.js (✅ 19/19)
