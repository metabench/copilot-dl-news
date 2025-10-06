# Lang-Tools Architectural Patterns — Higher-Order Idioms

_Date: 2025-10-05_  
_Focus: Beyond individual replacements—architectural patterns for idiomatic code_

This document identifies **larger architectural patterns** that could make the codebase more idiomatic and maintainable, beyond the individual `forEach`/`typeof` replacements covered in `LANG_TOOLS_AUDIT.md`.

---

## 1. Data Transformation Pipelines (★★★★★)

### Current Pattern (26 occurrences)

**Repeated pattern**: `array.map().filter()` chains for data extraction

```javascript
// src/crawler/gazetteer/ingestors/WikidataCountryIngestor.js:104
const qids = bindings.map(b => this._extractQid(b.country?.value)).filter(Boolean);

// src/tools/populate-gazetteer.js:36
const countriesFilter = (getArg('countries', '') || '')
  .split(',')
  .map(s => s.trim().toUpperCase())
  .filter(Boolean);

// src/crawler/IntelligentPlanRunner.js:235
sample: res.slice(0, 5).map((c) => c?.url).filter(Boolean)

// src/crawler/robots.js:18
sm = txt.split(/\r?\n/)
  .map(l => l.trim())
  .filter(l => /^sitemap\s*:/i.test(l))
  .map(l => l.split(/:/i).slice(1).join(':').trim())
  .filter(Boolean);
```

### Recommended Pattern: Functional Pipeline Utilities

**Create:** `src/utils/pipelines.js`

```javascript
const {is_defined, tof} = require('lang-tools');

/**
 * Compact: map + filter in one pass
 * Avoids creating intermediate arrays
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
 * Extract: safely get nested property from array of objects
 * Similar to collective(array).prop but with null safety
 */
function extract(array, path, fallback = null) {
  if (!Array.isArray(array)) return [];
  return array.map(item => {
    if (!is_defined(item)) return fallback;
    const keys = String(path).split('.');
    let value = item;
    for (const key of keys) {
      if (!is_defined(value) || tof(value) !== 'object') return fallback;
      value = value[key];
    }
    return is_defined(value) ? value : fallback;
  });
}

/**
 * Pluck: extract + compact (get prop + filter nulls)
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

module.exports = {compact, extract, pluck, pipeline};
```

### Usage Examples

```javascript
const {compact, pluck, pipeline} = require('../utils/pipelines');

// BEFORE: Multiple passes
const qids = bindings
  .map(b => this._extractQid(b.country?.value))
  .filter(Boolean);

// AFTER: Single pass
const qids = compact(bindings, b => this._extractQid(b.country?.value));

// BEFORE: Nested map/filter
const countriesFilter = (getArg('countries', '') || '')
  .split(',')
  .map(s => s.trim().toUpperCase())
  .filter(Boolean);

// AFTER: Pipeline composition
const countriesFilter = pipeline(
  str => str.split(','),
  arr => arr.map(s => s.trim().toUpperCase()),
  arr => arr.filter(Boolean)
)(getArg('countries', ''));

// OR even better with compact:
const countriesFilter = compact(
  getArg('countries', '').split(','),
  s => s.trim().toUpperCase() || null
);

// BEFORE: Nested property extraction
const sample = res.slice(0, 5).map(c => c?.url).filter(Boolean);

// AFTER: pluck utility
const sample = pluck(res.slice(0, 5), 'url');
```

### Benefits

- **Performance**: Single-pass iteration vs multiple passes
- **Readability**: Intent is clearer (`compact`, `pluck` vs `map().filter()`)
- **Null safety**: Built-in handling of undefined/null values
- **Composability**: Pipeline builder for complex transformations

**Estimated Impact:** ~26 files, ~50 lines saved, improved performance

---

## 2. Nullish Coalescing Chains (★★★★☆)

### Current Pattern (30+ occurrences)

**Pattern**: Chained `??` operators for fallback values with long property paths

