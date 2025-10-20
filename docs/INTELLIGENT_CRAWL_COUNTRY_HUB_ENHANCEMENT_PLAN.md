# Intelligent Crawl Country Hub Enhancement Plan

## Overview

This document outlines the plan to enhance the intelligent crawl system to prioritize country hub discovery and ensure their article links are processed by default. The goal is to improve geographic coverage by making country hub discovery and utilization the default behavior of intelligent crawls.

## Total Prioritisation Mode

A special "Total Prioritisation" mode has been implemented to maximize country hub discovery and article processing priority. This mode is particularly useful for testing and scenarios where country hub coverage is the primary objective.

### Configuration

Enable Total Prioritisation mode in `config/priority-config.json`:

```json
{
  "features": {
    "totalPrioritisation": true
  },
  "queue": {
    "bonuses": {
      "country-hub-discovery": {
        "value": 35,
        "totalPrioritisationValue": 100,
        "description": "Country hub pages predicted by gazetteer-aware reasoning"
      },
      "country-hub-article": {
        "value": 25,
        "totalPrioritisationValue": 90,
        "description": "Article links discovered on country hub pages"
      }
    }
  }
}
```

### Behavior in Total Prioritisation Mode

- **Country Hub Discovery**: Priority set to 100 (maximum)
- **Article Links from Country Hubs**: Priority set to 90 (near maximum)
- **Queue Ordering**: Country hubs and their articles are processed first
- **Coverage Focus**: All other URLs are deprioritized to ensure country hub completion

### Use Cases

- **Testing**: Validate country hub discovery algorithms
- **Focused Crawls**: When geographic coverage is the primary goal
- **Gap Analysis**: Quickly identify and fill country coverage gaps
- **Benchmarking**: Establish baseline performance for country hub discovery

### Implementation Details

The mode modifies priority calculation in:
- `GazetteerAwareReasonerPlugin._calculatePriority()`: Returns 100 when enabled
- `PageExecutionService` hub-only flow: records article URLs discovered on hubs while skipping direct article enqueues when exclusive hub mode is active
- `CrawlerState` country hub tracking: maintains discovered, validated, and indexed URL counts for progress reporting

### Exclusive Country Hub Mode (October 2025)

`NewsCrawler` now exposes a `countryHubExclusiveMode` toggle (also implied by `exhaustiveCountryHubMode` or `priorityMode: "country-hubs-only"`). When enabled:

- `PageExecutionService` operates in **hub-only mode**, queuing hub pagination and structural links but **not** scheduling article pages directly
- Article URLs discovered on hub pages are recorded via `CrawlerState.recordCountryHubLinks()` for behavioral analytics instead of immediate fetch
- `CountryHubBehavioralProfile.updateProgress()` receives live progress (`discovered`, `validated`, `articleUrls`) sourced from `CrawlerState.getCountryHubProgress()`
- `structureOnly` is auto-enabled unless explicitly overridden, ensuring the crawl stays focused on hub structure verification

Use this mode when you must *only* map and validate hubs (e.g., pre-flight coverage audits) without downloading articles.

#### CLI Usage

The intelligent crawl helper opts into this flow automatically:

```bash
node tools/intelligent-crawl.js --limit 100
```

Key options passed to `NewsCrawler`:

```javascript
countryHubBehavioralProfile: true,
exhaustiveCountryHubMode: true,
countryHubExclusiveMode: true,
priorityMode: 'country-hubs-only',
structureOnly: true // enforced unless manually overridden
```

If you need to re-enable article fetching for comparison, launch the tool with `--verbose` and edit the invocation to set `countryHubExclusiveMode: false` or `structureOnly: false`.

## Current System Analysis

The intelligent crawl system currently has:
- **GazetteerAwareReasonerPlugin**: Predicts country hub URLs using gazetteer data
- **CountryHubGapService**: Analyzes coverage gaps and learns URL patterns
- **Priority System**: Uses bonuses for different URL types (adaptive-seed: 20, gap-prediction: 15)
- **Proposal Flow**: Plugin → blackboard → crawl orchestration → queue with priority bonuses

