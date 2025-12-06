# Working Notes – Improve ui-pick Electron picker

- 2025-12-06 — Session created via CLI. Add incremental notes here.
- 2025-12-06 — Added ui-pick CLI improvements: help/json flag, normalized option validation (strings or {label,value,description}), structured JSON payload, clearer exit codes (0 select / 1 cancel / 2 parse error).
- 2025-12-06 — Added per-item right-click context menu (🔍 Explore, 🧪 Test, 🛠️ Implement, 🛡️ Fix) with IPC back to renderer; footer shows transient action hints.
- 2025-12-06 — Added icon/emoji support, phase metadata passthrough, and structured selection payload `{selection, option, phase}`; selection now treated as consent to advance without re-prompting.
- 2025-12-06 — Added phase-based emoji fallback for options without an explicit icon/emoji (plan/design 🧭, explore 🔍, implement 🛠️, test 🧪, validate ✅, fix 🛡️).
