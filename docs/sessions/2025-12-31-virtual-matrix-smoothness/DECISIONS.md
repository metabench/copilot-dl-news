# Decisions – Virtual Matrix Smoothness

| Date | Context | Decision | Consequences |
| --- | --- | --- | --- |
| 2025-12-31 | Need repeatable “smoothness” evidence for production virtualization | Add Lab 046 that exercises `VirtualMatrixControl` directly and asserts invariants via `data-render-seq` + bounded cell counts | Smoothness regressions become detectable without relying on subjective UX testing; encourages keeping client init + instrumentation stable |
| 2025-12-31 | Puppeteer API differences across environments | Prefer small compatibility helpers (e.g. `delay(ms)`) over version-specific calls like `page.waitForTimeout()` | Lab checks remain stable across Puppeteer versions without pinning upgrades |
