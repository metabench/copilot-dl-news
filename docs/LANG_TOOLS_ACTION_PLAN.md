# Lang-Tools Refactoring — Complete Action Plan

_Date: 2025-10-05_  
_Status: Ready for Implementation_  
_When to Read: Read this when working on language detection and tool integration features. This covers URL filtering, language detection, and multi-host language support. Cross-reference with LANG_TOOLS_PATTERNS.md for implementation patterns._  
_Combines: Individual pattern replacements + Architectural improvements_

This document provides a **complete, sequenced action plan** for improving code idiomaticity using lang-tools patterns, combining both micro-level replacements and macro-level architectural changes.

---

## Executive Summary

**Total Opportunities:** 231+ individual replacements + 6 architectural patterns

**Estimated Timeline:** 4-5 weeks (1 developer, part-time)

**Expected Benefits:**
- **Consistency**: Uniform patterns across all modules
- **Performance**: Single-pass transformations, reduced overhead
- **Maintainability**: DRY principles, schema-driven configuration
- **Readability**: ~200 lines saved, clearer intent

---

## Phase 1: Foundation (Week 1)

### Goal: Establish core utilities and pilot refactoring

### 1A: Create Core Utilities (2-3 days)

#### Utility 1: Data Transformation Pipelines
**File:** `src/utils/pipelines.js`

```javascript
const {is_defined, tof} = require('lang-tools');

/**
 * Compact: map + filter in one pass
 */
function compact(array, fn) {
  if (!Array.isArray(array)) return [];
  const result = [];
  for (let i = 0; i < array.length; i++) {
    const value = fn(array[i], i);
    if (value != null && value !== false) {
      result.push(value);
    }
  }
  return result;
}

/**
 * Pluck: extract nested property + filter nulls
 */
function pluck(array, path) {
  return compact(array, item => {
    const keys = String(path).split('.');
    let value = item;
    for (const key of keys) {
      if (!is_defined(value)) return null;
      value = value[key];
    }
    return value;
  });
}

/**
 * Pipeline builder for chained operations
 */
function pipeline(...fns) {
  return (value) => fns.reduce((acc, fn) => fn(acc), value);
}

module.exports = {compact, pluck, pipeline};
```

**Tests:** `src/utils/__tests__/pipelines.test.js`
- Test compact with various inputs
- Test pluck with nested paths
- Test pipeline composition
- Performance benchmark vs map().filter()

**Time:** 4 hours (implement + test)

---

#### Utility 2: Object Helpers
**File:** `src/utils/objectHelpers.js`

```javascript
const {is_defined, tof} = require('lang-tools');

/**
 * Safely get nested property using dot notation
 */
function getDeep(obj, path, fallback = undefined) {
  if (!is_defined(obj) || tof(obj) !== 'object') return fallback;
  
  const keys = path.split('.');
  let result = obj;
  
  for (const key of keys) {
    if (!is_defined(result) || tof(result) !== 'object') {
      return fallback;
    }
    result = result[key];
  }
  
  return is_defined(result) ? result : fallback;
}

/**
 * First defined value from multiple paths
 */
function firstDefined(obj, ...paths) {
  if (!is_defined(obj) || tof(obj) !== 'object') {
    if (is_defined(obj)) return obj;
    for (const path of paths) {
      if (is_defined(path)) return path;
    }
    return undefined;
  }

  for (const path of paths) {
    if (tof(path) === 'string') {
      const value = getDeep(obj, path);
      if (is_defined(value)) return value;
    } else if (is_defined(path)) {
      return path;
    }
  }
  return undefined;
}

/**
 * Coerce to number with fallback chain
 */
function numberOr(obj, ...paths) {
  const value = firstDefined(obj, ...paths);
  if (!is_defined(value)) return paths[paths.length - 1];
  const num = Number(value);
  return Number.isFinite(num) ? num : paths[paths.length - 1];
}

module.exports = {getDeep, firstDefined, numberOr};
```

**Tests:** `src/utils/__tests__/objectHelpers.test.js`

**Time:** 3 hours (implement + test)

---

### 1B: Pilot Refactoring — WikidataCountryIngestor.js (1 day)

**Apply both individual and architectural patterns:**

1. ✅ Import lang-tools: `{each, tof, is_array, is_defined}`
2. ✅ Replace 4 forEach → each()
3. ✅ Replace 3 typeof → tof()
4. ✅ Replace 6 Array.isArray → is_array()
5. ✅ Apply `compact()` to qid extraction (line 104)
6. ✅ Run all tests, verify no regressions
7. ✅ Document lessons learned

**Success Criteria:**
- All existing tests pass
- 13 pattern replacements complete
- At least 1 architectural pattern applied (compact)
- Git commit with clear message

**Time:** 4-6 hours

---

### 1C: Apply Pipelines to High-Impact Files (2 days)

**Target:** 26 files with `map().filter()` chains

