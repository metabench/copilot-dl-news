# Follow Ups – Connect crawler to decision tree viewer

- Owner: 💡UI Singularity💡 — Add “Decision Trees” entrypoint to the deprecated crawler UI (`src/deprecated-ui/public/index/*`), ideally using `/api/decision-config-sets/active` to deep-link into the viewer.
- Owner: 🕷️ Crawler Singularity 🕷️ — Decide which crawl “complexities” are most valuable as explainable traces (per-URL fetch decision vs page category classification vs hub/article pipeline decisions).
- Owner: 🔧 CLI Tool Singularity 🔧 — If we need “trace highlight”, propose a minimal `DecisionTrace` JSON schema and a migration-free persistence plan (file-based first, DB later).
- Owner: 💡UI Singularity💡 — Fix/document the Decision Tree Viewer port mismatch (`@port 4960` vs actual default `3030`) so links are reliable.
- Owner: AGI-Orchestrator — Choose integration strategy (link-only vs proxy vs trace capture) and sequence across repos/servers.
