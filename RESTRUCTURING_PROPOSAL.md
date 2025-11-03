# Restructuring Proposal: Organizing `/src/tools` and `/src` Utilities

## Executive Summary

**Current Problem**: `/src/tools` contains 38 files with mixed purposes and unclear organization. These are NOT tools, but rather infrastructure, utilities, and business logic used throughout the application.

**Proposed Solution**: Reorganize into a logical 3-tier structure based on layer and responsibility:
1. **`src/utils/`** — Shared utilities (text processing, data transformation)
2. **`src/classifiers/`** — Classification engines (place detection, article evaluation)
3. **`src/analysis/`** — Enhanced analysis pipeline (page analysis, compression workers)

**Benefits**:
- ✅ Clear semantic meaning (utilities vs classifiers vs analysis)
- ✅ Reduced import path depth (e.g., `../utils/slugify` vs `../tools/slugify`)
- ✅ Better colocates related code (all gap analyzers in `src/services/`, all utilities in `src/utils/`)
- ✅ Facilitates future CLI tool organization in `/tools` (root)
- ✅ Makes it clear what's runtime infrastructure vs optional CLI tools

---

## Current State Analysis

### What's Actually in `/src/tools`?

**38 files organized into rough categories** (discovered by listing):

#### Tier 1: Core Utilities (6 files)
- `slugify.js` — Text normalization (63 lines, imported 11 times)
- `milestones.js` — Achievement tracking
- `nonGeoTopicSlugs.js` — Topic slug reference
- `humanizeSegment()` — Helper (currently in placeHubDetector.js)

#### Tier 2: Classification Engines (3 files)
- `placeHubDetector.js` — Hub classification (740 lines, imported 3 times)
- `detect-articles.js` — Article detection
- `pageAnalysis.worker.js` — Worker pool for analysis

#### Tier 3: Analysis Pipelines (4 files)
- `analyse-pages-core.js` — Page analysis engine (677 lines, imported 2 times)
- `analyse-pages.js` — Entry point
- `analysis-run.js` — Run orchestration
- `PageAnalysisWorkerPool.js` — Worker management

#### Tier 4: CLI/Standalone Tools (15+ files)
- `add-planet-hub.js`
- `backfill-dates.js`
- `export-gazetteer.js`
- `guess-place-hubs.js`
- `import-gazetteer.js`
- `populate-gazetteer.js`
- `validate-gazetteer.js`
- `crawl-query-benchmark.js`
- `discover-news-websites.js`
- `geography-crawl-queries.js`
- `rebuild-news-website-cache.js`
- `show-analysis.js`
- `analyze-domains.js`
- `preview-analysis.js`
- `analyze-single-page.js`
- `analyze-post-run.js`

#### Tier 5: Data/Config (3 files)
- `restcountries.json`
- `restcountries.min.json`
- `backfill-checkpoint.json`

#### Tier 6: Subdirectories (3)
- `cli/` — CLI-specific code
- `data/` — Data files
- `normalize-urls/` — URL normalization
- `__tests__/` — Tests

---

## Proposed New Structure

### Directory Tree

```
src/
├── utils/                          # NEW: Shared utilities
│   ├── text/
│   │   ├── slugify.js             # From /src/tools/slugify.js
│   │   ├── humanizeSegment.js     # Extracted from placeHubDetector.js
│   │   └── __tests__/
│   └── reference-data/
│       ├── nonGeoTopicSlugs.js    # From /src/tools/nonGeoTopicSlugs.js
│       ├── restcountries.js       # From /src/tools/restcountries.js
│       └── __tests__/
│
├── classifiers/                    # NEW: Classification engines
│   ├── PlaceHubClassifier.js      # From /src/tools/placeHubDetector.js (renamed)
│   ├── ArticleClassifier.js       # From /src/tools/detect-articles.js (renamed)
│   └── __tests__/
│
├── analysis/                       # EXPANDED: Analysis infrastructure
│   ├── engine/
│   │   ├── AnalysisPipeline.js    # From /src/tools/analyse-pages-core.js (renamed)
│   │   ├── AnalysisRunner.js      # From /src/tools/analysis-run.js (renamed)
│   │   └── __tests__/
│   │
│   ├── workers/
│   │   ├── PageAnalysisWorker.js  # From /src/tools/pageAnalysis.worker.js (renamed)
│   │   ├── AnalysisWorkerPool.js  # From /src/tools/PageAnalysisWorkerPool.js (renamed)
│   │   └── __tests__/
│   │
│   ├── milestones.js              # From /src/tools/milestones.js
│   └── __tests__/
│
├── services/                       # EXISTING (no changes to core)
│   ├── CountryHubGapAnalyzer.js   # Update imports
│   ├── CityHubGapAnalyzer.js      # Update imports
│   ├── PlaceHubGapAnalyzer.js     # Update imports
│   └── ... (all gap analyzers)
│
├── orchestration/                  # EXISTING (update imports)
│   ├── DomainProcessor.js         # Update imports
│   ├── ValidationOrchestrator.js  # Update imports
│   └── PersistenceManager.js      # Update imports
│
├── background/
│   └── tasks/
│       ├── AnalysisTask.js        # Update imports
│       └── GuessPlaceHubsTask.js  # Update imports
│
└── crawler/                        # EXISTING (update imports)
    └── ProblemResolutionService.js # Update imports

tools/                             # EXISTING (root-level, no changes)
├── dev/                           # Developer tools (js-edit, etc.)
├── maintenance/                   # Maintenance scripts
├── gazetteer/                     # Gazetteer tools
├── analysis/                      # Analysis tools
├── corrections/                   # Data correction tools
├── debug/                         # Debug utilities
├── migrations/                    # Database migrations
└── ... (other CLI tools)

src/tools/                         # DEPRECATED: This directory becomes EMPTY
                                   # All content moved to src/utils, src/classifiers, src/analysis
                                   # Can be deleted once migration complete
```

