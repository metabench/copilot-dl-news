# Working Notes – Docs-Memory: Full-Stack Methodology for Crawler+UI Wrappers

- 2025-12-21 — Session created via CLI. Add incremental notes here.

- 2025-12-21 22:23 — - MCP preflight: docs-memory healthy (svg-editor timed out).
- Reviewed existing PATTERNS/ANTI_PATTERNS/LESSONS/KNOWLEDGE_MAP; found strong jsgui3 lab discipline patterns but no explicit guidance for (a) UI-consumable backend control wrappers and (b) crawl-mode isolation.
- Added new Pattern: Controlled Process Wrapper (Snapshot+SSE+Commands).
- Added new Pattern: Mode Isolation via Namespaced Config + Plugin Contracts.
- Added Anti-Patterns: Feature Bleed Between Crawl Modes; Implicit Shared Decision Registry.
- Appended a Lesson tying wrapper contract + mode/decision-set surfacing to operator trust + determinism.

- 2025-12-21 22:23 — 
## Session summary draft
- New Patterns added: Controlled Process Wrapper (Snapshot + SSE + Commands); Mode Isolation via Namespaced Config + Plugin Contracts.
- New Anti-Patterns added: Feature Bleed Between Crawl Modes; Implicit Shared Decision Registry.
- New Lesson appended: standardize wrapper contract + surface resolved mode/decision sets.
- Note: svg-editor MCP timed out; docs-memory healthy.
