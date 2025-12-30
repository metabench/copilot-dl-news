# Live Geo Import Explorer — Design Notes

## What you’re asking for (restated)
During geo import, the UI should:
- Show newly discovered geo objects *as they are discovered* (not only at the end).
- Let you explore those objects immediately (click/select, inspect details, expand neighbors).
- Show which *parts of the import* are currently loading and how the imported structure is growing.
- Visualize this as a tree/network on a canvas (initially: high performance for a limited amount of data).
- Use “intelligence” to decide what to display (level-of-detail, summarisation, focus).

This is a **streaming + incremental rendering** problem, not just “progress bars”.

---

## System levels that need new features

### 1) Data model / DB layer
**Goal:** allow both (a) push-style incremental updates and (b) pull-style exploration queries.

Needed:
- A canonical, stable *entity id* and *entity type* model for explorer nodes.
  - Example: `place:<place_id>`, `boundary:<osm_id>`, `external:wikidata:<QID>`.
- DB queries that can answer “graph neighborhood” quickly.
  - `getNodeSummary(id)` (label, kind, counts, lastUpdated)
  - `getNodeNeighbors(id, {limit, kinds, direction})`
  - `getRecentNodes({since, limit})`
- Optional (later) a small “explorer cache” table to store precomputed summaries.

Why this matters:
- Live streaming alone is not enough: the UI needs to fetch details on demand.

### 2) Import orchestration / service layer
**Goal:** turn import work into structured events that describe entity lifecycle.

Needed:
- An import “event bus” (in-process) for geo import runs.
- Instrumentation points in each ingestor step to emit:
  - `node_discovered` (new entity found)
  - `node_upserted` (insert/update occurred)
  - `edge_discovered` (relationship found)
  - `node_progress` (entity’s internal counts changed)
  - `stage_started` / `stage_progress` / `stage_finished` (already have progress tree; reuse)

Important design choice:
- Events should be **data-oriented**, not UI-oriented.
- Events should be **idempotent** and **dedupe-friendly**.

### 3) Streaming / transport layer (server → browser)
**Goal:** reliably deliver incremental updates with backpressure.

Needed:
- A new SSE endpoint (or extend existing geo-import SSE) to stream explorer events:
  - `GET /api/geo-import/explorer/stream?runId=...`
- Server-side batching/throttling:
  - Merge frequent updates for the same node into a single “latest state” update.
  - Flush at a fixed cadence (e.g., every 100–250ms) to protect the browser.
- Resilience:
  - Include sequence numbers and periodic snapshots.
  - On reconnect, browser can request `sinceSeq`.

### 4) UI model layer (client state store)
**Goal:** maintain a bounded, explorable graph state in memory.

Needed:
- A `GraphStore` that ingests SSE events and maintains:
  - `nodesById`, `edgesById`
  - `dirtyNodes` set for incremental rendering
  - a bounded memory strategy (cap nodes/edges; evict low-importance)
- A small “intelligence layer” that decides:
  - what is visible now (focus region)
  - what is collapsed into summary nodes
  - when to request more detail from server

### 5) Rendering layer (canvas/tree/network)
**Goal (near-term):** high performance for limited data; extend later to huge.

Near-term renderer (recommended):
- Reuse the existing **div + SVG overlay** approach like the Decision Tree Viewer:
  - DOM nodes for visible entities (limited count)
  - SVG for edges/links (Bezier connections)
  - `requestAnimationFrame` to schedule layout and incremental updates

Later renderer (for scale):
- WebGL-based graph rendering (Pixi/regl/three) OR a dedicated graph lib.

---

## “Intelligence” for what to display (practical first pass)

### Hard limits (so it stays fast)
- `MAX_VISIBLE_NODES` (e.g., 200)
- `MAX_VISIBLE_EDGES` (e.g., 300)
- `MAX_LABELS` (e.g., 80)

### Importance scoring (cheap heuristics)
Score each node by:
- Kind weight: country/region > city > raw external ID
- Recency: just-discovered or just-updated
- Incompleteness: missing bbox/tags/labels
- Growth: nodes whose child-count is increasing
- Selection adjacency: neighbors of selected/focused nodes

Then show:
- Top-K nodes by score
- Only edges between visible nodes

### Summarisation primitives
- **Collapsed group node**: “+37 cities (loading…)”
- **Progress on node**: a ring/badge representing `knownChildren / expectedChildren` (or best-effort)
- **Stage overlays**: a translucent “loading” halo for nodes touched by the current stage

---

## Proposed API surface (minimal)

### Streaming
- `GET /api/geo-import/explorer/stream?source=...` (SSE)
  - events: `snapshot`, `node`, `edge`, `nodePatch`, `stage`

### Pull for exploration
- `GET /api/geo-import/explorer/node?id=place:123`
- `GET /api/geo-import/explorer/neighbors?id=place:123&limit=50`
- `GET /api/geo-import/explorer/search?q=York&limit=50`

---

## Integration into the existing dashboard

UI structure (fits existing split layouts):
- Left: import controls + progress tree + filters
- Right: explorer canvas + details panel

The explorer should work even if the import errors (same principle as your resilient telemetry work):
- stream continues, UI stays interactive, errors become events.

---

## Implementation roadmap (phased)

### Phase A — Live incremental list (fast win)
- Stream `node_upserted` events.
- Show a scrollable “recent entities” list with filters + quick inspect.
- This proves the event stream and exploration queries.

### Phase B — Limited tree/network explorer (your ask, scoped)
- Add a `GeoImportLiveExplorerControl` with a bounded graph view.
- Render ~100–200 nodes with SVG edges + `requestAnimationFrame`.
- Add summarised “collapsed” nodes and the importance scoring rules.

### Phase C — High-scale GPU renderer (later)
- Swap renderer implementation behind the same `GraphStore`.
- Add spatial indexing, clustering, and LOD.

---

## Success criteria (measurable)
- Live: new entities appear within <500ms of DB commit.
- Interactive: pan/zoom/select stays responsive at 200 nodes.
- Stable: reconnect resumes without duplicating nodes.
- Useful: clear “what’s loading” overlays tied to stages.