---

## Migration Plan

### Phase 1: Create New Directory Structure (15 minutes)

**Step 1: Create new directories**
```bash
mkdir -p src/utils/text
mkdir -p src/utils/reference-data
mkdir -p src/classifiers
mkdir -p src/analysis/engine
mkdir -p src/analysis/workers
```

### Phase 2: Move Core Utilities (30 minutes)

**Moving `src/utils/text/`:**
```javascript
// src/utils/text/slugify.js
// From: src/tools/slugify.js (no changes to content)
// Updated exports: same API

// src/utils/text/humanizeSegment.js
// Extracted from: src/tools/placeHubDetector.js
function humanizeSegment(s) {
  const text = String(s || '').replace(/[-_]+/g, ' ').trim();
  if (!text) return null;
  return text
    .split(/\s+/)
    .map((part) => part ? part.charAt(0).toUpperCase() + part.slice(1) : part)
    .join(' ');
}
module.exports = { humanizeSegment };
```

**Moving `src/utils/reference-data/`:**
```javascript
// src/utils/reference-data/nonGeoTopicSlugs.js
// From: src/tools/nonGeoTopicSlugs.js (no changes)

// src/utils/reference-data/restcountries.js
// From: src/tools/restcountries.js (no changes)
```

### Phase 3: Migrate Classifiers (1 hour)

**Step 1: Move and rename PlaceHubClassifier**
```javascript
// File: src/classifiers/PlaceHubClassifier.js
// From: src/tools/placeHubDetector.js

// Update internal imports:
// OLD: const { slugify, normalizeForMatching } = require('./slugify');
// NEW: const { slugify, normalizeForMatching } = require('../utils/text/slugify');

// OLD: const { humanizeSegment } = require('./placeHubDetector'); // self
// NEW: const { humanizeSegment } = require('../utils/text/humanizeSegment');

// OLD: const { loadNonGeoTopicSlugs } = require('./nonGeoTopicSlugs');
// NEW: const { loadNonGeoTopicSlugs } = require('../utils/reference-data/nonGeoTopicSlugs');

// Export the main function with new name
module.exports = {
  detectPlaceHub,  // Keep main export name for compatibility
  slugify,         // Re-export for compatibility (can deprecate)
  humanizeSegment  // Re-export for compatibility (can deprecate)
};
```

**Step 2: Move and rename ArticleClassifier**
```javascript
// File: src/classifiers/ArticleClassifier.js
// From: src/tools/detect-articles.js

// Update internal imports similarly
```

### Phase 4: Migrate Analysis Infrastructure (2 hours)

**Step 1: Move analysis engine**
```javascript
// File: src/analysis/engine/AnalysisPipeline.js
// From: src/tools/analyse-pages-core.js

// Update imports:
// OLD: const { slugify } = require('../tools/slugify');
// NEW: const { slugify } = require('../../utils/text/slugify');

// OLD: const { loadNonGeoTopicSlugs } = require('./nonGeoTopicSlugs');
// NEW: const { loadNonGeoTopicSlugs } = require('../../utils/reference-data/nonGeoTopicSlugs');

// OLD: const { PlaceAnalyzer } = require('./placeAnalyzer');
// NEW: const { PlaceAnalyzer } = require('../../analysis/PlaceAnalyzer');
```

