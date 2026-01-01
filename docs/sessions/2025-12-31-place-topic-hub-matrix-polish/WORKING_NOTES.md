# Working Notes – Place + Topic Hub Guessing Matrix Polish

- 2025-12-31 — Session created via CLI. Add incremental notes here.

## Known Facts (from code reading)

- Place Hub Guessing UI already supports `matrixMode` (`auto|table|virtual`) and `matrixThreshold` with `VirtualMatrixControl` for large grids.
- Current filters: `kind`, `pageKind`, `q` (place filter), `hostQ`, `placeLimit`, `hostLimit`.
- The UI already passes `state` through link params, but the filters form does not expose a `state` selector yet.
- `TopicHubGapAnalyzer` exists and generates topic hub URL candidates; persistence and orchestration include `persistValidatedTopicHub` / `validateTopicHub` flows.
- Topic hubs appear to be stored via `insertTopicHub` / `getTopicHub` in `src/db/sqlite/v1/queries/guessPlaceHubsQueries.js` (likely into the shared hubs table).

## Option Rubric (ranked)

| Option | Impact | Effort | Risk | Domains |
| --- | --- | --- | --- | --- |
| A) “Perfect” Place Hub matrix quick wins | High: faster navigation + less noise | S–M | Low | UI |
| B) Topic Hub Guessing matrix (topic × host) | High: unlocks new workflow | M | Medium (DB contract) | UI + Data |
| C) Unified “Hub Guessing Explorer” (tabs: place/topic/place-topic) | Very high long-term | L | Medium–High (scope creep) | UI + Data |
| D) Add rollups + sort controls (top missing, top verified) | Medium–high | M | Low–Medium | Data + UI |

## Place Hub Guessing — “Perfect” Backlog Ideas

Quick wins (low risk):
- Add a `state` filter selector (pending / verified-present / verified-absent / unchecked / verified-any).
- Add a “Reset filters” link that preserves only `kind` + `pageKind` defaults.
- Persist Flip Axes state into query param (or localStorage) so refresh keeps the view.
- Row/col hover highlighting (subtle) to improve scanability.

Medium scope (bigger value):
- Sort hosts by “most verified” / “most present” / “most absent”.
- Row/col totals (tiny badges): verified present/absent/pending counts.
- Make cell tooltip clearer: show `url` first, then status/outcome, then timestamps.

Higher scope (optional):
- Keyboard navigation (arrow keys) + focus ring + Enter opens cell drilldown.
- “Copy URL” quick action from cell (only when URL is present).

## Topic Hub Guessing Matrix — Proposed Data Contract

Baseline interpretation:
- **Rows**: topics (`topic_slug` + label)
- **Cols**: hosts/domains
- **Cell**: “best known topic hub URL + validation state”
	- `unchecked`: no candidate/record
	- `pending`: candidate exists but not verified
	- `verified-present`: validated hub exists
	- `verified-absent`: validated as not a hub (if such negative evidence is stored)

Open questions to resolve before coding:
- Where is topic-hub “negative” evidence stored (if anywhere)? If absent, we may only support `unchecked|pending|verified-present`.
- How do we choose a single “best” URL per (topic, host) when multiple candidates exist?

## Suggested Experiments (to de-risk)

1) Read the hub schema and existing place hub guessing UI queries to mirror the same status model.
2) Identify how PlaceHubGuessing’s `mapping.status` and `verified_at` are computed (DB query layer), then mirror for topics.
3) Prototype the Topic matrix in SSR-only first (no client JS beyond flip) and add a fast check script.

## Coverage Checklist

- [x] UI
- [x] Data
- [ ] Tooling
- [ ] Operations

## Recommendation

Do **Option A** (state filter + persist flip view) first to immediately reduce friction in Place Hub Guessing, then ship **Option B** as a narrow vertical slice: topic×host matrix with drilldown page.
