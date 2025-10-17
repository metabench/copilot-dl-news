# Intelligent Crawl Output Limiting & Startup Analysis

**When to Read**: When analyzing intelligent crawl startup behavior, optimizing initial output density, or iteratively improving crawl initialization reporting. This workflow is for rapid development and debugging of the crawl startup phase (first 100 lines of output).

**Status**: Active Workflow (October 2025)  
**Purpose**: Enable rapid iteration on dense, informative startup output for intelligent crawls  
**Tools**: `node tools/intelligent-crawl.js --limit N`, startup analysis patterns

---

## Overview

The intelligent crawl script now supports `--limit N` to display only the first N lines of output, making it easy to:

1. **Analyze startup phase** - See what information is available at initialization
2. **Iterate on output density** - Maximize useful information in first 100 lines
3. **Debug initialization** - Quickly verify data loading and validation
4. **Optimize reporting** - Design concise, high-value startup summaries

This enables a **rapid iteration workflow** where you can repeatedly test startup behavior in seconds rather than minutes.

---

## Command Line Usage

### Basic Syntax

```bash
# Limit to first 100 lines (recommended for startup analysis)
node tools/intelligent-crawl.js --limit 100

# Limit to first 50 lines (quick check)
node tools/intelligent-crawl.js --limit 50

# Limit to first 200 lines (extended analysis)
node tools/intelligent-crawl.js --limit 200

# Custom URL with limit
node tools/intelligent-crawl.js https://www.bbc.com --limit 100

# Full output (no limit)
node tools/intelligent-crawl.js

# Verbose mode (all structured output, no limit)
node tools/intelligent-crawl.js --verbose
```

### Parameter Validation