**Step 2: Move worker infrastructure**
```javascript
// File: src/analysis/workers/PageAnalysisWorker.js
// From: src/tools/pageAnalysis.worker.js

// File: src/analysis/workers/AnalysisWorkerPool.js
// From: src/tools/PageAnalysisWorkerPool.js

// Update internal imports
```

**Step 3: Move milestones tracker**
```javascript
// File: src/analysis/milestones.js
// From: src/tools/milestones.js
// (content unchanged, same location structure)
```

### Phase 5: Update All Importers (3 hours)

**Files to update (14 files, 20+ import statements):**

#### Services (8 files)
```javascript
// FROM OLD:
const { slugify } = require('../tools/slugify');

// TO NEW:
const { slugify } = require('../utils/text/slugify');

// Files: All in src/services/
// - CityHubGapAnalyzer.js
// - CountryHubGapAnalyzer.js
// - HubGapAnalyzerBase.js
// - CountryHubMatcher.js
// - PlaceTopicHubGapAnalyzer.js
// - PlacePlaceHubGapAnalyzer.js
// - RegionHubGapAnalyzer.js
// - TopicHubGapAnalyzer.js
```

#### Orchestration (3 files)
```javascript
// FROM OLD:
const { slugify } = require('../tools/slugify');
const { detectPlaceHub } = require('../tools/placeHubDetector');

// TO NEW:
const { slugify } = require('../utils/text/slugify');
const { detectPlaceHub } = require('../classifiers/PlaceHubClassifier');

// Files:
// - src/orchestration/DomainProcessor.js
// - src/orchestration/ValidationOrchestrator.js
// - src/orchestration/PersistenceManager.js
```

#### Analysis (1 file)
```javascript
// FROM OLD:
const { detectPlaceHub } = require('../tools/placeHubDetector');

// TO NEW:
const { detectPlaceHub } = require('../classifiers/PlaceHubClassifier');

// Files:
// - src/analysis/page-analyzer.js
```

#### Background Tasks (2 files)
```javascript
// FROM OLD:
const { analysePages } = require('../../tools/analyse-pages-core');
const { awardMilestones } = require('../../tools/milestones');

// TO NEW:
const { analysePages } = require('../../analysis/engine/AnalysisPipeline');
const { awardMilestones } = require('../../analysis/milestones');

// Files:
// - src/background/tasks/AnalysisTask.js
// - src/background/tasks/GuessPlaceHubsTask.js
```

#### Crawler (1 file)
```javascript
// FROM OLD:
const { slugify } = require('../tools/placeHubDetector');

// TO NEW:
const { slugify } = require('../utils/text/slugify');

// Files:
// - src/crawler/ProblemResolutionService.js
```

### Phase 6: Update Root-Level Tools (1 hour)

**Files that import from `/src/tools` (in `/tools` root):**

```javascript
// FROM OLD:
const { analysePages } = require('../../src/tools/analyse-pages-core');
const { runAnalysisPostProcessing } = require('../../src/tools/analyze-post-run');

// TO NEW:
const { analysePages } = require('../../src/analysis/engine/AnalysisPipeline');
const { runAnalysisPostProcessing } = require('../../src/analysis/analyze-post-run');

// File: tools/maintenance/analysis-maintenance-cycle.js
```

```javascript
// FROM OLD:
const { slugify } = require('../src/tools/slugify');

// TO NEW:
const { slugify } = require('../src/utils/text/slugify');

// File: tools/lib/dspl/placeMetadata.js
// File: tools/analysis/enhanced-hub-discovery.js
```

### Phase 7: Handle CLI/Standalone Tools (2 hours)

**Decision: Keep standalone tools in `/src/tools` subdirectory OR move to `/tools` root**

Option A: **Move to `/tools` (Recommended)**
```
/src/tools/               (deprecated, used only for runtime utilities)
/tools/cli/              (new home for CLI tools)
└── backfill-dates.js
└── export-gazetteer.js
└── guess-place-hubs.js
└── import-gazetteer.js
└── populate-gazetteer.js
└── validate-gazetteer.js
└── etc...
```

Option B: **Keep in `/src/tools` with clear separation**
```
/src/tools/              (runtime utilities)
├── backfill-dates.js
├── export-gazetteer.js
└── ...
```

**Recommendation**: Option A creates cleanest separation:
- `/src/utils`, `/src/classifiers`, `/src/analysis` = runtime infrastructure
- `/tools/*` = all CLI operations
- No ambiguity about what's a tool vs what's a utility

### Phase 8: Validation and Cleanup (1-2 hours)

