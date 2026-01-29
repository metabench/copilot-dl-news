# Place Hub Guessing System — Implementation Plan

This document details how to implement a smooth, well-integrated Place Hub Guessing system that connects pattern analysis, URL generation, verification workflows, and the matrix dashboard UI.

---

## System Overview

The Place Hub Guessing system predicts which URL patterns (e.g., `/world/france`, `/news/canada`) exist for each place×publisher combination. It uses:

1. **Pattern Discovery** — Analyze 500+ pages per publisher to extract URL patterns
2. **Confidence Scoring** — Score patterns by frequency, consistency, and recency
3. **URL Generation** — Generate candidate hub URLs for each place
4. **Matrix Dashboard** — Visual grid showing all place×publisher states
5. **Verification Workflow** — Confirm or reject guessed hubs

---

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     PLACE HUB GUESSING SYSTEM                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐     ┌──────────────┐     ┌─────────────────────┐  │
│  │   Pattern   │────▶│   Pattern    │────▶│   URL Generation    │  │
│  │  Discovery  │     │   Storage    │     │      Engine         │  │
│  └─────────────┘     └──────────────┘     └─────────────────────┘  │
│        │                    │                      │                │
│        ▼                    ▼                      ▼                │
│  ┌─────────────┐     ┌──────────────┐     ┌─────────────────────┐  │
│  │  Threshold  │     │   site_url   │     │   place_page        │  │
│  │   Check     │     │   _patterns  │     │   _mappings         │  │
│  │  (500 pgs)  │     │   (DB)       │     │   (DB)              │  │
│  └─────────────┘     └──────────────┘     └─────────────────────┘  │
│                                                    │                │
│                                                    ▼                │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    MATRIX DASHBOARD UI                       │   │
│  │  ┌─────────┬─────────┬─────────┬─────────┬─────────┐        │   │
│  │  │         │guardian │ bbc.com │eltiempo │ cbc.ca  │        │   │
│  │  ├─────────┼─────────┼─────────┼─────────┼─────────┤        │   │
│  │  │ UK      │   ✓     │   ✓     │         │         │        │   │
│  │  │ ▼Canada │   ?     │   ✓     │         │   ✓     │        │   │
│  │  │   Ontario│        │   ?     │         │   ✓     │        │   │
│  │  │    Toronto│       │   •     │         │   ✓     │        │   │
│  │  └─────────┴─────────┴─────────┴─────────┴─────────┘        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                   VERIFICATION WORKFLOW                      │   │
│  │  Cell Click → Hub Detail → Confirm/Reject → Update State    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1. Pattern Discovery Engine

### Current State
- `url_classification_patterns` table (1811 rows) — regex patterns for URL classification
- `site_url_patterns` table (72 rows) — template patterns like `/{place}` or `/world/{place}`

### Improvements Needed

#### 1.1 Threshold Enforcement
```javascript
// src/services/PatternDiscoveryService.js
class PatternDiscoveryService {
  static MIN_PAGES_THRESHOLD = 500;
  
  async canAnalyzeHost(host) {
    const pageCount = await this.db.getPageCountForHost(host);
    return pageCount >= this.MIN_PAGES_THRESHOLD;
  }
  
  async discoverPatterns(host) {
    if (!await this.canAnalyzeHost(host)) {
      return { status: 'insufficient-data', pageCount: await this.db.getPageCountForHost(host) };
    }
    
    const urls = await this.db.getUrlsForHost(host);
    const patterns = this.extractPatterns(urls);
    const scored = this.scorePatterns(patterns);
    
    return { status: 'success', patterns: scored };
  }
}
```

