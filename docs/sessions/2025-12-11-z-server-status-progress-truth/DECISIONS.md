# Decisions – z-server status/progress truthfulness

## 2025-12-11 — Render scan completion as determinate 100%

- Context: The main process emits `scan-progress: { type: 'complete' }` right before resolving the scan promise. The renderer was hiding the indicator in a `finally`, but the progress bar could remain <100% depending on event timing.
- Decision: On `type: 'complete'`, if total is known and current < total, force a final `setScanProgress(total, total, lastFile)` update.
- Consequences: Briefly ensures the UI reflects completion truthfully without changing scan promise lifecycle or error handling.

| Date | Context | Decision | Consequences |
| --- | --- | --- | --- |
| 2025-12-11 | _Brief context_ | _Decision summary_ | _Impact / follow-ups_ |