**Step 1: Run all tests**
```bash
npm test 2>&1 | tee migration-test-results.txt
```

**Step 2: Verify imports**
```bash
# Check for any remaining old import paths
grep -r "require.*tools/slugify" src/
grep -r "require.*tools/placeHubDetector" src/
grep -r "require.*tools/analyse-pages-core" src/
# Should return 0 results
```

**Step 3: Remove empty directory**
```bash
# After all imports updated and tests pass:
rm -rf src/tools/
```

**Step 4: Update documentation**
- Update AGENTS.md references
- Update README.md if it mentions `/src/tools`
- Add migration note to CHANGE_PLAN.md

---

## Import Path Mapping Reference

### All Changes in One Place

| File | Old Import | New Import |
|------|-----------|-----------|
| `src/services/*.js` | `../tools/slugify` | `../utils/text/slugify` |
| `src/orchestration/*.js` | `../tools/slugify` | `../utils/text/slugify` |
| `src/orchestration/*.js` | `../tools/placeHubDetector` | `../classifiers/PlaceHubClassifier` |
| `src/analysis/page-analyzer.js` | `../tools/placeHubDetector` | `../classifiers/PlaceHubClassifier` |
| `src/background/tasks/AnalysisTask.js` | `../../tools/analyse-pages-core` | `../../analysis/engine/AnalysisPipeline` |
| `src/background/tasks/AnalysisTask.js` | `../../tools/milestones` | `../../analysis/milestones` |
| `src/background/tasks/GuessPlaceHubsTask.js` | `../../tools/guess-place-hubs` | (decision: move or keep?) |
| `src/crawler/ProblemResolutionService.js` | `../tools/placeHubDetector` | `../classifiers/PlaceHubClassifier` |
| `tools/maintenance/analysis-maintenance-cycle.js` | `../../src/tools/analyse-pages-core` | `../../src/analysis/engine/AnalysisPipeline` |
| `tools/lib/dspl/placeMetadata.js` | `../../../src/tools/slugify` | `../../../src/utils/text/slugify` |
| `tools/analysis/enhanced-hub-discovery.js` | `../src/tools/slugify` | `../src/utils/text/slugify` |

---

## Benefits of This Restructuring

### 1. **Semantic Clarity**
```
OLD: "What's in /src/tools?"
     [Mix of utilities, classifiers, pipelines, CLI tools, data files]
     
NEW: Clear separation by layer and responsibility
     /src/utils/       - Shared utilities
     /src/classifiers/ - Classification engines
     /src/analysis/    - Analysis infrastructure
     /tools/           - CLI operations
```

### 2. **Reduced Import Depth**
```javascript
// OLD: Deep relative paths
const { slugify } = require('../../../tools/slugify');

// NEW: Clearer structure
const { slugify } = require('../utils/text/slugify');
```

### 3. **Better Colocations**
```
BEFORE:
- Gap analyzers scattered in /src/services/
- Utilities scattered in /src/tools/
- Analysis engine hidden in /src/tools/

AFTER:
- All gap analyzers together in /src/services/
- All utilities organized in /src/utils/
- All analysis infrastructure in /src/analysis/
```

### 4. **Enables Future CLI Organization**
```
Current: /tools has mixed CLI tools scattered
         unclear which are development, which are data tools, which are utilities

Future:  /tools/dev/              - Development utilities (js-edit, db-schema)
         /tools/data/             - Data tools (export, import, backfill)
         /tools/maintenance/      - Maintenance operations
         /tools/analysis/         - Analysis tools
```

### 5. **Clearer Module Responsibilities**
```
OLD naming ambiguity:
  - placeHubDetector.js → is this a detector or a module with detectors?
  - analyse-pages-core.js → core of what?
  
NEW naming clarity:
  - PlaceHubClassifier.js → clearly classifies place hubs
  - AnalysisPipeline.js → clearly the analysis pipeline
```

### 6. **Test Organization**
```
OLD: Tests scattered with unclear structure
     /src/tools/__tests__/

NEW: Tests colocated with modules
     /src/utils/text/__tests__/
     /src/utils/reference-data/__tests__/
     /src/classifiers/__tests__/
     /src/analysis/engine/__tests__/
     /src/analysis/workers/__tests__/
```

---

## Migration Execution Strategy

### Recommended Approach: One Module At A Time

Rather than moving everything at once, migrate in logical chunks:

**Week 1: Core Utilities**
- Move `src/utils/text/slugify.js`
- Move `src/utils/reference-data/nonGeoTopicSlugs.js`
- Update all 11 importers
- Run tests
- Commit