#### 1.2 Pattern Extraction Algorithm
```javascript
extractPatterns(urls) {
  // Group URLs by path structure
  const pathGroups = new Map();
  
  for (const url of urls) {
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    const template = segments.map((seg, i) => {
      // Check if segment matches a known place name
      if (this.gazetteer.isPlaceName(seg)) {
        return '{place}';
      }
      return seg;
    }).join('/');
    
    if (!pathGroups.has(template)) {
      pathGroups.set(template, { count: 0, examples: [], places: new Set() });
    }
    
    const group = pathGroups.get(template);
    group.count++;
    if (group.examples.length < 5) group.examples.push(url);
    
    // Track which places appear in this pattern
    for (const seg of segments) {
      if (this.gazetteer.isPlaceName(seg)) {
        group.places.add(seg);
      }
    }
  }
  
  return Array.from(pathGroups.entries())
    .filter(([_, data]) => data.places.size > 0)
    .map(([template, data]) => ({
      template,
      frequency: data.count,
      uniquePlaces: data.places.size,
      examples: data.examples
    }));
}
```

#### 1.3 Confidence Scoring
```javascript
scorePatterns(patterns) {
  return patterns.map(p => ({
    ...p,
    confidence: this.calculateConfidence(p)
  })).sort((a, b) => b.confidence - a.confidence);
}

calculateConfidence(pattern) {
  // Factors:
  // 1. Frequency (0-40 points) - how often this pattern appears
  // 2. Place diversity (0-30 points) - how many different places use it
  // 3. Recency (0-20 points) - are URLs using this pattern recent?
  // 4. Consistency (0-10 points) - does structure match expectations?
  
  const freqScore = Math.min(40, (pattern.frequency / 100) * 40);
  const diversityScore = Math.min(30, (pattern.uniquePlaces / 20) * 30);
  const recencyScore = pattern.hasRecentUrls ? 20 : 5;
  const consistencyScore = this.checkConsistency(pattern) ? 10 : 3;
  
  return (freqScore + diversityScore + recencyScore + consistencyScore) / 100;
}
```

---

## 2. Database Schema Integration

### 2.1 Place-Page Mappings (Existing)
```sql
CREATE TABLE place_page_mappings (
  id INTEGER PRIMARY KEY,
  place_id INTEGER NOT NULL,
  host TEXT NOT NULL,
  page_kind TEXT NOT NULL,        -- 'hub', 'article', 'index'
  status TEXT DEFAULT 'candidate', -- 'candidate', 'pending', 'verified'
  presence TEXT,                   -- 'present', 'absent' (after verification)
  url TEXT,
  pattern_id INTEGER,              -- FK to site_url_patterns
  confidence REAL,
  verified_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (place_id) REFERENCES places(id),
  FOREIGN KEY (pattern_id) REFERENCES site_url_patterns(id)
);
```

### 2.2 Status State Machine
```
                    ┌─────────────┐
                    │  unchecked  │ (no record in DB)
                    └──────┬──────┘
                           │ Pattern generates candidate
                           ▼
                    ┌─────────────┐
                    │   guessed   │ status='candidate', presence=NULL
                    └──────┬──────┘
                           │ Probe initiated
                           ▼
                    ┌─────────────┐
                    │   pending   │ status='pending', presence=NULL
                    └──────┬──────┘
                           │ Probe completes
               ┌───────────┴───────────┐
               ▼                       ▼
        ┌─────────────┐         ┌─────────────┐
        │  verified   │         │  verified   │
        │  (exists)   │         │  (absent)   │
        └─────────────┘         └─────────────┘
        presence='present'       presence='absent'
```

### 2.3 Article Metrics Enrichment
```sql
-- Add columns for verified hubs
ALTER TABLE place_page_mappings ADD COLUMN article_count INTEGER;
ALTER TABLE place_page_mappings ADD COLUMN earliest_article TEXT;
ALTER TABLE place_page_mappings ADD COLUMN latest_article TEXT;
ALTER TABLE place_page_mappings ADD COLUMN coverage_pct REAL;

-- Compute metrics via materialized view or trigger
CREATE VIEW place_page_mapping_stats AS
SELECT 
  ppm.id,
  COUNT(hr.id) AS article_count,
  MIN(hr.fetched_at) AS earliest_article,
  MAX(hr.fetched_at) AS latest_article
FROM place_page_mappings ppm
LEFT JOIN urls u ON u.host = ppm.host AND u.path LIKE ppm.url || '%'
LEFT JOIN http_responses hr ON hr.url_id = u.id AND hr.http_status = 200
WHERE ppm.presence = 'present'
GROUP BY ppm.id;
```