```javascript
// src/ui/public/index/analysisHandlers.js:122
const processed = Number(progressInfo.processed ?? progressInfo.updated ?? progressInfo.analysed ?? 0);

// src/ui/public/index/analysisHandlers.js:191
const saved = Number(progressInfo.saved ?? progressInfo.articlesSaved ?? NaN);

// src/ui/public/index/state/reducers.js:349
const seededCount = seeded && (seeded.unique ?? seeded.requested ?? seeded.count ?? seeded.visited ?? null);
```

### Recommended Pattern: Fallback Utility

**Create:** `src/utils/objectHelpers.js` (or extend existing)

```javascript
const {is_defined, tof} = require('lang-tools');

/**
 * First defined value from multiple paths
 * Supports both property chains and direct values
 */
function firstDefined(obj, ...paths) {
  if (!is_defined(obj) || tof(obj) !== 'object') {
    // If obj itself is a primitive, check remaining args
    if (is_defined(obj)) return obj;
    for (const path of paths) {
      if (is_defined(path)) return path;
    }
    return undefined;
  }

  for (const path of paths) {
    if (tof(path) === 'string') {
      // Path like 'processed' or 'progress.processed'
      const value = getDeep(obj, path);
      if (is_defined(value)) return value;
    } else if (is_defined(path)) {
      // Direct value
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

module.exports = {firstDefined, numberOr, getDeep};
```

### Usage Examples

```javascript
const {firstDefined, numberOr} = require('../utils/objectHelpers');

// BEFORE: Long ?? chains
const processed = Number(progressInfo.processed ?? progressInfo.updated ?? progressInfo.analysed ?? 0);

// AFTER: firstDefined + coercion
const processed = numberOr(progressInfo, 'processed', 'updated', 'analysed', 0);

// BEFORE: Nested checks
const seededCount = seeded && (seeded.unique ?? seeded.requested ?? seeded.count ?? seeded.visited ?? null);

// AFTER: Cleaner utility
const seededCount = seeded ? firstDefined(seeded, 'unique', 'requested', 'count', 'visited', null) : null;
```

### Benefits

- **Readability**: Intent is clear (find first defined value)
- **Type safety**: Built-in coercion for common cases
- **Extensibility**: Easy to add `stringOr`, `booleanOr` variants
- **Consistency**: Single pattern for fallback logic

**Estimated Impact:** ~30 occurrences, improved readability

---

## 3. Configuration Builder Pattern (★★★★☆)

### Current Pattern: Repetitive `typeof` Guards

**Found in:** `src/crawl.js` (30+ occurrences), `buildArgs.js`, `ConfigManager.js`

```javascript
// src/crawl.js:174-208 (35 lines of repetitive guards)
this.rateLimitMs = typeof options.rateLimitMs === 'number' ? options.rateLimitMs : (this.slowMode ? 1000 : 0);
this.maxDepth = options.maxDepth || 3;
this.maxDownloads = typeof options.maxDownloads === 'number' && options.maxDownloads > 0 ? options.maxDownloads : undefined;
this.maxAgeMs = typeof options.maxAgeMs === 'number' && options.maxAgeMs >= 0 ? options.maxAgeMs : undefined;
this.maxAgeArticleMs = typeof options.maxAgeArticleMs === 'number' && options.maxAgeArticleMs >= 0 ? options.maxAgeArticleMs : undefined;
this.maxAgeHubMs = typeof options.maxAgeHubMs === 'number' && options.maxAgeHubMs >= 0 ? options.maxAgeHubMs : undefined;
// ... 25 more lines like this
```

### Recommended Pattern: Options Schema

**Create:** `src/utils/optionsBuilder.js`