**Current Issues**:
- Country hub priorities may not be high enough to compete with other URLs
- Article links from discovered country hubs may not be prioritized
- No default emphasis on country hub discovery in intelligent crawls

## Enhancement Plan

### 1. Priority System Enhancement

**Goal**: Give country hub URLs the highest priority to ensure early discovery.

**Changes to `config/priority-config.json`**:
```json
{
  "queue": {
    "bonuses": {
      "country-hub-discovery": {
        "value": 35,
        "description": "Country hub pages predicted by gazetteer-aware reasoning",
        "category": "intelligent"
      },
      "country-hub-article": {
        "value": 25,
        "description": "Article links discovered on country hub pages",
        "category": "intelligent"
      }
    }
  }
}
```

### 2. GazetteerAwareReasonerPlugin Enhancement

**Goal**: Make country hub prediction more aggressive and confident.

**Key Changes**:
- Use new `country-hub-discovery` bonus instead of importance-based priority
- Add metadata: `isCountryHub: true, countryCode, countryName`
- Increase confidence scores for top countries
- Limit to top 50 countries to prevent queue overload

**Modified `_calculatePriority()` method**:
```javascript
_calculatePriority(country) {
  // Use high fixed priority for country hubs instead of importance-based calculation
  return 35; // Uses country-hub-discovery bonus
}
```

### 3. Article Link Processing Enhancement

**Goal**: Ensure article links from country hub pages are prioritized.

**Implementation**:
- Detect country hub pages by URL pattern matching (`/world/*`, `/news/world/*`)
- Apply `country-hub-article` bonus (25) to links from these pages
- Track source hub in queue metadata

### 4. Gap-Driven Prioritization

**Goal**: Use coverage gap analysis to prioritize missing countries.

**Integration**:
- Query CountryHubGapService for missing high-importance countries
- Boost priority for countries that fill significant gaps
- Use learned patterns from successful discoveries

### 5. Reliability and Performance

**Features**:
- Retry logic with exponential backoff for failed attempts
- Circuit breaker for domains with persistent failures
- Telemetry for success rate tracking
- Queue overload protection (max 50 country predictions)

## Implementation Steps

### Step 1: Update Priority Configuration

**File**: `config/priority-config.json`

Add the new priority bonuses to enable country hub prioritization:

```json
"bonuses": {
  "country-hub-discovery": {
    "value": 35,
    "description": "Country hub pages predicted by gazetteer-aware reasoning",
    "category": "intelligent"
  },
  "country-hub-article": {
    "value": 25,
    "description": "Article links discovered on country hub pages",
    "category": "intelligent"
  }
}
```

### Step 2: Enhance GazetteerAwareReasonerPlugin

**File**: `src/planner/plugins/GazetteerAwareReasonerPlugin.js`

**Modify proposal creation**:
```javascript
proposals.push({
  url: hubUrl,
  source: 'gazetteer-aware-reasoner',
  kind: 'country',
  countryCode: country.code,
  countryName: country.name,
  confidence: this._calculateConfidence(country, domain),
  reason: `Predicted country hub for ${country.name} based on gazetteer`,
  estimatedDiscoveriesPerHub: 50,
  priority: this._calculatePriority(country),
  isCountryHub: true  // New metadata
});
```

**Update priority calculation**:
```javascript
_calculatePriority(country) {
  // Use high fixed priority for country hubs
  return 35; // Corresponds to country-hub-discovery bonus
}
```

**Limit country predictions**:
```javascript
// In _loadTopCountries, limit to top 50
LIMIT 50
```

### Step 3: Implement Article Link Processing

**Location**: Queue event processing logic (likely in CrawlOrchestrationService or JobEventHandlerService)

**Add country hub detection**:
```javascript
function isCountryHubPage(url) {
  // Detect country hub URLs
  return url.match(/\/world\/[^\/]+$/) ||
         url.match(/\/news\/world\/[^\/]+$/) ||
         url.match(/\/international\/[^\/]+$/);
}
```

**Apply article bonus**:
```javascript
if (isCountryHubPage(sourceUrl)) {
  priorityBonus = 25; // country-hub-article bonus
  metadata.sourceHub = sourceUrl;
}
```

