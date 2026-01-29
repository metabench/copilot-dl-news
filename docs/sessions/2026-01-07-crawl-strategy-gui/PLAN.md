# Plan – Crawl Strategy Configuration GUI

**Session**: 2026-01-07-crawl-strategy-gui  
**Status**: Phase 3 Complete ✅  
**Objective**: Design and implement a comprehensive GUI for viewing, choosing, and customizing crawl strategies

---

## Current State Analysis

### What Already Exists ✅

| Component | Location | Description |
|-----------|----------|-------------|
| **CrawlOperation base class** | `src/crawler/operations/CrawlOperation.js` | Base class with `name`, `summary`, `defaultOptions` |
| **11 Built-in Operations** | `src/crawler/operations/*.js` | Pre-defined crawl strategies |
| **7 Sequence Presets** | `src/crawler/operations/sequencePresets.js` | Multi-step crawl workflows |
| **Crawler Profiles UI** | `src/ui/server/crawlerProfiles/server.js` | Basic CRUD for saved profiles |
| **CrawlerProfilesStore** | `src/crawler/profiles/CrawlerProfilesStore.js` | DB-backed profile storage |
| **Crawl Service API** | `src/server/crawl-api/core/crawlService.js` | `getAvailability()` returns operations + sequences + schemas |
| **Operation Schema System** ✅ | `src/crawler/operations/schemas/` | Typed option schemas for all 11 operations |

### Built-in Operations Inventory

| Operation | Summary | Key Options |
|-----------|---------|-------------|
| `basicArticleCrawl` | General article crawl | `crawlType`, `maxDownloads`, `useSitemap`, `enableDb` |
| `siteExplorer` | Structure discovery | `structureOnly`, `maxDepth` |
| `ensureCountryHubs` | Country hub structure | `countryHubExclusiveMode`, `structureOnly` |
| `exploreCountryHubs` | Country hub content | `countryHubExclusiveMode`, `plannerVerbosity` |
| `guessPlaceHubs` | Place hub candidate discovery | `kinds`, `patternsPerPlace`, `apply`, `maxAgeDays` |
| `findTopicHubs` | Topic hub discovery | _(inherits base options)_ |
| `findPlaceAndTopicHubs` | Combined discovery | _(inherits base options)_ |
| `crawlCountryHubHistory` | Historical content | _(per-hub history)_ |
| `crawlCountryHubsHistory` | Multi-hub history | _(batch history)_ |

### Sequence Presets Inventory

| Preset | Steps | Description |
|--------|-------|-------------|
| `ensureCountryStructure` | 1 | Ensure country hub structure |
| `ensureAndExploreCountryHubs` | 2 | Ensure + explore |
| `basicArticleDiscovery` | 1 | Basic article crawl |
| `intelligentCountryHubDiscovery` | 4 | Full intelligent discovery |
| `fullCountryHubDiscovery` | 4 | Comprehensive coverage |
| `countryHubHistoryRefresh` | 1 | Historical refresh |
| `resilientCountryExploration` | 3 | Continue on error |

### Common Override Options (from code analysis)

```javascript
// Core crawler options
maxDownloads: number       // Max pages to fetch
maxDepth: number           // Max link depth
concurrency: number        // Parallel requests
useSitemap: boolean        // Load sitemaps
preferCache: boolean       // Use cached content
enableDb: boolean          // Save to database

// Crawl behavior
crawlType: string          // 'basic', 'intelligent-hubs', 'discover-structure'
structureOnly: boolean     // Skip article content
countryHubExclusiveMode: boolean  // Focus on country hubs

// Planner options
plannerVerbosity: 0|1|2    // Logging detail level
useSequenceRunner: boolean // Use sequence runner

// Logging
logging: { queue: boolean } // Queue logging
progressJson: boolean       // JSON progress output
telemetryJson: boolean      // JSON telemetry output
```

---

## Gap Analysis

### What's Missing for a Good Strategy GUI

1. **Operation Schema** — No formal schema for operation options (types, ranges, defaults, descriptions)
2. **Option Metadata** — Options lack descriptions, validation rules, UI hints
3. **Rich Editor UI** — Current profiles UI is raw JSON editing only
4. **Operation Explorer** — No UI to browse operations and their options
5. **Sequence Builder** — No UI to create/edit multi-step sequences
6. **Preview/Dry-run** — No way to preview what a strategy will do

---

## Proposed Architecture

### Layer 1: Option Schema System

Create schema definitions for each operation's options:

```javascript
// src/crawler/operations/schemas/basicArticleCrawl.schema.js
module.exports = {
  operation: 'basicArticleCrawl',
  label: 'Basic Article Crawl',
  description: 'General purpose article crawler without hub discovery',
  category: 'article-crawl',
  options: {
    maxDownloads: {
      type: 'number',
      label: 'Max Pages',
      description: 'Maximum number of pages to download',
      default: 1000,
      min: 1,
      max: 100000,
      step: 100
    },
    concurrency: {
      type: 'number',
      label: 'Concurrency',
      description: 'Number of parallel requests',
      default: 4,
      min: 1,
      max: 20,
      step: 1
    },
    useSitemap: {
      type: 'boolean',
      label: 'Use Sitemap',
      description: 'Load and follow sitemap.xml',
      default: true
    },
    crawlType: {
      type: 'enum',
      label: 'Crawl Type',
      description: 'Strategy for link following',
      default: 'basic',
      options: [
        { value: 'basic', label: 'Basic' },
        { value: 'intelligent-hubs', label: 'Intelligent Hubs' },
        { value: 'discover-structure', label: 'Structure Discovery' }
      ]
    }
  }
};
```

### Layer 2: Schema Registry

```javascript
// src/crawler/operations/schemas/index.js
const OperationSchemaRegistry = {
  getSchema(operationName) { ... },
  listSchemas() { ... },
  validateOptions(operationName, options) { ... }
};
```

### Layer 3: Enhanced Profiles UI

New jsgui3-based control replacing raw JSON editor:

```
/admin/crawl-strategies
├── /operations      — Browse all operations
├── /sequences       — Browse/create sequences
├── /profiles        — Saved configurations
├── /profile/:id     — Edit a profile with form UI
└── /preview         — Dry-run preview
```

---

## Implementation Phases

### Phase 1: Schema System (Foundation)

**Goal**: Create typed schemas for all operations

**Tasks**:
1. Create schema format specification
2. Define schemas for all 8 operations
3. Create OperationSchemaRegistry
4. Add validation method
5. Expose via crawlService.getAvailability()

**Files**:
- `src/crawler/operations/schemas/*.schema.js` — Per-operation schemas
- `src/crawler/operations/schemas/index.js` — Registry

### Phase 2: Strategy Explorer UI

**Goal**: Browse operations and sequences with their options

**Tasks**:
1. Create `CrawlStrategyExplorerControl.js`
2. Operations list view with filtering
3. Operation detail view with options table
4. Sequences list view
5. Integrate with UnifiedApp

**Files**:
- `src/ui/server/crawlStrategies/` — New UI module
- `src/ui/server/crawlStrategies/controls/CrawlStrategyExplorerControl.js`
- `src/ui/server/crawlStrategies/server.js`

### Phase 3: Profile Form Editor

**Goal**: Replace JSON editor with form-based profile editing

**Tasks**:
1. Create `CrawlProfileEditorControl.js`
2. Dynamic form generation from schema
3. Option validation feedback
4. Save/update workflow

### Phase 4: Sequence Builder (P2)

**Goal**: Visual multi-step sequence creation

*Deferred to follow-up — more complex UI work*

### Phase 5: Preview/Dry-run (P2)

**Goal**: Show what a strategy will do before running

*Deferred to follow-up — requires crawl simulation*

---

## Done When

- [x] Phase 1: Operation schemas exist for all operations ✅
- [x] Phase 2: `/crawl-strategies` shows browsable operations ✅
- [x] Phase 3: Profile editing uses form controls instead of JSON ✅
- [x] All existing crawlerProfiles tests still pass ✅
- [x] Check scripts validate new UI renders correctly ✅

---

## Phase 1 Deliverables (Complete)

| File | Purpose |
|------|---------|
| `src/crawler/operations/schemas/common.schema.js` | Shared option definitions |
| `src/crawler/operations/schemas/basicArticleCrawl.schema.js` | Basic article crawl options |
| `src/crawler/operations/schemas/siteExplorer.schema.js` | Site explorer options |
| `src/crawler/operations/schemas/ensureCountryHubs.schema.js` | Hub verification options |
| `src/crawler/operations/schemas/exploreCountryHubs.schema.js` | Hub exploration options |
| `src/crawler/operations/schemas/guessPlaceHubs.schema.js` | Place hub guessing options |
| `src/crawler/operations/schemas/findTopicHubs.schema.js` | Topic discovery options |
| `src/crawler/operations/schemas/findPlaceAndTopicHubs.schema.js` | Combined discovery options |
| `src/crawler/operations/schemas/crawlCountryHubHistory.schema.js` | Single hub history options |
| `src/crawler/operations/schemas/crawlCountryHubsHistory.schema.js` | Batch hub history options |
| `src/crawler/operations/schemas/sitemapDiscovery.schema.js` | Sitemap-first crawl options |
| `src/crawler/operations/schemas/sitemapOnly.schema.js` | Sitemap-only crawl options |
| `src/crawler/operations/schemas/index.js` | OperationSchemaRegistry |
| `src/crawler/operations/schemas/checks/schemas.check.js` | Schema validation check |
| `checks/crawl-service-schemas.check.js` | API integration check |