---

## 3. Matrix Dashboard UI

### 3.1 Control Architecture
```javascript
// src/ui/controls/PlaceHubGuessingMatrixControl.js

class PlaceHubGuessingMatrixControl extends BaseAppControl {
  constructor(spec) {
    super({
      ...spec,
      appName: 'Place Hub Matrix',
      title: 'Place Hub Guessing Dashboard'
    });
    this.compose();
  }

  _composeMainContent() {
    const root = this.composeContentRoot();
    
    // Filter bar
    root.add(this._composeFilterBar());
    
    // Stats summary
    root.add(this._composeStatsSummary());
    
    // Matrix grid with virtual scrolling
    root.add(this._composeMatrixGrid());
    
    // Legend
    root.add(this._composeLegend());
    
    return root;
  }

  _composeMatrixGrid() {
    // Use virtual scrolling for large matrices
    return new VirtualScrollGrid({
      rowCount: this.places.length,
      colCount: this.hosts.length,
      rowHeight: 35,
      colWidth: 60,
      renderCell: (rowIdx, colIdx) => this._renderCell(rowIdx, colIdx),
      renderRowHeader: (rowIdx) => this._renderPlaceHeader(rowIdx),
      renderColHeader: (colIdx) => this._renderHostHeader(colIdx)
    });
  }

  _renderCell(placeIdx, hostIdx) {
    const mapping = this.getMapping(placeIdx, hostIdx);
    const state = this._getCellState(mapping);
    
    return {
      className: `cell cell--${state}`,
      glyph: this._getGlyph(state),
      tooltip: this._buildTooltip(mapping),
      onClick: () => this._drillDown(mapping)
    };
  }

  _getCellState(mapping) {
    if (!mapping) return 'unchecked';
    if (mapping.status === 'candidate') return 'guessed';
    if (mapping.status === 'pending') return 'pending';
    if (mapping.presence === 'present') return 'verified-existing';
    if (mapping.presence === 'absent') return 'verified-absent';
    return 'unchecked';
  }
}
```

### 3.2 Hierarchical Place Tree
```javascript
_composeRowHeaders() {
  // Build place tree from flat list
  const tree = this._buildPlaceTree(this.places);
  
  return tree.map(node => ({
    place: node.place,
    depth: node.depth,
    isExpanded: this.expandedPlaces.has(node.place.id),
    hasChildren: node.children.length > 0,
    onToggle: () => this._togglePlace(node.place.id)
  }));
}

_buildPlaceTree(places) {
  // Group places by containment relationships
  const tree = [];
  const placeMap = new Map(places.map(p => [p.id, p]));
  
  for (const place of places) {
    if (!place.parent_id || !placeMap.has(place.parent_id)) {
      // Root-level place
      tree.push(this._buildSubtree(place, placeMap, 0));
    }
  }
  
  return this._flattenTree(tree);
}

_renderPlaceHeader(node) {
  const indent = node.depth * 16;
  
  return html`
    <div class="place-header" style="padding-left: ${indent}px">
      ${node.hasChildren ? html`
        <button class="toggle-btn" onclick=${() => node.onToggle()}>
          ${node.isExpanded ? '−' : '+'}
        </button>
      ` : html`<span class="leaf-indicator">•</span>`}
      <span class="place-name ${node.depth === 0 ? 'parent' : ''}">${node.place.name}</span>
    </div>
  `;
}
```

### 3.3 Rich Tooltips with Article Metrics
```javascript
_buildTooltip(mapping) {
  if (!mapping) return 'Unchecked — no pattern matched';
  
  const parts = [
    `place: ${mapping.place_name}`,
    `host: ${mapping.host}`,
    `status: ${mapping.status}`
  ];
  
  if (mapping.presence === 'present') {
    parts.push(`articles: ${mapping.article_count?.toLocaleString() || 'unknown'}`);
    if (mapping.earliest_article) {
      parts.push(`since: ${mapping.earliest_article.slice(0, 10)}`);
    }
    if (mapping.latest_article) {
      parts.push(`latest: ${mapping.latest_article.slice(0, 10)}`);
    }
    if (mapping.coverage_pct != null) {
      parts.push(`coverage: ${(mapping.coverage_pct * 100).toFixed(0)}%`);
    }
  }
  
  if (mapping.confidence != null) {
    parts.push(`confidence: ${(mapping.confidence * 100).toFixed(0)}%`);
  }
  
  return parts.join(' | ');
}
```