```javascript
const {tof, is_defined} = require('lang-tools');

/**
 * Schema-based options builder
 * Centralizes validation and coercion logic
 */
class OptionsBuilder {
  constructor(schema = {}) {
    this.schema = schema;
  }

  /**
   * Build options object from input and schema
   */
  build(input = {}, context = {}) {
    const result = {};
    
    for (const [key, spec] of Object.entries(this.schema)) {
      const rawValue = input[key];
      const coerced = this._coerceValue(rawValue, spec, context);
      
      if (is_defined(coerced)) {
        result[key] = coerced;
      } else if (is_defined(spec.default)) {
        result[key] = typeof spec.default === 'function' 
          ? spec.default(context)
          : spec.default;
      }
    }
    
    return result;
  }

  _coerceValue(value, spec, context) {
    if (!is_defined(value)) return spec.default;

    switch (spec.type) {
      case 'number':
        return this._coerceNumber(value, spec);
      case 'boolean':
        return this._coerceBoolean(value, spec);
      case 'string':
        return this._coerceString(value, spec);
      case 'array':
        return this._coerceArray(value, spec);
      default:
        return value;
    }
  }

  _coerceNumber(value, spec) {
    const num = Number(value);
    if (!Number.isFinite(num)) return spec.default;
    
    if (is_defined(spec.min) && num < spec.min) return spec.default;
    if (is_defined(spec.max) && num > spec.max) return spec.default;
    if (spec.positive && num <= 0) return spec.default;
    if (spec.nonNegative && num < 0) return spec.default;
    
    return num;
  }

  _coerceBoolean(value, spec) {
    if (tof(value) === 'boolean') return value;
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    return spec.default;
  }

  _coerceString(value, spec) {
    const str = String(value);
    if (spec.toLowerCase) return str.toLowerCase();
    if (spec.toUpperCase) return str.toUpperCase();
    return str;
  }

  _coerceArray(value, spec) {
    if (Array.isArray(value)) {
      return spec.itemType 
        ? value.map(v => this._coerceValue(v, {type: spec.itemType}))
        : value;
    }
    if (tof(value) === 'string' && spec.split) {
      return value.split(spec.split).filter(Boolean);
    }
    return spec.default || [];
  }
}

module.exports = {OptionsBuilder};
```

### Usage Example: Crawl.js Refactor

```javascript
// src/crawl.js (NEW approach)
const {OptionsBuilder} = require('./utils/optionsBuilder');

// Define schema once
const CRAWL_OPTIONS_SCHEMA = {
  rateLimitMs: {
    type: 'number',
    default: (ctx) => ctx.slowMode ? 1000 : 0,
    nonNegative: true
  },
  maxDepth: {
    type: 'number',
    default: 3,
    min: 1
  },
  maxDownloads: {
    type: 'number',
    positive: true
    // undefined if not provided or invalid
  },
  maxAgeMs: {
    type: 'number',
    nonNegative: true
  },
  intTargetHosts: {
    type: 'array',
    itemType: 'string',
    split: ','
  }
  // ... rest of schema
};

class Crawler {
  constructor(startUrl, options = {}) {
    const builder = new OptionsBuilder(CRAWL_OPTIONS_SCHEMA);
    const opts = builder.build(options, {slowMode: options.slowMode});
    
    // Now just assign validated values
    Object.assign(this, opts);
    
    // Or selectively:
    this.rateLimitMs = opts.rateLimitMs;
    this.maxDepth = opts.maxDepth;
    // ... rest of assignments (35 lines → 5 lines)
  }
}
```

### Benefits

- **DRY**: Schema defines validation once, not per-property
- **Testability**: Schema is data, easy to test separately
- **Documentation**: Schema serves as source of truth for options
- **Maintainability**: Adding new options doesn't duplicate logic
- **Type safety**: Centralized coercion prevents bugs

**Estimated Impact:** 
- `crawl.js`: 35 lines → ~10 lines
- `buildArgs.js`: Similar reduction
- All option-heavy classes benefit

---

## 4. Attribute Builder Pattern (★★★☆☆)

### Current Pattern: Repetitive Conditional Pushes

**Found in:** `WikidataCountryIngestor.js`, gazetteer modules

```javascript
// WikidataCountryIngestor.js:207-238
const attributes = [];
if (population != null) {
  attributes.push({ attr: 'population', value: population, metadata: { property: 'P1082' } });
}
if (area != null) {
  attributes.push({ attr: 'area_sq_km', value: area, metadata: { property: 'P2046' } });
}
if (gdp != null) {
  attributes.push({ attr: 'gdp_usd', value: gdp, metadata: { property: 'P2131' } });
}
if (gdpPerCapita != null) {
  attributes.push({ attr: 'gdp_per_capita_usd', value: gdpPerCapita, metadata: { property: 'P2132' } });
}
// ... 5 more like this
```