**API Enhancement**: `crawlService.getAvailability()` now returns `optionSchema` for each operation.

---

## Phase 2 Deliverables (Complete)

| File | Purpose |
|------|---------|
| `src/ui/server/crawlStrategies/controls/CrawlStrategyExplorerControl.js` | Main UI control with 3 views |
| `src/ui/server/crawlStrategies/controls/index.js` | Control exports |
| `src/ui/server/crawlStrategies/server.js` | Express router with 5 routes |
| `src/ui/server/crawlStrategies/checks/crawl-strategies.check.js` | Rendering validation (22 assertions) |

**UI Features**:
- Operations list view with category grouping (Article Crawling, Site Discovery, Hub Discovery, Hub Management, History)
- Operation detail view showing all configuration options with types, defaults, and descriptions
- Sequences view showing multi-step preset workflows with resilience badges
- Navigation tabs between Operations and Sequences
- Integration with UnifiedApp at `/crawl-strategies`

**Routes**:
- `GET /` — Operations list view
- `GET /sequences` — Sequences list view
- `GET /profiles` — Saved profiles list view
- `GET /operation/:name` — Operation detail view
- `GET /profiles/new` — New profile form
- `GET /profiles/:id` — Edit profile form
- `GET /api/operations` — JSON API for operations
- `GET /api/sequences` — JSON API for sequences

---

## Phase 3 Deliverables (Complete)

| File | Purpose |
|------|---------|
| `src/ui/server/crawlStrategies/controls/CrawlProfileEditorControl.js` | Form-based profile editor (777 lines) |
| `src/ui/server/crawlStrategies/checks/profile-editor.check.js` | Rendering validation (29 assertions, 4 tests) |

**UI Features**:
- Dynamic form generation from operation schemas
- Form field types: range sliders (numbers with min/max), checkboxes (booleans), select dropdowns (enums), text inputs
- Category grouping for options (Behavior, Limits, Performance, Discovery, Storage, Logging)
- Advanced options toggle to hide rarely-used options
- Pre-populated forms for editing existing profiles
- Profiles tab in Strategy Explorer for browsing saved profiles
- Profile cards showing operation, start URL, and tag counts

**Form Sections**:
1. **Profile Details**: ID, label, start URL, description
2. **Crawl Operation**: Grouped dropdown with all 11 operations
3. **Configuration Options**: Dynamic fields from selected operation schema
4. **Actions**: Save/Create, Cancel, Delete (for existing profiles)

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Schema maintenance burden | Drift from actual options | Derive schemas from JSDoc or runtime introspection |
| Complex nested options | Hard to render forms | Start with flat options, defer nested later |
| Breaking existing profiles | Data loss | Preserve raw JSON fallback |

---

## Quick Win: Enhanced getAvailability()

Before building the full UI, enhance the API to return richer metadata:

```javascript
// Current
{ name: 'basicArticleCrawl', summary: '...', defaultOptions: {...} }

// Enhanced
{ 
  name: 'basicArticleCrawl', 
  summary: '...', 
  category: 'article-crawl',
  defaultOptions: {...},
  optionSchema: {
    maxDownloads: { type: 'number', min: 1, max: 100000, default: 1000 },
    ...
  }
}
```

This allows the UI to render forms without hardcoding option shapes.

---

## File Structure Preview

```
src/
├── crawler/
│   └── operations/
│       ├── schemas/
│       │   ├── index.js                    # Registry
│       │   ├── basicArticleCrawl.schema.js
│       │   ├── siteExplorer.schema.js
│       │   ├── ensureCountryHubs.schema.js
│       │   ├── exploreCountryHubs.schema.js
│       │   ├── guessPlaceHubs.schema.js
│       │   ├── findTopicHubs.schema.js
│       │   ├── findPlaceAndTopicHubs.schema.js
│       │   └── crawlCountryHubHistory.schema.js
│       └── ... (existing)
├── ui/
│   └── server/
│       └── crawlStrategies/
│           ├── server.js
│           ├── controls/
│           │   ├── CrawlStrategyExplorerControl.js
│           │   ├── CrawlOperationDetailControl.js
│           │   └── CrawlProfileEditorControl.js
│           └── checks/
│               └── crawlStrategies.check.js
```

---

## Tests / Validation

- [ ] `npm run test:by-path tests/crawler/operations/schemas.test.js` — Schema validation
- [ ] `node src/ui/server/crawlStrategies/checks/crawlStrategies.check.js` — UI rendering
- [ ] Existing crawlerProfiles tests still pass

---

## Next Steps

1. **Decision point**: Start with Phase 1 (schemas) or jump to Phase 2 (UI with current data)?
2. Review with user which options are most important to configure
3. Identify any missing operations that need to be created