- `--limit` must be followed by a positive integer
- If invalid, script exits with error message
- When limit is reached, displays message and continues crawling in background
- Line counting only applies to visible output (filtered structured events don't count)

---

## Rapid Iteration Workflow

### Phase 1: Baseline Assessment (First Run)

**Goal**: Understand current startup output

```bash
# Capture first 100 lines
node tools/intelligent-crawl.js --limit 100 > startup_baseline.txt

# Review what's shown
cat startup_baseline.txt
```

**Questions to ask**:
- ✅ Is database size reported?
- ✅ Are place names loaded and counted?
- ✅ Are topic keywords loaded and counted?
- ✅ Is configuration shown (concurrency, depth, features)?
- ✅ Are missing country hubs identified?
- ✅ Is intelligent plan summary clear?
- ❓ What's missing that would be valuable?

### Phase 2: Identify Missing Information

**Critical startup information** that should be in first 100 lines:

1. **Database Status**
   - ✅ Database size (12.71 GB)
   - ✅ Article count (44,892 articles)
   - ❓ Place count (how many places in gazetteer?)
   - ❓ Hub coverage (what % of country hubs do we have?)

2. **Gazetteer Status**
   - ✅ Place names loaded (10,871 names)
   - ❓ Country hub candidates (how many countries?)
   - ❓ Missing country hubs (which countries need crawling?)
   - ❓ Cached vs missing ratio (X cached, Y missing from Z total)

3. **Topic Coverage**
   - ✅ Topic keywords loaded (73 terms)
   - ❓ Topic categories (which 13 categories?)
   - ❓ Multi-lingual status (languages available?)

4. **Configuration**
   - ✅ Enhanced features status
   - ✅ Priority config loaded
   - ❓ Advanced planning suite status
   - ❓ Crawl budget (maxDownloads, maxDepth)

5. **Intelligent Plan Preview**
   - ✅ Hub count seeded (46 hubs)
   - ❓ Hub breakdown (X place hubs, Y topic hubs)
   - ❓ Prioritization rationale (why these hubs?)
   - ❓ Coverage prediction (estimated % gain)

### Phase 3: Add Dense Startup Summary

**Target format** (single-line summaries for rapid scanning):

```bash
Loaded 10871 place names for verification
Loaded 73 topic keywords for verification (13 categories: politics, sport, business, ...)
Crawling https://www.theguardian.com (intelligent, single-threaded)
SQLite DB initialized at: C:\...\news.db
Database size: 12.71 GB — stored pages: 45,290, articles: 44,892, places: 248 (185 countries)
Country hub coverage: 123/185 cached (66.5%), 62 missing [Australia, Canada, France, Germany, ...]
Topic hub coverage: 8/13 categories cached (sport, politics, culture, ...)
Priority config loaded from C:\...\config\priority-config.json
Enhanced features: advancedPlanningSuite=true, gapDriven=true, problemResolution=true
Intelligent plan: seeded 46 hubs (28 place, 18 topic) — predicted 15% coverage gain
```

**Implementation pattern**:
```javascript
// Before starting crawl, print comprehensive startup summary
console.log('\n=== Intelligent Crawl Startup Summary ===');

// Database stats (single line)
const placeCount = db.prepare('SELECT COUNT(*) as count FROM places').get().count;
const countryCount = db.prepare('SELECT COUNT(*) as count FROM places WHERE kind="country"').get().count;
console.log(`Database: ${dbSizeMB} MB | ${articleCount} articles | ${placeCount} places (${countryCount} countries)`);

// Country hub analysis (single line with inline list)
const countryCandidates = getAllCountries(db);
const cachedHubs = countryCandidates.filter(c => isCached(c));
const missingHubs = countryCandidates.filter(c => !isCached(c));
const missingNames = missingHubs.slice(0, 10).map(h => h.name).join(', ');
const moreSuffix = missingHubs.length > 10 ? `, +${missingHubs.length - 10} more` : '';
console.log(`Country hubs: ${cachedHubs.length}/${countryCandidates.length} cached (${pct}%), ${missingHubs.length} missing [${missingNames}${moreSuffix}]`);

// Topic coverage (single line)
const topicCategories = getTopicCategories(db, 'en');
const cachedTopics = topicCategories.filter(t => isCachedTopic(t));
console.log(`Topic hubs: ${cachedTopics.length}/${topicCategories.length} categories cached (${cachedTopics.join(', ')})`);

// Features (single line)
const featuresList = Object.entries(config.features).filter(([k,v]) => v).map(([k,v]) => k).join(', ');
console.log(`Features enabled: ${featuresList}`);

// Intelligent plan preview (single line)
console.log(`Intelligent plan preview: ${placeHubCount} place hubs + ${topicHubCount} topic hubs = ${totalCount} seeds`);

console.log('=== End Startup Summary ===\n');
```

### Phase 4: Test and Refine

**Iteration cycle** (30 seconds per iteration):

```bash
# 1. Make changes to startup reporting code
# 2. Test with limit
node tools/intelligent-crawl.js --limit 100

# 3. Verify improvements (should see new summary lines)
# 4. Adjust format, add missing data
# 5. Repeat until first 100 lines are information-dense
```

**Success criteria**:
- ✅ All critical status information in first 100 lines
- ✅ Single-line summaries (no multi-line tables)
- ✅ Inline lists for missing items (comma-separated, +N more)
- ✅ Percentages and ratios for quick scanning
- ✅ Color-coded for visual hierarchy
- ✅ Total startup summary fits in 15-20 lines
- ✅ Operator can assess crawl health in <10 seconds

---

## Output Line Counting Behavior

### What Counts as a Line

- ✅ Visible console.log output
- ✅ Error messages
- ✅ Warnings
- ✅ Colored output (place hubs, topic hubs, etc.)

### What Doesn't Count

- ❌ Filtered structured output (QUEUE, MILESTONE, TELEMETRY, PROGRESS, PROBLEM)
- ❌ Duplicate messages
- ❌ Robots.txt disallow messages
- ❌ Verbose JSON output (when not in verbose mode)

### Limit Reached Behavior

When output limit is reached:

```
[Output limit of 100 lines reached - crawl continues in background]
[Use --verbose to see all output, or increase --limit]
```

- Crawl **continues running** in background
- No more output displayed to terminal
- Final summary (hubs discovered) still shown at completion
- Exit code reflects actual crawl result (0=success, 1=failure)

---

## Advanced Startup Analysis

### Database Query Patterns for Startup

**Single-line aggregations**:

```javascript
// Places summary
const stats = db.prepare(`
  SELECT 
    COUNT(*) as total,
    SUM(CASE WHEN kind='country' THEN 1 ELSE 0 END) as countries,
    SUM(CASE WHEN kind='adm1' THEN 1 ELSE 0 END) as adm1,
    SUM(CASE WHEN kind='city' THEN 1 ELSE 0 END) as cities
  FROM places
`).get();
console.log(`Places: ${stats.total} (${stats.countries} countries, ${stats.adm1} regions, ${stats.cities} cities)`);

// Article freshness
const freshness = db.prepare(`
  SELECT 
    COUNT(*) as total,
    SUM(CASE WHEN created_at > strftime('%s', 'now', '-7 days') THEN 1 ELSE 0 END) as last_7d,
    SUM(CASE WHEN created_at > strftime('%s', 'now', '-30 days') THEN 1 ELSE 0 END) as last_30d
  FROM articles
`).get();
console.log(`Articles: ${freshness.total} total (${freshness.last_7d} last 7 days, ${freshness.last_30d} last 30 days)`);

// Topic coverage
const topicStats = db.prepare(`
  SELECT 
    topic,
    COUNT(DISTINCT normalized) as term_count
  FROM topic_keywords
  WHERE lang = 'en'
  GROUP BY topic
  ORDER BY term_count DESC
`).all();
const topicSummary = topicStats.map(t => `${t.topic}(${t.term_count})`).join(', ');
console.log(`Topic keywords: ${topicStats.length} categories — ${topicSummary}`);
```

### Place Hub Gap Analysis

**Identify missing country hubs**:

```javascript
const { getAllCountryPlaces } = require('./src/db/sqlite/queries/gazetteer.queries');
const { getCachedArticle } = require('./src/crawler/IntelligentPlanRunner');

const countries = getAllCountryPlaces(db);
const hubPatterns = [
  (country) => `https://www.theguardian.com/${country.slug}`,
  (country) => `https://www.bbc.com/news/world/${country.slug}`,
  (country) => `https://www.cnn.com/world/${country.slug}`
];