### Recommended Pattern: Fluent Builder

**Create:** `src/crawler/gazetteer/AttributeBuilder.js`

```javascript
const {is_defined} = require('lang-tools');

/**
 * Fluent builder for gazetteer place attributes
 */
class AttributeBuilder {
  constructor() {
    this.attributes = [];
  }

  /**
   * Add attribute if value is defined
   */
  add(attr, value, metadata = {}) {
    if (is_defined(value) && value !== null) {
      this.attributes.push({ attr, value, metadata });
    }
    return this; // Chainable
  }

  /**
   * Add Wikidata property
   */
  wikidata(attr, value, property) {
    return this.add(attr, value, { property });
  }

  /**
   * Add coordinate pair
   */
  coordinates(lat, lng, source = null) {
    if (is_defined(lat) && is_defined(lng)) {
      return this.add('coordinates', { lat, lng }, source ? { source } : {});
    }
    return this;
  }

  /**
   * Add external ID reference
   */
  externalId(system, value) {
    return this.add(`${system}.id`, value, { system });
  }

  /**
   * Build final array
   */
  build() {
    return this.attributes;
  }
}

module.exports = {AttributeBuilder};
```

### Usage Example

```javascript
const {AttributeBuilder} = require('./AttributeBuilder');

// BEFORE: 32 lines of repetitive conditionals
const attributes = [];
if (population != null) {
  attributes.push({ attr: 'population', value: population, metadata: { property: 'P1082' } });
}
if (area != null) {
  attributes.push({ attr: 'area_sq_km', value: area, metadata: { property: 'P2046' } });
}
// ... 5 more

// AFTER: 8 lines, chainable, self-documenting
const attributes = new AttributeBuilder()
  .wikidata('population', population, 'P1082')
  .wikidata('area_sq_km', area, 'P2046')
  .wikidata('gdp_usd', gdp, 'P2131')
  .wikidata('gdp_per_capita_usd', gdpPerCapita, 'P2132')
  .wikidata('iso.alpha2', iso2, 'P297')
  .coordinates(coords?.lat, coords?.lon, 'P625')
  .externalId('osm.relation', osmRelationId)
  .externalId('geonames', geonamesId)
  .build();
```

### Benefits

- **Conciseness**: 32 lines → 8 lines (75% reduction)
- **Readability**: Chainable methods read like prose
- **Type safety**: Methods enforce structure
- **Reusability**: Same builder for all ingestors

**Estimated Impact:** Gazetteer modules, ~100 lines saved

---

## 5. Error Handling Patterns (★★★☆☆)

### Current Pattern: Scattered try/catch Blocks

**Found throughout:** SSE handlers, database operations, crawler modules

```javascript
// Pattern 1: Silent failures
try {
  const payload = JSON.parse(e.data);
  // ... process
} catch (_) {}

// Pattern 2: Log and continue
try {
  this.db.prepare('INSERT ...').run();
} catch (err) {
  this.logger.warn('Failed to insert:', err.message);
}

// Pattern 3: Inconsistent error objects
catch (err) {
  return { error: err.message };
}
catch (err) {
  throw new Error('Failed: ' + err.message);
}
```

### Recommended Pattern: Result Type (Inspired by Rust/fp-ts)

**Create:** `src/utils/result.js`

```javascript
const {is_defined, tof} = require('lang-tools');

/**
 * Result type for explicit error handling
 * Avoids scattered try/catch blocks
 */
class Result {
  constructor(value, error) {
    this._value = value;
    this._error = error;
    this._ok = !is_defined(error);
  }

  static ok(value) {
    return new Result(value, null);
  }

  static err(error) {
    return new Result(null, error);
  }

  /**
   * Execute function and wrap result
   */
  static from(fn, context = null) {
    try {
      const value = context ? fn.call(context) : fn();
      return Result.ok(value);
    } catch (error) {
      return Result.err(error);
    }
  }

  /**
   * Async version
   */
  static async fromAsync(fn, context = null) {
    try {
      const value = await (context ? fn.call(context) : fn());
      return Result.ok(value);
    } catch (error) {
      return Result.err(error);
    }
  }

  isOk() {
    return this._ok;
  }

  isErr() {
    return !this._ok;
  }

  unwrap() {
    if (this.isErr()) throw this._error;
    return this._value;
  }

  unwrapOr(fallback) {
    return this.isOk() ? this._value : fallback;
  }

  map(fn) {
    return this.isOk() ? Result.ok(fn(this._value)) : this;
  }

  mapErr(fn) {
    return this.isErr() ? Result.err(fn(this._error)) : this;
  }

  match({ ok, err }) {
    return this.isOk() ? ok(this._value) : err(this._error);
  }
}

module.exports = {Result};
```

