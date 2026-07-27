# Crawl Detail Grid — side-by-side per-crawl article tables (jsgui3 MVVM)

**Status:** planned (2026-07-21). **Goal:** display medium-sized crawls in detail, side by side, in
the UI — each crawl a column, each column a live table of the articles that crawl just downloaded
(title · place tags · author · publication date · word count), built with jsgui3 (Data_Table / MVVM).

This doc is grounded in three read-only research passes (jsgui3 grid + MVVM mechanics; the article
data surface; the crawl-status UI architecture). File:line citations are in the session transcript.

---

## 1. Reality check (verified against the live DB + jsgui3 v0.0.188) — read this first

The plan is shaped by what data actually exists. Do **not** assume the five fields are all present.

| Field | Source | Density | Verdict |
|---|---|---|---|
| **Title** | `content_analysis.title` | 100% | ✅ ready |
| **Word count** | `content_analysis.word_count` (STORED int) | 99.9% | ✅ ready — **do not compute**, it's stored |
| **Publication date** | `content_analysis.date` (ISO text; ≠ `analyzed_at` ≠ `fetched_at`) | ~47% | ⚠️ show "—" when null |
| **Place tags** | `article_places.place` (denormalized name), join via url_id | 9,809 rows corpus-wide | ⚠️ sparse — most articles untagged; render chips when present, empty otherwise |
| **Author / byline** | `content_analysis.byline` + `authors` (columns exist) | **0% populated** | ❌ **data gap** — the extraction pipeline never writes them (see Phase 5) |

**Two hard truths that dictate the architecture:**

1. **Author is a real gap, not a wiring gap.** The columns exist and ncdb's `updateAnalysis`
   (`news-crawler-db/src/db/sqlite/access/contentAnalysis.ts`) already accepts `byline`/`authors`,
   but the copilot analysis pipeline doesn't extract or pass a value. So the Author column renders
   blank until Phase 5 fixes extraction. We ship the column now (honest "—") and light it up in Phase 5.

2. **There is no persisted crawl/job/batch id on any download row.** `http_responses`,
   `content_storage`, `content_analysis`, `fetches` carry no job id; `crawl_jobs` is stale (0 rows
   since Jan 2026); `discovery_events.crawl_job_id` is NULL on live rows; runtime `jobId`/`batchId`
   are in-memory only. **The only grouping key is `http_responses.fetched_at`** (indexed). So
   "articles this crawl downloaded" = `fetched_at BETWEEN job.startedAt AND (job.finishedAt||now)`,
   optionally narrowed by host for host-scoped runs. The UI gets each run's window from the live
   crawl registry (`/api/v1/crawl/jobs` items carry `startUrl`, `startedAt`, `finishedAt`, `progress`).

---

## 2. Data joins

**Article detail row** (extend ncdb `listArticlesWithContent`, `legacy-ui-articleViewer.ts:140-183`,
which already returns `url_id, url, host, fetch_id, fetched_at, title, published_date, section,
word_count, byline, classification, confidence_score` and is `fetched_at DESC`-ordered):

- add `ca.authors` (one-line SELECT add), and
- add place names via the join path (index `idx_article_places_url_id` makes it cheap):
  ```
  content_analysis.content_id → content_storage.id
    → content_storage.http_response_id → http_responses.id
    → http_responses.url_id → urls.id
    → article_places.article_url_id (place = article_places.place)
  ```
  Use a bounded `GROUP_CONCAT(place)` LEFT JOIN, or a second keyed lookup over the returned url_ids.
  (Ignore `article_place_relations` — only 73 rows.)

**Per-crawl window filter:** `WHERE http_responses.fetched_at BETWEEN :since AND :until [AND host = :host]`.

---

## 3. jsgui3: which control

jsgui3-html **v0.0.188** (the top-level symlinked tree the repo `require`s — NOT the older v0.0.175
bundled under `jsgui3-server`) ships a real MVVM grid:

- **`Data_Table`** (`controls/organised/1-standard/4-data/Data_Table.js`) — extends
  `Data_Model_View_Model_Control`; renders `<table role="grid">`; columns as
  `{key,label,sortable,accessor,render,width,frozen,priority}`; built-in sort/filter/page/selection/
  virtual-scroll; a column's `render(value,row)` may return a Control (links, place chips).
- **`Data_Grid`** (`controls/connected/Data_Grid.js`) — wraps Data_Table with async `data_source`,
  loading/empty/error states, server-side mode.
