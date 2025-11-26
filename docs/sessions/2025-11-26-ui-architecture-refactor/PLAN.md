# UI Architecture Refactor Plan

## Objective

Refactor the non-docs-viewer UI servers (Data Explorer, Diagram Atlas, Gazetteer) to use the same component-based architectural pattern established in the docs viewer.

## Done When

- [ ] Data Explorer uses `ExplorerAppControl` that composes child controls
- [ ] Diagram Atlas uses `DiagramAtlasAppControl` that composes child controls
- [ ] Gazetteer uses `GazetteerAppControl` that composes child controls
- [ ] All servers have dedicated `controls/` folders with focused control files
- [ ] CSS is co-located with controls or in dedicated style files
- [ ] Server files are slim routing/orchestration layers only
- [ ] Pattern documented in `docs/REFACTORING_PATTERNS.md`

---

## Current State Analysis

### ✅ Docs Viewer (Reference Pattern)

**Files:** `src/ui/server/docsViewer/`
- `server.js` (~400 lines) - Express routes, orchestration only
- `controls/DocAppControl.js` - Top-level app control with `compose()`
- `controls/DocNavControl.js` - Navigation tree control
- `controls/DocViewerControl.js` - Content viewer control
- `client/controls/` - Client-side activation controls

**Pattern:**
```
DocAppControl (compose)
├── _buildHeader() → header element
├── DocNavControl (compose)
│   ├── search input
│   ├── file filters
│   └── tree structure
└── DocViewerControl (compose)
    ├── breadcrumbs
    ├── toolbar
    └── content area
```

**Key Characteristics:**
1. **Self-contained controls** - Each control knows how to compose itself
2. **Hierarchical composition** - Parent controls compose child controls
3. **Clear separation** - Server handles routing, controls handle rendering
4. **Client activation markers** - `data-jsgui-control` for client behavior
5. **Focused files** - One control per file, <200 lines each

---

### ⚠️ Data Explorer (Needs Refactor)

**Files:** `src/ui/server/dataExplorerServer.js` (~1160 lines!)
- Monolithic file mixing routing, rendering, data fetching
- Uses `renderHtml()` from `render-url-table.js` (~1363 lines)
- Controls in `src/ui/controls/` are generic building blocks, not app-specific

**Current Pattern (Procedural):**
```
dataExplorerServer.js
├── createDataExplorerServer() - Express setup
├── DATA_VIEWS[] - Route definitions
├── buildUrlListingPayload() - Data fetching
├── renderUrlListView() - Returns { columns, rows, meta }
├── renderDomainSummaryView() - Returns { columns, rows, meta }
└── renderHtml() → Full HTML page assembly
```

**Problems:**
1. Server file is ~1160 lines - too large
2. No top-level `ExplorerAppControl`
3. Rendering logic scattered across multiple functions
4. CSS embedded in `render-url-table.js`
5. Hard to test individual components

**Target Pattern:**
```
src/ui/server/dataExplorer/
├── server.js (~200 lines) - Routes only
├── controls/
│   ├── ExplorerAppControl.js - Top-level compose()
│   ├── ExplorerNavControl.js - Navigation links
│   ├── ExplorerHomeControl.js - Dashboard cards
│   ├── UrlListingControl.js - URL table view
│   ├── DomainSummaryControl.js - Domain summary view
│   ├── CrawlJobsControl.js - Crawl jobs view
│   └── ErrorLogControl.js - Error log view
├── styles/
│   └── explorer.css
└── utils/
    └── dataLoaders.js - Data fetching helpers
```

---

### ⚠️ Diagram Atlas (Needs Refactor)

**Files:** `src/ui/server/diagramAtlasServer.js` (~484 lines)
- All rendering in single file
- Uses helper functions like `createStat()`, `buildCodeSection()`
- Some controls in `src/ui/controls/DiagramAtlasControls.js`

**Current Pattern:**
```
diagramAtlasServer.js
├── renderDiagramAtlasHtml() - Full page assembly
├── createStat() - Metric card helper
├── buildStateScript() - Client state injection
└── createDiagramAtlasServer() - Express setup
```

**Target Pattern:**
```
src/ui/server/diagramAtlas/
├── server.js (~150 lines)
├── controls/
│   ├── DiagramAtlasAppControl.js - Top-level
│   ├── DiagramHeroControl.js - Header with stats
│   ├── DiagramCodeSectionControl.js - Code analysis
│   ├── DiagramDbSectionControl.js - DB analysis
│   └── DiagramFeatureSectionControl.js - Features
├── styles/
│   └── diagram-atlas.css
└── utils/
    └── dataService.js
```

---

### ⚠️ Gazetteer (Needs Refactor)