### Usage Example

```javascript
const {Result} = require('../utils/result');

// BEFORE: Scattered try/catch
function handleLog(e) {
  try {
    const payload = JSON.parse(e.data);
    state.logEntries.push({ text: payload.line, isErr: false });
  } catch (_) {
    // Silent failure
  }
}

// AFTER: Explicit result handling
function handleLog(e) {
  const result = Result.from(() => JSON.parse(e.data));
  
  result.match({
    ok: (payload) => {
      state.logEntries.push({ text: payload.line, isErr: false });
    },
    err: (error) => {
      // Can log, ignore, or handle explicitly
      if (this.verbose) console.warn('JSON parse failed:', error);
    }
  });
}

// BEFORE: Inconsistent error returns
function insertPlace(data) {
  try {
    this.db.prepare('INSERT ...').run(data);
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
}

// AFTER: Consistent Result type
function insertPlace(data) {
  return Result.from(() => {
    this.db.prepare('INSERT ...').run(data);
    return { id: data.id };
  });
}

// Caller can chain operations
const result = insertPlace(data)
  .map(res => ({ ...res, timestamp: Date.now() }))
  .mapErr(err => new Error(`Insert failed: ${err.message}`));

if (result.isOk()) {
  logger.info('Inserted:', result.unwrap());
} else {
  logger.error('Failed:', result.unwrapOr({}));
}
```

### Benefits

- **Explicitness**: Errors are values, not exceptions
- **Composability**: Chain operations without nested try/catch
- **Consistency**: Single error handling pattern
- **Type safety**: Forces caller to handle both cases

**Estimated Impact:** Optional pattern, improves error handling clarity

---

## 6. SSE Handler Factory Pattern (★★★★☆)

### Current Pattern: Already Extracted, But Can Improve

**Found in:** `src/ui/public/index/sseHandlers.js` (already modular!)

The SSE handlers are already well-factored, but we can improve with:

1. **Handler registration pattern**
2. **Middleware support**
3. **Error boundaries**

### Recommended Enhancement

```javascript
// src/ui/public/index/sseClient.js (enhanced)
import {each, is_defined, tof} from 'lang-tools';

/**
 * SSE client with middleware support
 */
class SseClient {
  constructor(url, options = {}) {
    this.url = url;
    this.handlers = new Map();
    this.middleware = [];
    this.errorHandler = options.onError || console.error;
  }

  /**
   * Add middleware (runs before all handlers)
   */
  use(fn) {
    this.middleware.push(fn);
    return this;
  }

  /**
   * Register handler with automatic error boundary
   */
  on(event, handler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event).push(handler);
    return this;
  }

  /**
   * Connect to SSE stream
   */
  connect() {
    this.source = new EventSource(this.url);
    
    each(this.handlers, (event, handlers) => {
      this.source.addEventListener(event, (e) => {
        this._dispatch(event, e, handlers);
      });
    });
    
    return this;
  }

  /**
   * Dispatch event through middleware → handlers
   */
  async _dispatch(event, rawEvent, handlers) {
    try {
      // Run middleware
      let data = rawEvent;
      for (const mw of this.middleware) {
        data = await mw(event, data);
        if (!is_defined(data)) return; // Middleware can cancel event
      }

      // Run handlers with error boundaries
      each(handlers, async (handler) => {
        try {
          await handler(data);
        } catch (err) {
          this.errorHandler(new Error(`Handler error for ${event}: ${err.message}`), data);
        }
      });
    } catch (err) {
      this.errorHandler(new Error(`Middleware error for ${event}: ${err.message}`), rawEvent);
    }
  }
}

// Usage
const client = new SseClient('/events')
  .use(async (event, e) => {
    // Middleware: auto-parse JSON
    try {
      return { ...e, payload: JSON.parse(e.data) };
    } catch {
      return e; // Pass through if not JSON
    }
  })
  .use(async (event, e) => {
    // Middleware: mark SSE live
    markSseLive();
    return e;
  })
  .on('log', (e) => {
    state.logEntries.push({ text: e.payload.line });
  })
  .on('progress', (e) => {
    updateMetrics(e.payload);
  })
  .connect();
```