- **MVVM binding** (proven): `model.set('rows', records)` → `this.computed(model,
  ['rows','filters','sort_state','page'], …, {property_name:'visible_rows'})` → `this.watch(model,
  'visible_rows', ()=>render_table())` rebuilds `tbody`. Live add/update propagates by re-setting `rows`.

The repo also has its own `TableControl` (`src/ui/controls/Table.js`) with `UrlListingTable.js` as the
closest analog (DB records → rows with links/badges/timestamps), already client-activated via
`registerControlType` + `controlManifest.js`.

**Decision:** build `ArticleDetailTable` on **jsgui3 `Data_Table`** (this is the user's explicit
"jsgui3 data grid + MVVM" ask and it dogfoods the jsgui3 ecosystem the workspace exists to advance),
requiring it from the top-level `jsgui3-html`. **Fallback:** if isomorphic reattach of `Data_Table`
proves heavy in this repo's activation pipeline, extend the repo's proven `TableControl`
(`UrlListingTable` pattern) instead — same columns, less MVVM sugar. Decide in Phase 3 against the
ssr_reattach test, not by guesswork.

**Isomorphic composite contract (7 points) — every new jsgui3 control must:**
1. guard compose: `if (!spec.el) this.compose();`
2. guard activate: `activate(){ if (this.__active) return; super.activate(); … }`
3. tag composed child refs `dom.attributes['data-jsgui-ctrl']='prop'` + call `this._wire_jsgui_ctrls()` in activate
4. persist behaviour-affecting spec as `data-*` and recover it in activate (spec does NOT survive to client)
5. emit any CSS via `String_Control`, never plain `.add(text)` (escaping corrupts it)
6. register the type: `registerControlType('article_detail_table', …)` + add to `controlManifest.js`
7. guard with an SSR→reattach test (`jsgui3-html/test/core/ssr_reattach.test.js` style) — unit tests that
   construct+activate the same instance miss this whole bug class.

---

## 4. Architecture

**New dedicated page `/crawl-detail`** (do NOT bolt onto the load-bearing crawl-status page — its
header says "rename nothing", its 9-column jobs grid + hand-rolled client script are E2E-asserted).
`CrawlDetailPage extends Standard_Web_Page`, jsgui3-activated (uses the manifest/activation path like
`UrlListingTable`, not a hand-rolled script). Link to it from crawl-status ("Compare crawls →").

```
/crawl-detail
├── header: "Crawl detail — live" + refresh/pause
├── .detail-grid  (CSS repeat(auto-fit, minmax(320px,1fr)); collapses to 1 col < 720px)
│   ├── per-crawl column  (one .detail-block per /jobs item, keyed by job.id)
│   │   ├── header card: host · status · KPIs (visited / downloaded / errors / MB, from job.progress)
│   │   └── ArticleDetailTable (jsgui3 Data_Table, MVVM)
│   │        cols: Title (link) · Places (chips) · Author · Published · Words
│   └── … (N columns, one per active/recent crawl)
```

**Endpoints:**
- reuse `GET /api/v1/crawl/jobs` → `items[]` to enumerate crawls (id, startUrl→host, status, startedAt,
  finishedAt, progress). run-multi per-host jobs already flow through this registry, so one poll = all columns.
- **new** `GET /api/v1/crawl/recent-articles?host=&since=&until=&limit=` → thin inline route delegating
  to the new ncdb function (index-pinned fast path, per the `/api/v1/recent-headlines` pattern; use the
  `getDbRW()` facade→raw-handle unwrap). If the place-join makes it heavy, switch to the child-process
  +cache pattern (`/api/v1/crawl/host-health`). Returns `{articles:[{url,host,title,publishedDate,
  wordCount,byline,authors,section,fetchedAt,places:[…]}]}`.

**Near-real-time:** client polls `/jobs` (~5s) to reconcile columns (add/remove as crawls start/finish),
and per column polls `/recent-articles?host&since=job.startedAt` (~10-15s), calling
`table.model.set('rows', articles)` so the MVVM grid re-renders. Reuse the off-loop discipline: the
article query is index-pinned; keep it that way (bounded LIMIT, fetched_at window).

---

## 5. Feature list (specific)