**Files:** `src/ui/server/gazetteer/views/placeView.js` (~479 lines)
- Class-based but procedural rendering
- `_render()` builds entire page structure
- Methods like `renderSearch()`, `renderPlace()` return full HTML

**Current Pattern:**
```
PlaceView class
├── _render(title, buildContentFn) - Page wrapper
├── renderSearch(results, query) - Search results
├── renderPlace(place) - Place details
└── renderHierarchy(place) - Place hierarchy
```

**Target Pattern:**
```
src/ui/server/gazetteer/
├── server.js (~150 lines)
├── controls/
│   ├── GazetteerAppControl.js - Top-level with search bar
│   ├── GazetteerNavControl.js - Search + navigation
│   ├── GazetteerWelcomeControl.js - Home page
│   ├── GazetteerSearchResultsControl.js - Search results
│   ├── GazetteerPlaceDetailControl.js - Place details
│   └── GazetteerHierarchyControl.js - Place hierarchy
├── styles/
│   └── gazetteer.css
└── utils/
    └── placeQueries.js
```

---

## Refactoring Strategy

### Phase 1: Create Base Infrastructure

1. **Create `src/ui/server/shared/BaseAppControl.js`**
   - Common patterns for all app controls
   - Page shell, header, navigation slots

2. **Create style extraction utilities**
   - Move CSS from inline to files
   - Establish BEM naming convention

### Phase 2: Data Explorer Refactor

1. Extract `ExplorerAppControl` with compose()
2. Extract view-specific controls (UrlListing, DomainSummary, etc.)
3. Slim down `dataExplorerServer.js` to routing only
4. Move to `src/ui/server/dataExplorer/` folder structure

### Phase 3: Diagram Atlas Refactor

1. Extract `DiagramAtlasAppControl` with compose()
2. Extract section controls
3. Move to `src/ui/server/diagramAtlas/` folder structure

### Phase 4: Gazetteer Refactor

1. Extract `GazetteerAppControl` with compose()
2. Extract view controls
3. Move to `src/ui/server/gazetteer/controls/` structure

### Phase 5: Documentation & Validation

1. Document the refactoring pattern
2. Run focused tests for each server
3. Verify all UI functionality preserved

---

## Risk Assessment

| Component | Files Affected | Risk Level | Mitigation |
|-----------|---------------|------------|------------|
| Data Explorer | ~15 files | HIGH (20+ usages) | Staged rollout, keep old files as backup |
| Diagram Atlas | ~8 files | MEDIUM (10-15 usages) | Extract controls incrementally |
| Gazetteer | ~6 files | MEDIUM (8-12 usages) | Preserve PlaceView API initially |
| Shared Utils | ~5 files | LOW (<5 usages) | New files, no breaking changes |

---

## Task Breakdown

### Phase 1: Infrastructure (Est. 30 min)
- [ ] Create `src/ui/server/shared/` folder
- [ ] Create `BaseAppControl.js` with common patterns
- [ ] Create style extraction utility

### Phase 2: Data Explorer (Est. 2 hours)
- [ ] Create `src/ui/server/dataExplorer/controls/` folder
- [ ] Extract `ExplorerAppControl.js`
- [ ] Extract `ExplorerNavControl.js`
- [ ] Extract `UrlListingControl.js`
- [ ] Extract `DomainSummaryControl.js`
- [ ] Extract `CrawlJobsControl.js`
- [ ] Extract `ErrorLogControl.js`
- [ ] Create new `server.js` (~200 lines)
- [ ] Update imports and verify functionality

### Phase 3: Diagram Atlas (Est. 1 hour)
- [ ] Create `src/ui/server/diagramAtlas/controls/` folder
- [ ] Extract `DiagramAtlasAppControl.js`
- [ ] Extract section controls
- [ ] Create new `server.js`

### Phase 4: Gazetteer (Est. 1 hour)
- [ ] Create `src/ui/server/gazetteer/controls/` folder
- [ ] Extract `GazetteerAppControl.js`
- [ ] Extract view controls
- [ ] Create new `server.js`

### Phase 5: Polish (Est. 30 min)
- [ ] Update `docs/REFACTORING_PATTERNS.md`
- [ ] Run focused tests
- [ ] Update session summary

---

## Singularity Contribution Goal

After this refactor, document the pattern in `docs/REFACTORING_PATTERNS.md`:

```markdown
## Pattern: Monolithic Server → Component-Based Architecture

**When to use:** Server file >500 lines mixing routing, rendering, and data fetching

**Discovery command:** Count lines and identify procedural rendering functions

**Steps:**
1. Identify the "app shell" pattern (header, nav, content areas)
2. Create `<App>AppControl.js` with `compose()` method
3. Extract each view/section into its own control
4. Move server to routing-only (~200 lines max)
5. Co-locate styles with controls

**Validation:** Server file <300 lines, controls <200 lines each
```