const missing = [];
for (const country of countries) {
  const hubUrl = hubPatterns[0](country); // Check primary pattern
  const cached = getCachedArticle(normalizeUrl(hubUrl));
  if (!cached) {
    missing.push(country.name);
  }
}

// Single-line summary
const missingList = missing.slice(0, 15).join(', ');
const moreSuffix = missing.length > 15 ? ` +${missing.length - 15} more` : '';
console.log(`Missing country hubs (${missing.length}/${countries.length}): ${missingList}${moreSuffix}`);
```

### Feature Status Matrix

**Concise feature summary**:

```javascript
const features = config.features;
const enabledFeatures = Object.entries(features)
  .filter(([key, value]) => value === true)
  .map(([key]) => {
    // Use abbreviations for known features
    const abbrev = {
      advancedPlanningSuite: 'APS',
      gapDrivenPrioritization: 'GDP',
      plannerKnowledgeReuse: 'PKR',
      realTimeCoverageAnalytics: 'RTCA',
      problemClustering: 'PC',
      problemResolution: 'PR'
    };
    return abbrev[key] || key;
  });

console.log(`Features (${enabledFeatures.length} enabled): ${enabledFeatures.join(', ')}`);
```

---

## Integration with IntelligentPlanRunner

### Startup Telemetry Events

The intelligent crawl startup should emit structured telemetry for UI monitoring:

```javascript
// Emit startup summary as milestone
telemetry.milestone({
  kind: 'startup-summary',
  message: 'Intelligent crawl initialized',
  details: {
    database: {
      size_mb: dbSizeMB,
      articles: articleCount,
      places: placeCount,
      countries: countryCount
    },
    gazetteer: {
      place_names: placeNames.size,
      country_candidates: countryCandidates.length,
      cached_hubs: cachedHubs.length,
      missing_hubs: missingHubs.length,
      missing_list: missingHubs.slice(0, 20).map(h => h.name)
    },
    topics: {
      term_count: newsTopics.size,
      category_count: topicCategories.length,
      cached_topics: cachedTopics.length
    },
    features: enabledFeatures,
    plan_preview: {
      place_hubs: placeHubCount,
      topic_hubs: topicHubCount,
      total_seeds: totalCount,
      predicted_coverage_gain: predictedGain
    }
  }
});
```

### CLI Output Format vs Telemetry

**CLI format**: Human-readable, single-line summaries
```
Country hubs: 123/185 cached (66.5%), 62 missing [Australia, Canada, ...]
```

**Telemetry format**: Structured, queryable data
```json
{
  "kind": "startup-summary",
  "details": {
    "gazetteer": {
      "cached_hubs": 123,
      "total_candidates": 185,
      "coverage_pct": 66.5,
      "missing_hubs": 62,
      "missing_list": ["Australia", "Canada", "France", ...]
    }
  }
}
```

---

## Comparison: Before vs After

### Before (Verbose, Scattered)

```
Loaded 10871 place names for verification
Loaded 73 topic keywords for verification
Crawling https://www.theguardian.com (intelligent, single-threaded)
[schema] ✗ Failed to initialize Gazetteer: no such column: wikidata_qid
SQLite DB initialized at: C:\Users\james\Documents\repos\copilot-dl-news\data\news.db
Database size: 12.71 GB — stored pages: 45290, articles detected: 44892
Priority config loaded from C:\Users\james\Documents\repos\copilot-dl-news\config\priority-config.json
Enhanced features configuration: {
  advancedPlanningSuite: false,
  gapDrivenPrioritization: false,
  plannerKnowledgeReuse: true,
  realTimeCoverageAnalytics: true,
  problemClustering: true,
  problemResolution: true,
  costAwarePriority: false,
  patternDiscovery: false,
  adaptiveBranching: false,
  realTimePlanAdjustment: false,
  dynamicReplanning: false,
  crossDomainSharing: false
}
... (many lines later)
Intelligent plan: seeded 46 hub(s)
```

**Problems**:
- Multi-line JSON (13 lines for features)
- No country hub gap analysis
- No topic category breakdown
- No coverage prediction
- Feature names not abbreviated
- Critical info scattered across 50+ lines

### After (Dense, Informative)

```
=== Intelligent Crawl Startup Summary ===
Database: 12.71 GB | 44,892 articles | 248 places (185 countries, 45 regions, 18 cities)
Article freshness: 2,341 last 7d, 8,923 last 30d (19.9% recent)
Place names: 10,871 gazetteer entries loaded for hub validation
Topic keywords: 73 terms in 13 categories (sport:9, culture:12, lifestyle:8, politics:5, ...)
Country hubs: 123/185 cached (66.5%), 62 missing [Australia, Canada, France, Germany, India, Japan, Mexico, Russia, South Africa, Spain, +52 more]
Topic hubs: 8/13 categories cached (sport, politics, culture, business, technology, science, environment, opinion)
Priority config: C:\...\priority-config.json (last updated 2025-09-28)
Features enabled (7): APS, GDP, PKR, RTCA, PC, PR, probResol
Crawl budget: maxDownloads=100, maxDepth=2, concurrency=2, cache=24h
Intelligent plan preview: 28 place hubs + 18 topic hubs = 46 seeds → predicted 15% coverage gain
=== End Startup Summary ===