1. **Side-by-side crawl columns** — auto-fit `.detail-grid`, one column per live/recent crawl, responsive collapse.
2. **Per-crawl KPI header** — host, status pill (running/done/error), visited / downloaded / errors / MB-down, updated live from `job.progress`.
3. **Article detail table per crawl** — jsgui3 `Data_Table`, columns Title · Places · Author · Published · Words.
4. **Title as external link** (`target=_blank rel=noopener`), truncation with full-title tooltip.
5. **Place chips** — small pills per tagged place (`article_places.place`); empty when untagged (honest).
6. **Author** — `content_analysis.byline`/`authors`; renders "—" until Phase 5 populates it.
7. **Publication date** — formatted `content_analysis.date`; "—" when null (~half).
8. **Word count** — right-aligned integer from stored `word_count`.
9. **Client-side sort** (jsgui3 Data_Table built-in) — by Words / Published / Title.
10. **Live updates** — new articles appear as the crawl downloads them (MVVM model re-set on poll).
11. **Column totals** — per-crawl article count + median word count in the header.
12. **Empty/loading/error states** — Data_Grid states or explicit skeleton rows.
13. **Link from crawl-status** and a top-level nav entry.

---

## 6. Phased implementation (one phase ≈ one loop cycle; each quality-gated + ledgered)

- **Phase 1 — ncdb read fn (Track: ncdb).** Add `listRecentArticlesForDetail(db, {host?, sinceFetchedAt?,
  untilFetchedAt?, limit})` in ncdb (extend `listArticlesWithContent` or a sibling in
  `legacy-recentHeadlines.ts` keeping the `idx_content_analysis_analyzed_at`/`idx_http_responses_fetched`
  fast path). Include `authors` + a bounded `article_places` place-name join. Diff the return shape vs raw
  SQL; `npm run build` (tsc); unit-test the query (fixture DB or bounded live read-only). Export from
  `src/db/index.ts`.
- **Phase 2 — endpoint (Track: product).** `GET /api/v1/crawl/recent-articles` thin inline route
  (getDbRW unwrap; host/since/until/limit; index-pinned). Live-verify with curl against a real window.
- **Phase 3 — ArticleDetailTable control (Track: product + scaffold).** jsgui3 `Data_Table`-based (or
  `TableControl` fallback), the 5 columns, MVVM row-binding, the 7-point isomorphic contract,
  `registerControlType` + `controlManifest.js`, an ssr_reattach-style test. Verdict recorded: Data_Table vs TableControl.
- **Phase 4 — CrawlDetailPage + /crawl-detail route (Track: product).** Standard_Web_Page, `.detail-grid`
  of per-crawl columns from `/jobs`, KPI header + ArticleDetailTable per column, client poll wiring,
  nav link from crawl-status. SSR check for the new page (markers/ids).
- **Phase 5 — author extraction (Track: product, enrichment).** Fix the copilot analysis pipeline
  (ArticleProcessor / analysis) to extract byline/author (meta[name=author], JSON-LD `author`,
  common byline selectors) and pass to ncdb `updateAnalysis` so `content_analysis.byline`/`authors`
  populate on new crawls. Unit-test extraction on stored fixtures; live-verify a fresh crawl writes an author.
  (Optional backfill over recent rows.) This lights up the Author column with real data.
- **Phase 6 — live verify + polish.** Launch a medium multi-host run-multi crawl; open `/crawl-detail`;
  screenshot the columns filling live; confirm Title/Places/Words/Date real (+ Author after Phase 5).
  Probe + ledger.

**Acceptance:** on a live medium crawl, `/crawl-detail` shows ≥2 side-by-side columns, each a table of
that crawl's just-downloaded articles with real titles, word counts, publication dates (where present),
place chips (where present), updating near-real-time; author real once Phase 5 lands. All quality-gated
(unit tests + SSR check + `run-probes` green), DB-shaped logic in ncdb, verification right-sized.

---

## 7. Risks / notes

- **Load-bearing crawl-status page:** new page, fresh ids/`data-*`; do not touch the 9-column jobs grid.
- **Template-literal trap** only applies to the crawl-status hand-rolled script; the new page uses jsgui3
  activation (createElement/model binding), so it's exempt — but keep any inline CSS in `String_Control`.
- **Event-loop discipline:** the article query must stay index-pinned/bounded (fetched_at window + LIMIT);
  if the place-join degrades it, move to the child-process+cache endpoint pattern. Never an unbounded scan
  of the 30 GB DB inline (the WAL-pin incident guard).
- **fetched_at grouping is a proxy**, not a true join — a persisted job_id on download rows would be the
  proper fix (separate, larger task: thread the runtime jobId into the write path). Note it; don't block on it.
- **Author + place coverage** are data-quality workstreams (Phase 5 for author; place-tagging coverage is a
  separate gazetteer enrichment) — the UI degrades honestly (blank/"—") meanwhile.