**Priority files:**
1. `src/crawler/robots.js` (4 chains)
2. `src/tools/populate-gazetteer.js` (6 chains)
3. `src/crawler/IntelligentPlanRunner.js` (2 chains)
4. `src/crawler/ProblemClusteringService.js` (3 chains)

**Process per file:**
1. Import `{compact, pluck}` from `utils/pipelines`
2. Replace `map().filter()` chains
3. Run tests
4. Commit

**Time:** ~30 min per file = 3-4 hours for priority files

---

## Phase 2: Core Crawler & Database (Week 2)

### Goal: Refactor critical infrastructure with new patterns

### 2A: Remaining Gazetteer Modules (2 days)

**Files:**
- `OsmHttpClient.js` - 1 forEach
- `GazetteerPriorityScheduler.js` - 2 typeof, 1 Array.isArray
- `StagedGazetteerCoordinator.js` - 2 typeof, 2 Array.isArray
- `gazetteer.progress.js` - 1 forEach

**Apply:**
- Individual patterns (forEach → each, typeof → tof, etc.)
- Pipeline utilities where applicable

**Time:** 4 hours

---

### 2B: crawl.js Refactoring (3 days)

**Phase 2B.1: Individual Patterns (1 day)**
- 30+ typeof → tof()
- 7 Array.isArray → is_array()
- Multiple undefined checks → is_defined()

**Phase 2B.2: OptionsBuilder Schema (2 days)**

Create `src/utils/optionsBuilder.js` (see ARCHITECTURAL_PATTERNS.md)

Define schema:
```javascript
const CRAWL_OPTIONS_SCHEMA = {
  rateLimitMs: {
    type: 'number',
    default: (ctx) => ctx.slowMode ? 1000 : 0,
    nonNegative: true
  },
  maxDepth: {type: 'number', default: 3, min: 1},
  maxDownloads: {type: 'number', positive: true},
  maxAgeMs: {type: 'number', nonNegative: true},
  // ... 25 more options
};
```

Refactor constructor:
```javascript
constructor(startUrl, options = {}) {
  const builder = new OptionsBuilder(CRAWL_OPTIONS_SCHEMA);
  const opts = builder.build(options, {slowMode: options.slowMode});
  Object.assign(this, opts);
  // 35 lines → 3 lines!
}
```

**Tests:**
- Unit tests for OptionsBuilder
- Integration tests for crawl.js constructor
- Verify all existing crawl tests pass

**Time:** 2 days (1 day builder, 1 day integration)

---

### 2C: SQLiteNewsDatabase.js (1 day)

**Apply:**
- 6 typeof → tof()
- 6 null/undefined → is_defined()
- Apply `numberOr` for fallback chains

**Time:** 4-6 hours

---

## Phase 3: UI Components (Week 3)

### Goal: Complete UI consistency with new patterns

### 3A: SSE & Analysis Handlers (2 days)

**Files:**
- `sseHandlers.js` - Already uses each/tof, apply `firstDefined`/`numberOr`
- `analysisHandlers.js` - 30+ nullish chains → `numberOr()`
- `sseClient.js` - 2 forEach → each, enhance with middleware (optional)

**Example refactor:**
```javascript
// BEFORE
const processed = Number(progressInfo.processed ?? progressInfo.updated ?? progressInfo.analysed ?? 0);

// AFTER
const processed = numberOr(progressInfo, 'processed', 'updated', 'analysed', 0);
```

**Time:** 1 day

---

### 3B: State Management & Metrics (1 day)

**Files:**
- `state/reducers.js` - Apply `numberOr`, `firstDefined`
- `metricsView.js` - Apply pipeline utilities
- `jobsAndResumeManager.js` - Apply `numberOr`

**Time:** 4-6 hours

---

### 3C: Theme & Utilities (1 day)

**Files:**
- `themeController.js` - 2 forEach → each, 6 typeof → tof
- `crawlControls.js` - Apply patterns where applicable
- `advancedFeaturesPanel.js` - Clean up with lang-tools

**Time:** 4-6 hours

---

## Phase 4: Advanced Patterns (Week 4)

### Goal: Implement advanced architectural patterns

### 4A: Attribute Builder (1 day)

**Create:** `src/crawler/gazetteer/AttributeBuilder.js`

**Refactor:** All gazetteer ingestors to use fluent API

```javascript
// BEFORE: 32 lines of repetitive conditionals
const attributes = [];
if (population != null) {
  attributes.push({ attr: 'population', value: population, metadata: { property: 'P1082' } });
}
// ... 8 more

// AFTER: 8 lines, chainable
const attributes = new AttributeBuilder()
  .wikidata('population', population, 'P1082')
  .wikidata('area_sq_km', area, 'P2046')
  // ... rest
  .build();
```

**Time:** 1 day (implement + refactor 3-5 ingestors)

---

### 4B: Configuration Schema Migration (2 days)

**Extend OptionsBuilder to:**
- `buildArgs.js` - Extract schema, use builder
- `ConfigManager.js` - Apply schema pattern
- Other option-heavy modules