---

## 4. Verification Workflow

### 4.1 Hub Detail Page
```javascript
// src/ui/controls/PlaceHubDetailControl.js

class PlaceHubDetailControl extends BaseAppControl {
  _composeMainContent() {
    const root = this.composeContentRoot();
    
    // Status badge
    root.add(this._composeStatusBadge());
    
    // Metrics cards (if verified)
    if (this.mapping.presence === 'present') {
      root.add(this._composeMetricsCards());
      root.add(this._composeArticleTimeline());
    }
    
    // Action buttons
    root.add(this._composeActions());
    
    // Related hubs
    root.add(this._composeRelatedHubs());
    
    return root;
  }

  _composeActions() {
    return html`
      <div class="action-buttons">
        ${this.mapping.status !== 'verified' ? html`
          <button class="btn btn-success" onclick=${() => this._verify('present')}>
            ✓ Confirm Exists
          </button>
          <button class="btn btn-danger" onclick=${() => this._verify('absent')}>
            × Mark Not Found
          </button>
        ` : ''}
        <button class="btn btn-secondary" onclick=${() => this._probe()}>
          ↻ Re-probe URL
        </button>
      </div>
    `;
  }

  async _verify(outcome) {
    await fetch(`/api/place-hubs/${this.mapping.id}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome })
    });
    this.reload();
  }

  async _probe() {
    const result = await fetch(`/api/place-hubs/${this.mapping.id}/probe`, {
      method: 'POST'
    }).then(r => r.json());
    
    this.showToast(`Probe queued: Task ${result.taskId}`);
  }
}
```

### 4.2 Verification API Endpoints
```javascript
// src/ui/server/placeHubGuessing/router.js

router.post('/api/place-hubs/:id/verify', async (req, res) => {
  const { id } = req.params;
  const { outcome } = req.body; // 'present' or 'absent'
  
  const db = getDbHandle();
  
  db.prepare(`
    UPDATE place_page_mappings 
    SET status = 'verified',
        presence = ?,
        verified_at = ?
    WHERE id = ?
  `).run(outcome, new Date().toISOString(), id);
  
  // If verified as present, compute article metrics
  if (outcome === 'present') {
    await computeArticleMetrics(db, id);
  }
  
  res.json({ success: true });
});

router.post('/api/place-hubs/:id/probe', async (req, res) => {
  const { id } = req.params;
  const mapping = getPlacePageMapping(db, id);
  
  // Queue background task to probe the URL
  const task = await queueTask('hub-probe', {
    mappingId: id,
    url: mapping.url,
    host: mapping.host
  });
  
  res.json({ taskId: task.id });
});
```

---

## 5. Coverage Dashboard

### 5.1 Aggregate Statistics
```sql
-- Coverage by publisher
SELECT 
  host,
  COUNT(*) AS total_places,
  SUM(CASE WHEN presence = 'present' THEN 1 ELSE 0 END) AS verified_present,
  SUM(CASE WHEN presence = 'absent' THEN 1 ELSE 0 END) AS verified_absent,
  SUM(CASE WHEN status = 'candidate' THEN 1 ELSE 0 END) AS guessed,
  SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
  ROUND(100.0 * SUM(CASE WHEN presence = 'present' THEN 1 ELSE 0 END) / COUNT(*), 1) AS coverage_pct
FROM place_page_mappings
GROUP BY host
ORDER BY coverage_pct DESC;

-- High-priority gaps (large population × no hub)
SELECT 
  p.name AS place_name,
  p.population,
  nw.host,
  nw.name AS publisher_name
