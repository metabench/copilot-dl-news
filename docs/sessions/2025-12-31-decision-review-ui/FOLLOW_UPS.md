# Follow Ups – Decision Review UI (Pause-on-decision crawl)

- Owner: 🗄️ DB Guardian — Decide whether “pause/continue” uses a new `task_controls` table vs writing control commands into `task_events`.
- Owner: 💡UI Singularity — Prototype a Decision Detail pane in Crawl Observer: event list → decision payload renderer → “Continue/Step/Stop” buttons.
- Owner: 🛰️ Telemetry & Drift Sentinel — Define a stable `decision` event schema + payload size budgets (avoid DB bloat).
- Owner: 🧭 Architecture Contract Keeper — Identify and document the crawler-side decision points worth instrumenting first (MVP scope).

