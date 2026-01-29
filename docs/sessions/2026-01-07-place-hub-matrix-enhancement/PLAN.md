# Plan – Place Hub Guessing Matrix Enhancement

**Session**: 2026-01-07-place-hub-matrix-enhancement  
**Status**: Complete (Phases 1-3)  
**Objective**: Add article metrics, enriched tooltips, and detail panel to the Place Hub Guessing Matrix UI

---

## Current State Analysis

### What Already Works ✅

| Component | Location | Status |
|-----------|----------|--------|
| Matrix Control | `src/ui/server/placeHubGuessing/controls/PlaceHubGuessingMatrixControl.js` | Complete (635 LOC) |
| Cell Control | `src/ui/server/placeHubGuessing/controls/PlaceHubGuessingCellControl.js` | Enhanced ✅ |
| Query Layer | `src/db/sqlite/v1/queries/placeHubGuessingUiQueries.js` | Enhanced ✅ |
| Server Routes | `src/ui/server/placeHubGuessing/server.js` | Enhanced ✅ |
| UnifiedApp Integration | Mounted at `/admin/place-hubs` | Complete |
| 5-State CSS | unchecked, guessed, pending, verified-present, verified-absent | Complete |
| Checks | 27/27 matrix, 13/13 cell | Passing |

### Current Data (from live database)

- **Total mappings**: 440
- **Verified**: 285 (65%)
- **Pending**: 155 (35%)
- **Top host**: theguardian.com (245 mappings)
- **Page kinds**: country-hub (335), country (64), region-hub (30)

### Database Schema Discovery

During implementation, discovered actual schema differs from initial assumptions:

**`urls` table** — Has `url` (full URL) and `host`, but **no `path` column**
**`http_responses` table** — Has fetch metadata, but **no `title` or `word_count`**
**`content_analysis` table** — Has `title`, `word_count`, `classification` via `content_id → hr.id`

**Fix applied**: Queries now join to `content_analysis` and filter by `ca.classification = 'article'`

---

## Done When

- [x] Phase 1: Article metrics query layer implemented
- [x] Phase 2: Server integration for cell route
- [x] Phase 3: Cell detail page shows article metrics and recent articles
- [ ] Phase 4: Coverage dashboard (P2 — follow-up)
- [x] All existing checks still pass (27/27 matrix, 13/13 cell)
- [x] SQL schema issues fixed (no more "no such column" errors)

---

## What Was Implemented

### Phase 1: Article Metrics Query Layer ✅

**File**: `src/db/sqlite/v1/queries/placeHubGuessingUiQueries.js`

**New functions added**:

1. `extractPathPattern(hubUrl)` — Extracts path from hub URL (e.g., `/world/africa`)
2. `getHubArticleMetrics(dbHandle, { host, urlPattern })` — Returns `{ article_count, earliest_article, latest_article, days_span }`
3. `getRecentHubArticles(dbHandle, { host, urlPattern, limit })` — Returns array of `{ url, title, fetched_at, word_count }`

**Key SQL fix**: Join to `content_analysis` table and use `u.url LIKE '%' || ? || '/%'` instead of non-existent `u.path`

### Phase 2: Server Integration ✅

**File**: `src/ui/server/placeHubGuessing/server.js`

**Changes**:
- Added imports for new query functions
- Updated `renderPlaceHubGuessingCellHtml()` signature to accept `articleMetrics, recentArticles`
- Enhanced `/cell` route to compute article metrics when mapping has URL

### Phase 3: Cell Detail Enhancement ✅

**File**: `src/ui/server/placeHubGuessing/controls/PlaceHubGuessingCellControl.js`

**Added CSS**: `.metrics-card`, `.metrics-grid`, `.metric-item`, `.articles-card`, `.article-list`, `.article-item`, `.no-articles`

**Added sections**:
1. **Article Metrics Card** — Shows count, days span, earliest/latest dates
2. **Recent Articles List** — Shows last N articles with links

### Phase 4: Coverage Dashboard — Deferred

Requires additional design work. Consider for follow-up session.

---

## Data Note

**Current article metrics show 0** because:
- Hub URLs like `/world/montenegro` are section landing pages
- Crawled article URLs like `/uk-news/2025/sep/14/...` don't match hub path patterns
- This is expected behavior — metrics will populate once articles under hub paths are crawled

---

## Validation Results

```
node src/ui/server/placeHubGuessing/checks/placeHubGuessing.matrix.check.js
→ 27/27 checks passed

node src/ui/server/placeHubGuessing/checks/placeHubGuessing.cell.check.js
→ 13/13 checks passed (no SQL errors)
```

---

## Files Changed

| File | Changes |
|------|---------|
| `src/db/sqlite/v1/queries/placeHubGuessingUiQueries.js` | Added 3 new functions, fixed SQL to use proper schema |
| `src/ui/server/placeHubGuessing/server.js` | Enhanced imports, updated `/cell` route |
| `src/ui/server/placeHubGuessing/controls/PlaceHubGuessingCellControl.js` | Added CSS + article metrics/articles sections |
| `src/ui/server/placeHubGuessing/checks/placeHubGuessing.cell.check.js` | **NEW** — Cell detail check script |