FROM places p
CROSS JOIN news_websites nw
LEFT JOIN place_page_mappings ppm 
  ON ppm.place_id = p.id AND ppm.host = nw.host
WHERE ppm.id IS NULL
  AND p.population > 1000000
ORDER BY p.population DESC, nw.priority ASC
LIMIT 20;
```

### 5.2 Dashboard Control
```javascript
// src/ui/controls/PlaceHubCoverageDashboardControl.js

class PlaceHubCoverageDashboardControl extends BaseAppControl {
  _composeMainContent() {
    const root = this.composeContentRoot();
    
    // Overall stats cards
    root.add(this._composeOverallStats());
    
    // Coverage by publisher (bar chart)
    root.add(this._composePublisherChart());
    
    // Gap analysis
    root.add(this._composeGapAnalysis());
    
    // Recent verifications
    root.add(this._composeRecentActivity());
    
    return root;
  }

  _composePublisherChart() {
    return html`
      <div class="coverage-chart">
        <h3>Coverage by Publisher</h3>
        ${this.hostStats.map(host => html`
          <div class="bar-row">
            <span class="host-name">${host.host}</span>
            <div class="bar" style="width: ${host.coverage_pct}%">
              ${host.coverage_pct}%
            </div>
            <span class="counts">
              ${host.verified_present}/${host.total_places}
            </span>
          </div>
        `)}
      </div>
    `;
  }
}
```

---

## 6. Integration Points

### 6.1 Crawler Integration
When a new page is fetched, check if it matches a guessed hub pattern:

```javascript
// In crawler post-processing
async function onPageFetched(page) {
  const { host, path } = new URL(page.url);
  
  // Check for matching guessed hubs
  const guessedHubs = await db.prepare(`
    SELECT * FROM place_page_mappings
    WHERE host = ? AND status = 'candidate'
  `).all(host);
  
  for (const hub of guessedHubs) {
    if (pathMatchesPattern(path, hub.url)) {
      // Auto-verify this hub
      await markHubVerified(hub.id, 'present');
    }
  }
}
```

### 6.2 Pattern Analysis Trigger
When page count crosses 500 threshold, auto-trigger pattern analysis:

```javascript
// In background task system
async function onPageCountChanged(host, newCount) {
  if (newCount === 500) {
    await queueTask('pattern-discovery', { host });
  }
}
```

### 6.3 Gazetteer Integration
When a new place is added to the gazetteer, generate hub candidates:

```javascript
async function onPlaceAdded(place) {
  const hosts = await db.all('SELECT host FROM news_websites WHERE status = "active"');
  
  for (const { host } of hosts) {
    const patterns = await getSiteUrlPatterns(host);
    
    for (const pattern of patterns) {
      const candidateUrl = generateUrl(pattern, place);
      const confidence = calculateConfidence(pattern, place);
      
      await db.run(`
        INSERT INTO place_page_mappings (place_id, host, url, pattern_id, confidence, status)
        VALUES (?, ?, ?, ?, ?, 'candidate')
      `, [place.id, host, candidateUrl, pattern.id, confidence]);
    }
  }
}
```

---

## 7. Performance Optimizations

### 7.1 Virtual Scrolling
For 250 places × 48 publishers = 12,000 cells, use virtual scrolling:

```javascript
// Only render visible cells
const VISIBLE_ROWS = 20;
const VISIBLE_COLS = 12;

