# Working Notes – Topic Hub Guessing Matrix

- 2025-12-31 — Session created via CLI. Add incremental notes here.

- 2025-12-31 04:32 — 
## Context + Known Facts (2025-12-31)
- Shared chrome exists: `HubGuessingMatrixChromeControl` (filters/stats/legend/actions + flip-axes) and is already used by Place Hub Guessing.
- Topic-related hub fields exist in SQLite schema: `place_hubs.topic_slug`, `topic_label`, `topic_kind` with index `idx_place_hubs_topic`; `place_hubs_with_urls` view surfaces `topic_*` + `url`.
- There is no existing `src/ui/server/topicHubGuessing/**` module yet (new feature).
- Goal: Topic Hub Guessing matrix should *look the same* as Place hub matrix by reusing the shared chrome/supercontrols.

## Design Contract (proposed)
### Routes
- `GET /topic-hubs` — main matrix page (SSR), supports `matrixMode` (`auto|table|virtual`) + `matrixThreshold`.
- `GET /topic-hubs/cell?host=...&topicSlug=...` — drilldown cell page.

### Matrix Axes
- Rows: `topic_slug/topic_label` (source TBD; likely distinct from `place_hubs` or a `topic_keywords` table).
- Cols: `host` (distinct hosts from `place_hubs_with_urls`, ordered by volume/recency).
- Flip axes should mirror Place: `data-view="a"|"b"` toggled by the shared chrome script.

### Cell State (minimal v1)
- `present`: a mapping exists in `place_hubs_with_urls` for (topic_slug, host) → show ✓ and link to cell drilldown.
- `empty`: no mapping → show empty / neutral.

### Legend + Stats (minimal v1)
- Legend: “✓ Stored hub mapping”, “Empty = no stored mapping”.
- Stats: topic count, host count, mapping count.

## Options (ranked)
| Option | Impact | Effort | Risk | Domains |
| --- | --- | --- | --- | --- |
| A: Minimal v1 (stored-only) | Fast Topic matrix shipped; aligns with current DB reality | M | Low: straightforward queries | UI/Data |
| B: Add candidate vs verified states | More informative; matches Place semantics better | L | Medium: need topic candidate source table/logic | UI/Data |
| C: Unify Place+Topic into one “Hub Guessing” app | Reduces duplication long-term | L | Higher: routing + registry refactor risk | UI/Tooling |

Recommendation: start with Option A (stored-only) to get end-to-end wiring + checks green, then iterate.

## Implementation Notes (handoff-ready)
- New modules (expected):
  - `src/ui/server/topicHubGuessing/server.js`
  - `src/ui/server/topicHubGuessing/controls/TopicHubGuessingMatrixControl.js`
  - `src/db/sqlite/v1/queries/topicHubGuessingUiQueries.js`
  - checks mirroring Place Hub Guessing: SSR + Puppeteer screenshot.
- Reuse: `HubGuessingMatrixChromeControl`, `MatrixTableControl`, `VirtualMatrixControl`.
- Unified App: add a registry entry like Place’s (`/topic-hubs`).

## Validation Plan
- Add `topicHubGuessing.matrix.check.js` (SSR structural assertions + virtual markers when forced).
- Add `topicHubGuessing.matrix.screenshot.check.js` mirroring Place’s scenarios: table, flipped, virtual, virtual scrolled.