**Week 2: Classifiers**
- Move `src/classifiers/PlaceHubClassifier.js`
- Update 3 importers
- Run tests
- Commit

**Week 3: Analysis Infrastructure**
- Move `src/analysis/engine/AnalysisPipeline.js`
- Move `src/analysis/workers/`
- Update 2 importers
- Run tests
- Commit

**Week 4: Cleanup**
- Move remaining CLI tools
- Update documentation
- Remove `/src/tools` directory
- Final full test suite

### Why This Approach?

✅ **Lower risk** — Each phase is independently testable  
✅ **Easy to rollback** — If something breaks, only revert last phase  
✅ **Clear validation** — Run tests after each move  
✅ **Good for code review** — Each PR is focused and manageable  
✅ **Maintains momentum** — Don't block on everything or nothing  

---

## Compatibility Considerations

### Re-exports for Backward Compatibility (Optional)

To avoid breaking external tools that import from `/tools` during migration:

```javascript
// File: src/tools/slugify.js (temporary compatibility layer)
// This file can exist during transition, then be removed

const { slugify, normalizeForMatching } = require('../utils/text/slugify');

console.warn('[DEPRECATION] src/tools/slugify.js - use ../utils/text/slugify instead');

module.exports = { slugify, normalizeForMatching };
```

This allows a smoother transition without breaking things immediately.

---

## Testing Strategy

### Phase 1: Unit Tests
```bash
npm test -- --testPathPattern="src/utils|src/classifiers|src/analysis"
```

### Phase 2: Integration Tests
```bash
npm test -- --testPathPattern="src/services|src/orchestration|src/background"
```

### Phase 3: Full Suite
```bash
npm test
```

### Phase 4: CLI Tool Tests
```bash
# Verify tools can still run
node tools/maintenance/analysis-maintenance-cycle.js --dry-run
```

---

## Rollback Plan

If issues arise during migration:

**Quick Rollback** (if committed):
```bash
git revert <commit-hash>
```

**Partial Rollback** (if mid-migration):
1. Restore `/src/tools/` directory from git
2. Revert import statements in partially-updated files
3. Run tests to confirm working state

---

## Documentation Updates Required

1. **AGENTS.md**
   - Update "How to Get a Database Handle" section
   - Update import examples
   - Update reference to `/src/tools`

2. **README.md**
   - Update any references to tool organization

3. **New documentation files**
   - `src/utils/README.md` — Explains shared utilities
   - `src/classifiers/README.md` — Explains classification engines
   - `src/analysis/README.md` — Explains analysis infrastructure

4. **CHANGE_PLAN.md**
   - Document this migration
   - List all updated files

---

## Estimated Effort

| Phase | Tasks | Time |
|-------|-------|------|
| 1 | Create directories | 15 min |
| 2 | Move utilities, extract helpers | 30 min |
| 3 | Move classifiers, update imports | 60 min |
| 4 | Move analysis infrastructure | 120 min |
| 5 | Update 14 importers (20+ statements) | 180 min |
| 6 | Update root CLI tools | 60 min |
| 7 | Move/keep CLI tools | 120 min |
| 8 | Testing, validation, cleanup | 60-120 min |
| **TOTAL** | | **9-10 hours** |

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Import path errors | Tests fail, app broken | Run tests after each phase |
| Missed import updates | Some modules broken | Use grep to verify all old paths removed |
| Circular dependencies | Build fails | Review require paths before migration |
| Tool breakage | CLI tools stop working | Test tools separately after moving |

---

## Alternative: Minimal Refactoring

If full restructuring is too aggressive, minimal alternative:

**Just rename the directory**:
```
src/tools/  →  src/lib/
```

**Benefits**: 
- ✅ Smaller change
- ✅ Clearer semantic meaning

**Drawbacks**:
- ❌ Still mixed organization
- ❌ Doesn't clarify responsibilities
- ❌ Doesn't enable future CLI organization

---

## Recommendation

**Implement the full restructuring** because:

1. **Current structure is ambiguous** — "tools" doesn't describe what's actually there
2. **Migration cost is low** — ~9-10 hours, doable in one week
3. **Long-term clarity is high** — Makes future development easier
4. **Enables future work** — Clears the way for organized CLI tools
5. **Follows best practices** — Separates concerns into logical layers

The investment now pays dividends in maintainability over time.

---

## Next Steps

1. **Review this proposal** with team
2. **Approve restructuring approach** (Full vs Minimal)
3. **Create feature branch**: `chore/restructure-src-tools`
4. **Execute Phase 1-2** (utilities and helpers)
5. **Get approval** from code review
6. **Continue with remaining phases**
7. **Merge when complete** with comprehensive commit message