### Step 4: Integrate Gap Analysis

**File**: `src/planner/plugins/GazetteerAwareReasonerPlugin.js`

**Add gap analysis integration**:
```javascript
// Query gap service for missing countries
const gapAnalysis = this.countryHubGapService?.analyzeCountryHubGaps(jobId);

// Boost priority for missing high-importance countries
if (gapAnalysis?.missingCountries?.includes(country.name)) {
  priority += 10; // Additional boost for gap-filling
}
```

### Step 5: Add Reliability Features

**Retry logic in queue processing**:
```javascript
// Add retry metadata for failed country hub attempts
if (isCountryHub && failed) {
  retryCount = (retryCount || 0) + 1;
  if (retryCount < 3) {
    priority = Math.max(10, priority - 5); // Reduce priority for retries
    requeueWithDelay(url, priority, retryCount);
  }
}
```

## Testing Protocol

### Baseline Test
Run intelligent crawl without enhancements:
```bash
node tools/intelligent-crawl.js --max-downloads 1000 --verbose
```
Record: country hubs discovered, order of discovery, article processing metrics.

### Enhanced Test
Apply enhancements and run identical crawl:
```bash
node tools/intelligent-crawl.js --max-downloads 1000 --verbose
```
Compare: discovery order, coverage metrics, article processing.

### Validation Checks
1. **Priority Verification**: Country hubs in top 10% of crawled URLs
2. **Coverage Metrics**: ≥80% of top 20 countries discovered
3. **Article Processing**: Links from country hubs prioritized
4. **Performance**: No degradation in crawl speed
5. **Reliability**: No queue overload or system hangs

## Success Criteria

- **Discovery Priority**: Country hubs discovered within first 50 URLs crawled
- **Coverage Target**: ≥80% of top 20 countries (US, UK, China, India, Germany, France, Japan, Canada, Australia, Brazil, Russia, Italy, Spain, Mexico, South Korea, Netherlands, Switzerland, Sweden, Belgium, Austria) have hub pages discovered
- **Article Processing**: Article links from country hubs processed with high priority (in top 25% of queue)
- **Performance**: No significant degradation in crawl throughput
- **Reliability**: System handles failures gracefully without getting stuck

## Rollback Plan

If issues arise, disable enhancements by:
1. Remove new priority bonuses from `config/priority-config.json`
2. Revert `_calculatePriority()` to importance-based calculation
3. Disable article link special processing
4. Restore original country prediction limits

## Monitoring and Telemetry

Track these events for monitoring:
- `country-hub-discovered`: Successful country hub finding
- `country-hub-articles-queued`: Article links prioritized
- `country-hub-gap-filled`: Coverage improvement achieved
- `country-hub-failure`: Failed attempts with retry logic

## Configuration

Make enhancements configurable via `config/priority-config.json`:
```json
"features": {
  "countryHubPrioritization": true,
  "countryHubArticleProcessing": true,
  "gapDrivenPrioritization": true
}
```

## Future Enhancements

- **Pattern Learning**: Automatically learn domain-specific country hub patterns
- **Adaptive Prioritization**: Adjust priorities based on success rates
- **Multi-language Support**: Extend to non-English news websites
- **Cross-domain Learning**: Share learned patterns across different news domains

## Implementation Timeline

1. **Phase 1**: Priority configuration changes (1-2 hours)
2. **Phase 2**: Plugin priority logic updates (2-3 hours)
3. **Phase 3**: Article link processing (3-4 hours)
4. **Phase 4**: Gap analysis integration (2-3 hours)
5. **Phase 5**: Testing and validation (4-6 hours)

Total estimated time: 12-18 hours

## Risk Assessment

- **Low Risk**: Priority config changes - isolated, easily revertible
- **Medium Risk**: Plugin changes - affects planning logic
- **High Risk**: Article processing changes - affects queue behavior
- **Mitigation**: Feature flags, comprehensive testing, rollback plan

This enhancement will make country hub discovery and utilization the default behavior of intelligent crawls, significantly improving geographic coverage and content discovery effectiveness.