function getVisibleRange(scrollTop, scrollLeft) {
  const startRow = Math.floor(scrollTop / ROW_HEIGHT);
  const startCol = Math.floor(scrollLeft / COL_WIDTH);
  
  return {
    rows: { start: startRow, end: startRow + VISIBLE_ROWS },
    cols: { start: startCol, end: startCol + VISIBLE_COLS }
  };
}
```

### 7.2 Batch Updates
When computing article metrics for many hubs:

```javascript
async function batchComputeArticleMetrics(mappingIds) {
  // Use a single query with aggregation
  const metrics = await db.all(`
    SELECT 
      ppm.id,
      COUNT(hr.id) AS article_count,
      MIN(hr.fetched_at) AS earliest,
      MAX(hr.fetched_at) AS latest
    FROM place_page_mappings ppm
    LEFT JOIN urls u ON u.host = ppm.host AND u.path LIKE ppm.url || '%'
    LEFT JOIN http_responses hr ON hr.url_id = u.id
    WHERE ppm.id IN (${mappingIds.map(() => '?').join(',')})
    GROUP BY ppm.id
  `, mappingIds);
  
  // Batch update
  const stmt = db.prepare(`
    UPDATE place_page_mappings 
    SET article_count = ?, earliest_article = ?, latest_article = ?
    WHERE id = ?
  `);
  
  db.transaction(() => {
    for (const m of metrics) {
      stmt.run(m.article_count, m.earliest, m.latest, m.id);
    }
  })();
}
```

### 7.3 Caching
Cache matrix data with short TTL:

```javascript
const matrixCache = new LRUCache({
  max: 100,
  ttl: 30_000 // 30 seconds
});

function getMatrixData(filters) {
  const cacheKey = JSON.stringify(filters);
  
  if (matrixCache.has(cacheKey)) {
    return matrixCache.get(cacheKey);
  }
  
  const data = queryMatrixFromDb(filters);
  matrixCache.set(cacheKey, data);
  return data;
}
```

---

## 8. Testing Strategy

### 8.1 Unit Tests
```javascript
// tests/services/PatternDiscoveryService.test.js
describe('PatternDiscoveryService', () => {
  it('should not analyze hosts below threshold', async () => {
    const result = await service.discoverPatterns('small-site.com');
    expect(result.status).toBe('insufficient-data');
  });

  it('should extract patterns with place placeholders', () => {
    const patterns = service.extractPatterns([
      'https://example.com/world/france/news',
      'https://example.com/world/germany/news',
      'https://example.com/world/spain/news'
    ]);
    
    expect(patterns[0].template).toBe('world/{place}/news');
    expect(patterns[0].uniquePlaces).toBe(3);
  });
});
```

### 8.2 Integration Tests
```javascript
// tests/integration/place-hub-matrix.test.js
describe('Place Hub Matrix', () => {
  it('should show correct cell states', async () => {
    await seedTestData();
    
    const response = await request(app).get('/admin/place-hubs');
    
    expect(response.text).toContain('cell--verified-present');
    expect(response.text).toContain('cell--guessed');
  });
});
```

### 8.3 Check Scripts
```javascript
// src/ui/server/placeHubGuessing/checks/matrix.check.js
const control = new PlaceHubGuessingMatrixControl({
  context: mockContext,
  places: mockPlaces,
  hosts: mockHosts,
  mappings: mockMappings
});

const html = control.render();
assert(html.includes('cell--verified-present'), 'Should render verified cells');
assert(html.includes('tree-node'), 'Should render hierarchical places');
```

---

## 9. Rollout Plan

### Phase 1: Foundation (Week 1)
- [ ] Add article metrics columns to `place_page_mappings`
- [ ] Implement 5-state status model
- [ ] Update matrix control with new states
- [ ] Add tree hierarchy for places

### Phase 2: Core UI (Week 2)
- [ ] Enhanced tooltips with article metrics
- [ ] Hub detail drill-down page
- [ ] Verification action buttons
- [ ] Virtual scrolling for performance

### Phase 3: Dashboard (Week 3)
- [ ] Coverage dashboard with publisher bars
- [ ] Gap analysis panel
- [ ] Recent activity feed
- [ ] Aggregate statistics

### Phase 4: Integration (Week 4)
- [ ] Crawler auto-verification integration
- [ ] Pattern discovery trigger on threshold
- [ ] Gazetteer sync for new places
- [ ] Background probe task system

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Matrix load time | <2s for 12k cells | Performance test |
| Verification accuracy | >95% | Manual audit sample |
| Coverage growth | +10% per week | Dashboard stats |
| UI responsiveness | <100ms interactions | Browser perf tools |

---

*Document created: 2026-01-08*
*Last updated: 2026-01-08*