### Benefits

- **Middleware**: Extract common logic (JSON parsing, logging, etc.)
- **Error boundaries**: Handler errors don't crash entire stream
- **Composability**: Chain setup calls
- **Testability**: Easier to test individual handlers

**Estimated Impact:** Improves existing modular code, adds resilience

---

## Summary Table: Priority & Impact

| Pattern | Priority | Files Affected | Lines Saved | Complexity Reduction |
|---------|----------|----------------|-------------|---------------------|
| 1. Data Transformation Pipelines | ★★★★★ | 26+ | ~50 | High (single-pass ops) |
| 2. Nullish Coalescing Chains | ★★★★☆ | 30+ | ~20 | Medium (readability) |
| 3. Configuration Builder | ★★★★☆ | 3-5 | ~100 | High (DRY, testable) |
| 4. Attribute Builder | ★★★☆☆ | 5-10 | ~100 | High (fluent API) |
| 5. Result Type | ★★★☆☆ | Optional | Varies | Medium (consistency) |
| 6. SSE Handler Enhancement | ★★★★☆ | 2-3 | ~30 | Medium (resilience) |

---

## Implementation Priority (After Phase 1 Audit)

### Phase 1.5: Quick Wins (Week 1)
1. **Create pipeline utilities** (`compact`, `pluck`)
   - Immediate benefit across 26 files
   - Low risk (pure functions)
   - 2-3 hours to implement + test

2. **Create `firstDefined`/`numberOr` utilities**
   - Improves 30+ nullish coalescing chains
   - Low risk (pure functions)
   - 1-2 hours to implement + test

### Phase 2.5: Medium Wins (Week 2-3)
3. **Implement `OptionsBuilder`**
   - Start with `crawl.js` schema
   - High impact (35 lines → 10 lines)
   - Medium risk (requires careful testing)
   - 1 day to implement + test

4. **Create `AttributeBuilder`**
   - Use in gazetteer ingestors
   - High impact (100 lines saved)
   - Low risk (isolated to gazetteer)
   - 1 day to implement + test

### Phase 3+: Optional Enhancements
5. **Result type** (optional, consider fp-ts instead)
6. **SSE middleware** (nice-to-have, already well-factored)

---

## Testing Strategy

Each new utility must have:

1. **Unit tests** with lang-tools patterns
```javascript
const {compact, pluck} = require('../pipelines');

describe('compact', () => {
  test('single-pass map+filter', () => {
    const input = [{id: 1}, {id: null}, {id: 3}];
    const result = compact(input, item => item.id);
    expect(result).toEqual([1, 3]);
  });
});
```

2. **Integration tests** showing before/after
3. **Performance benchmarks** for pipeline utilities

---

## Next Actions

1. **Review architectural patterns** with team (1 hour)
2. **Approve Phase 1.5 utilities** (pipeline + nullish helpers)
3. **Implement first utility** (`pipelines.js`) with tests
4. **Refactor 5-10 call sites** to validate pattern
5. **Document in RUNBOOK** for future reference

---

**Conclusion:** These architectural patterns address **repetitive code structures** that go beyond individual forEach/typeof replacements. They provide **higher-level abstractions** that make the code more idiomatic, maintainable, and testable.

The **data transformation pipelines** (Pattern 1) offer the highest immediate ROI with minimal risk, followed by the **configuration builder** (Pattern 3) for long-term maintainability.