Crawling https://www.theguardian.com (intelligent, single-threaded)
...
```

**Benefits**:
- ✅ All critical info in 12 lines (vs 50+)
- ✅ Single-line summaries scannable in seconds
- ✅ Missing hub gap analysis (62 missing, names listed)
- ✅ Topic category breakdown
- ✅ Coverage prediction (15% gain)
- ✅ Abbreviated feature names (APS, GDP, etc.)
- ✅ Article freshness statistics
- ✅ Crawl budget visible upfront

---

## Workflow Best Practices

### Do's ✅

- ✅ Use `--limit 100` for rapid startup iteration
- ✅ Make startup summary fit in 15-20 lines
- ✅ Use single-line summaries with inline lists
- ✅ Show percentages and ratios for quick assessment
- ✅ List missing items (truncated with +N more)
- ✅ Use abbreviations for feature names
- ✅ Color-code output (green=success, yellow=cache, red=error, blue=planning)
- ✅ Test changes in <30 seconds per iteration
- ✅ Emit structured telemetry alongside CLI output

### Don'ts ❌

- ❌ Multi-line JSON in startup (use single-line summaries)
- ❌ Listing all 185 countries (truncate with +N more)
- ❌ Scattered information across 100+ lines
- ❌ Running full crawl to test startup changes
- ❌ Omitting critical gap analysis (missing hubs)
- ❌ Showing internal IDs or technical details
- ❌ Using full feature names (use abbreviations)
- ❌ Hiding coverage predictions

---

## Future Enhancements

### Planned Improvements

1. **Startup Dashboard** (Terminal UI)
   - Box-drawing characters for visual structure
   - Progress bars for coverage percentages
   - Color-coded status indicators
   - Real-time updates during initialization

2. **Comparative Analysis**
   - Show delta since last crawl
   - Highlight new missing hubs
   - Track coverage improvement over time

3. **Recommendation Engine**
   - Suggest next crawl targets based on gaps
   - Prioritize high-value missing hubs
   - Estimate time-to-complete for gap filling

4. **Export Startup Report**
   - `--export-startup startup.json` flag
   - Structured JSON for automated analysis
   - Historical startup comparison

---

## Related Documentation

- **AGENTS.md** → Section: "Intelligent Crawl Startup Analysis" (workflow index)
- **RUNBOOK.md** → Section: "Intelligent Crawl Operations" (production usage)
- **HIERARCHICAL_PLANNING_INTEGRATION.md** → Country hub discovery patterns
- **GEOGRAPHY_CRAWL_TYPE.md** → Place hub validation logic
- **ENHANCED_FEATURES.md** → Feature flag descriptions

---

**Last Updated**: October 14, 2025  
**Maintainer**: Development Team  
**Status**: Active Workflow - In Production Use