**Time:** 2 days

---

### 4C: Documentation & Final Cleanup (1 day)

**Tasks:**
1. Update RUNBOOK with new patterns
2. Create migration guide for new developers
3. Document all new utilities in JSDoc
4. Run full test suite, verify 100% pass
5. Performance benchmarks (before/after)
6. Create PR with comprehensive summary

**Time:** 1 day

---

## Phase 5: Optional Enhancements (Week 5)

### 5A: Result Type (Optional)

Implement Result type for error handling consistency (see ARCHITECTURAL_PATTERNS.md)

**Time:** 1-2 days if pursued

---

### 5B: SSE Middleware Enhancement (Optional)

Add middleware pattern to SSE client for better composability

**Time:** 1 day if pursued

---

## Testing Strategy (Throughout All Phases)

### Per-File Checklist
- [ ] Import lang-tools utilities
- [ ] Apply individual patterns (forEach, typeof, etc.)
- [ ] Apply architectural patterns where applicable
- [ ] Run file-specific tests → all pass
- [ ] Run related integration tests → all pass
- [ ] Git commit with clear message
- [ ] Update tracking doc

### Phase-Level Testing
- [ ] Run full test suite
- [ ] Check coverage hasn't decreased
- [ ] Verify no performance regressions
- [ ] Review git diff for unintended changes

### Continuous Integration
- Run tests on every commit
- Automated pattern detection (future: ESLint rules)
- Performance benchmarks on key operations

---

## Success Metrics

### Code Quality
- **Consistency Score:** Target 80%+ lang-tools adoption
  - Gazetteer: 30% → 90%
  - Core crawler: 20% → 85%
  - UI: 50% → 90%

### Quantitative
- Lines of code: Reduce ~200-300 lines
- Individual replacements: 231 complete
- Architectural patterns: 4-6 implemented
- Test pass rate: Maintain 100%

### Qualitative
- Easier onboarding (single pattern set)
- Faster code reviews (familiar patterns)
- Fewer null pointer bugs (is_defined everywhere)

---

## Risk Management

### Risk 1: Breaking Changes
**Mitigation:**
- Test after every file
- Small commits (1 file per commit)
- Git branches allow easy rollback

### Risk 2: Performance Regressions
**Mitigation:**
- Benchmark pipeline utilities vs native
- Profile hot paths (crawl loop, SSE handlers)
- Revert if >5% performance loss

### Risk 3: Incomplete Migration
**Mitigation:**
- Phase-based approach ensures progress
- Document "Phase N complete" milestones
- Track remaining files in backlog

### Risk 4: Team Adoption
**Mitigation:**
- Clear documentation (this plan)
- Examples for every pattern
- Code review enforcement

---

## Tracking & Reporting

### Weekly Status Report Template

```markdown
## Week N Status

### Completed
- Phase X: [list files refactored]
- [Individual patterns applied count]
- [Architectural patterns implemented]

### In Progress
- [Current file/module]
- [Blockers if any]

### Next Week
- [Planned files/modules]
- [Expected completions]

### Metrics
- Consistency score: X%
- Tests passing: X/X
- Lines saved: ~X
```

---

## Resources

### Documentation
- `LANG_TOOLS_AUDIT.md` - Individual pattern catalog
- `LANG_TOOLS_ARCHITECTURAL_PATTERNS.md` - Higher-order patterns
- `LANG_TOOLS_REFACTOR_EXAMPLE.md` - Detailed walkthrough
- `LANG_TOOLS_PATTERNS.md` - Original pattern guide

### Tools
- `tools/scan-lang-tools-patterns.js` - Pattern detection
- Jest test suite - Regression detection
- Git - Version control and rollback

### Support
- This action plan
- Code examples in docs/
- Team code reviews

---

## Final Checklist (All Phases Complete)

- [ ] All 231+ individual patterns replaced
- [ ] 4-6 architectural patterns implemented
- [ ] All tests passing (100% maintained)
- [ ] Documentation updated (RUNBOOK, README)
- [ ] Performance benchmarks complete (no regressions)
- [ ] Code review and team approval
- [ ] Merge to main branch
- [ ] Update project standards/guidelines

---

## Conclusion

This action plan combines **micro-level pattern replacements** (forEach, typeof, etc.) with **macro-level architectural improvements** (pipelines, builders, schemas) for a comprehensive refactoring that improves:

1. **Consistency** - Single idiomatic pattern set
2. **Performance** - Single-pass operations, reduced overhead
3. **Maintainability** - DRY principles, clear intent
4. **Testability** - Pure functions, schema-driven logic

The phased approach ensures **incremental progress** with **low risk** and **measurable outcomes** at each stage.

**Estimated Total Time:** 4-5 weeks (part-time, 1 developer)

**Next Step:** Review Phase 1 plan with team, approve utilities, begin pilot refactoring.

---

**Prepared by:** GitHub Copilot Agent  
**Date:** 2025-10-05  
**Status:** Ready for team review and Phase 1 kickoff
