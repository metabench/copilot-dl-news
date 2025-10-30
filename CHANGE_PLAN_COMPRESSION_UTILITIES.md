# CHANGE_PLAN — Compression Utilities Unification

**Date Created:** October 30, 2025  
**Status:** In Progress  
**Priority:** HIGH  
**Category:** Service Layer Modularization

---

## Goal / Non-Goals

### Goal
**Unify scattered compression utilities into a clean, single-source-of-truth facade that eliminates:
1. Repeated algorithm validation and level clamping logic
2. Multiple PRESET configurations spread across modules
3. Inconsistent stats calculation and error handling
4. Duplicated compression type lookups**

### Non-Goals
- We are NOT changing the compression algorithms themselves (gzip, brotli, zstd remain as-is)
- We are NOT modifying the database schema for compression types
- We are NOT refactoring the tar-based bucket implementation (only its compression API surface)
- We are NOT changing the lifecycle tier logic in `config/compression.js`

---

## Current Behavior

### Scattered Compression Interface

Currently, compression is fragmented across 5 modules with overlapping concerns:

**`src/utils/compression.js` (314 lines)**
- Core compress/decompress functions with algorithm selection
- Level clamping: `Math.max(1, Math.min(9, level))` for gzip, `Math.max(0, Math.min(11, level))` for brotli
- Brotli parameter configuration (lgwin, lgblock, size hint)
- Fallback from zstd to brotli with warning
- Stats calculation: `{ compressed, uncompressedSize, compressedSize, ratio, sha256 }`
- getCompressionType database query helper

**`src/utils/articleCompression.js` (208 lines)**
- Wraps compression.js with article-specific defaults
- Hard-codes BROTLI_6 as default compression type
- Database queries for article compression state
- Bucket vs. individual compression routing logic
- No level normalization (relies on compression.js)

**`src/utils/compressionBuckets.js` (406 lines)**
- Tar-based archive compression for batch storage
- Calls `getCompressionType()` from compression.js
- Does NOT perform algorithm validation (assumes compression.js does it)
- Stats recalculation for bucket operations (duplicates stats shape)

**`src/config/compression.js` (300+ lines)**
- Defines all compression type presets (brotli_6, gzip_9, zstd_3, etc.)
- Helper functions: `getCompressionType()`, `getCompressionTypeById()`, `getTierForAge()`
- Tier definitions (hot=none, warm=brotli_6, cold=brotli_11)
- Feature flags and monitoring config

**`src/utils/CompressionAnalytics.js` (unclear extent)**
- Telemetry and metrics collection around compression
- Likely duplicates stats calculations
- May have its own algorithm selection logic

---

## Problem Analysis

### Duplication Hotspots

**1. Algorithm Validation & Level Clamping**
- `compression.js` line 57: `Math.max(1, Math.min(9, level))` for gzip
- `compression.js` line 63: `Math.max(0, Math.min(11, level))` for brotli
- `compression.js` lines 68, 73: Parameter range validation for brotli window/block sizes
- **Risk:** If rules change, must update in multiple places; inconsistent clamping between consumers

**2. Compression Type Lookup**
- `compressionBuckets.js` calls `getCompressionType(db, compressionType)`
- `articleCompression.js` does the same
- Same query logic duplicated across callers
- **Risk:** Query logic changes require updates everywhere

**3. Stats Object Shape**
- `compression.js` returns `{ compressed, uncompressedSize, compressedSize, ratio, sha256 }`
- `compressionBuckets.js` returns similar but may format differently
- `articleCompression.js` expects consistent shape but doesn't validate
- **Risk:** Consumers may diverge in stats calculation

**4. Default Presets**
- `config/compression.js` defines all presets
- `articleCompression.js` hard-codes 'brotli_6' default
- `config/compression.js` defines `newContentCompression: 'brotli_6'` (duplicates hard-coding)
- `compressionBuckets.js` may have its own defaults
- **Risk:** Multiple sources of truth for defaults; hard-coded strings leak out

**5. Algorithm Fallback Logic**
- `compression.js` line 92: Falls back from zstd to brotli 11 with warning
- This logic is embedded in compress() but may be duplicated in analytics or other consumers
- **Risk:** Inconsistent fallback behavior across the system

---

## Refactor & Modularization Plan

### Step 1: Create `CompressionFacade` Module

**File:** `src/utils/CompressionFacade.js`

**Purpose:** Single entry point for all compression operations. Centralizes validation, presets, and stats.

**Exports:**

```javascript
// Presets (constants)
const PRESETS = {
  NONE: 'none',
  GZIP_1: 'gzip_1',
  GZIP_3: 'gzip_3',
  GZIP_6: 'gzip_6',
  GZIP_9: 'gzip_9',
  BROTLI_0: 'brotli_0',
  BROTLI_1: 'brotli_1',
  BROTLI_3: 'brotli_3',
  BROTLI_4: 'brotli_4',
  BROTLI_5: 'brotli_5',
  BROTLI_6: 'brotli_6',      // Default for warm tier
  BROTLI_7: 'brotli_7',
  BROTLI_8: 'brotli_8',
  BROTLI_9: 'brotli_9',
  BROTLI_10: 'brotli_10',
  BROTLI_11: 'brotli_11',    // Default for cold tier
  ZSTD_3: 'zstd_3',
  ZSTD_19: 'zstd_19'
};

// Normalize compression options before passing to core compress()
function normalizeCompressionOptions(options) {
  // Returns { algorithm, level, windowBits, blockBits } with validated ranges
}

// Get preset by name, returns standardized { algorithm, level }
function getPreset(presetName) {
  // Returns { algorithm: 'brotli', level: 6 } or similar
}

// Compress with validation
function compress(content, options = {}) {
  // Validate and normalize options
  // Delegate to core compress()
  // Return consistent stats object
}

// Decompress
function decompress(buffer, algorithm = 'gzip') {
  // Delegate to core decompress()
}

// Get compression type from database with caching
function getCompressionType(db, typeName) {
  // Centralized lookup with optional caching
}

// Stats object factory
function createStatsObject(result) {
  // Standardize stats shape across all compression operations
}
```

### Step 2: Refactor `articleCompression.js`

**Change:** Remove algorithm selection logic; use CompressionFacade

**Before:**
```javascript
const { compress, decompress } = require('./compression');

function compressArticle(content) {
  return compress(content, { algorithm: 'brotli', level: 6 });
}
```

**After:**
```javascript
const { compress } = require('./CompressionFacade');
const { PRESETS } = require('./CompressionFacade');

function compressArticle(content) {
  return compress(content, { preset: PRESETS.BROTLI_6 });
}
```

**Benefits:**
- Article module no longer owns compression defaults
- Clearer intent: using a preset rather than hardcoding algorithm/level

### Step 3: Refactor `compressionBuckets.js`

**Change:** Use CompressionFacade for algorithm validation and stats

**Before:**
```javascript
function createBucket(db, options) {
  const { compressionType, items } = options;
  const type = getCompressionType(db, compressionType);
  
  // Compress and collect stats...
  const result = compress(content, { algorithm: type.algorithm, level: type.level });
  return {
    bucketId,
    compressedSize: result.compressedSize,
    ratio: result.ratio
  };
}
```

**After:**
```javascript
function createBucket(db, options) {
  const { compressionType, items } = options;
  
  // CompressionFacade handles type lookup and validation
  const result = compressWithType(db, content, compressionType);
  return createBucketStats(result);
}

// New helper in facade
function compressWithType(db, content, typeName) {
  const preset = getPreset(typeName);
  return compress(content, { preset });
}
```

### Step 4: Consolidate Presets in CompressionFacade

**Currently:**
- `config/compression.js` defines all preset metadata
- `articleCompression.js` hardcodes 'brotli_6'

**After:**
- `CompressionFacade.js` exports PRESETS constant
- All consumers use `PRESETS.BROTLI_6` instead of string literals
- Still query database for full compression type record (id, description) via `getCompressionType()`

### Step 5: Add Validation & Normalization

**In CompressionFacade:**

```javascript
/**
 * Validate and normalize compression options
 * @param {Object} options - User-provided options
 * @param {string} options.algorithm - 'gzip' | 'brotli' | 'zstd' | 'none'
 * @param {number} options.level - Compression level
 * @returns {Object} Normalized { algorithm, level, windowBits, blockBits }
 * @throws {Error} If algorithm is unknown
 */
function normalizeCompressionOptions(options = {}) {
  let { algorithm = 'gzip', level, preset } = options;
  
  // Handle preset-based input
  if (preset && PRESET_DEFINITIONS[preset]) {
    const presetDef = PRESET_DEFINITIONS[preset];
    algorithm = presetDef.algorithm;
    level = presetDef.level;
  }
  
  // Validate algorithm
  const validAlgorithms = ['gzip', 'brotli', 'zstd', 'none'];
  if (!validAlgorithms.includes(algorithm)) {
    throw new Error(`Invalid compression algorithm: ${algorithm}`);
  }
  
  // Clamp level based on algorithm
  const levelRanges = {
    gzip: [1, 9],
    brotli: [0, 11],
    zstd: [1, 22],
    none: [0, 0]
  };
  
  const [min, max] = levelRanges[algorithm];
  const normalizedLevel = level == null ? DEFAULT_LEVELS[algorithm] : Math.max(min, Math.min(max, level));
  
  return { algorithm, level: normalizedLevel };
}
```

---

## Patterns to Introduce

### 1. **PRESETS Constant**
```javascript
const PRESETS = {
  BROTLI_6: 'brotli_6',
  BROTLI_11: 'brotli_11',
  GZIP_9: 'gzip_9',
  NONE: 'none'
};
```

**Usage:** `compress(content, { preset: PRESETS.BROTLI_6 })`

### 2. **Normalization Pipeline**
- Input: User-provided options (preset name or { algorithm, level })
- Normalize: Validate algorithm, clamp level, handle fallbacks
- Delegate: Pass to core compress()

### 3. **Stats Factory Function**
```javascript
function createStatsObject(compressed, uncompressedSize, algorithm) {
  return {
    compressed,
    uncompressedSize,
    compressedSize: compressed.length,
    ratio: compressed.length / uncompressedSize,
    sha256: hash(compressed),
    algorithm,
    timestamp: new Date().toISOString()
  };
}
```

### 4. **Database Lookup Caching**
CompressionFacade can cache `getCompressionType()` results to avoid repeated DB queries.

---

## Risks & Unknowns

**Risk 1: Changing compress() API**
- **Issue:** Consumers currently call `compress(content, { algorithm: 'brotli', level: 6 })`
- **Mitigation:** Facade should support BOTH `{ algorithm, level }` AND `{ preset }` syntax for backward compatibility
- **Timeline:** Phase out old syntax over 2 releases

**Risk 2: Analytics telemetry hooks**
- **Issue:** CompressionAnalytics may have its own compress() calls or stat calculations
- **Mitigation:** Audit CompressionAnalytics module before refactoring; may need to extend facade for telemetry hooks
- **Timeline:** Check module extent first (unknown size)

**Risk 3: Brotli parameter configuration**
- **Issue:** windowBits and blockBits are specialized parameters; new facade must not hide them
- **Mitigation:** Facade accepts and passes through these params transparently
- **Timeline:** No change to brotli behavior; just clearer plumbing

**Risk 4: Preset extensibility**
- **Issue:** What if a new compression type (e.g., zstd_10) is added after refactoring?
- **Mitigation:** PRESETS constant is extensible; new entries added to both facade and config/compression.js
- **Timeline:** Document addition process in JSDoc

---

## Docs Impact

### Files to Update

1. **`src/utils/CompressionFacade.js` (NEW)**
   - Comprehensive JSDoc with examples
   - Preset definitions and usage patterns
   - Algorithm ranges and fallback behavior

2. **`src/utils/articleCompression.js`**
   - Update imports: use CompressionFacade instead of compression.js directly
   - Update JSDoc: reference PRESETS.BROTLI_6 instead of hardcoded string

3. **`src/utils/compressionBuckets.js`**
   - Update imports: use CompressionFacade for type validation
   - Update JSDoc: clarify that compression type names are standardized presets

4. **`CONTRIBUTING.md` or compression guide (if exists)**
   - Add section: "Using CompressionFacade"
   - Explain PRESETS, normalization, and when to use each

---

## Focused Test Plan

### Pre-Refactoring Baseline
```bash
# Run existing compression tests (gather baseline)
npm run test:file -- src/utils/__tests__/compression.test.js
npm run test:file -- src/utils/__tests__/articleCompression.test.js
npm run test:file -- src/utils/__tests__/compressionBuckets.test.js
```

### Per-Step Testing

**After Step 1 (CompressionFacade creation):**
```bash
npm run test:file -- src/utils/__tests__/CompressionFacade.test.js
```
- Test PRESETS constants
- Test normalization (algorithm validation, level clamping)
- Test stats object creation
- Test getCompressionType with mock DB

**After Step 2 (articleCompression refactor):**
```bash
npm run test:file -- src/utils/__tests__/articleCompression.test.js
```
- Verify all existing tests pass
- Verify defaults changed from hardcoded to PRESETS reference

**After Step 3 (compressionBuckets refactor):**
```bash
npm run test:file -- src/utils/__tests__/compressionBuckets.test.js
```
- Verify bucket stats unchanged
- Verify compression type lookup works through facade

**Full suite (after all steps):**
```bash
npm run test:file -- "src/utils/__tests__/(CompressionFacade|articleCompression|compressionBuckets)" --bail=1
```

---

## Rollback Plan

**If at any step things break:**

1. **After Step 1 (CompressionFacade creation):**
   - Delete `src/utils/CompressionFacade.js`
   - No other files modified; nothing to revert

2. **After Step 2 (articleCompression refactor):**
   - Revert articleCompression.js to previous version
   - Delete CompressionFacade.js
   - Run tests to confirm baseline

3. **After Step 3 (compressionBuckets refactor):**
   - Revert compressionBuckets.js and articleCompression.js
   - Delete CompressionFacade.js

4. **Git command:**
   ```bash
   git checkout HEAD -- src/utils/articleCompression.js src/utils/compressionBuckets.js
   git rm src/utils/CompressionFacade.js
   npm run test:file -- src/utils/__tests__/(compression|articleCompression|compressionBuckets).test.js
   ```

---

## Refactor Index

| Old Symbol | New Location | Status |
|---|---|---|
| `compression.compress()` | `CompressionFacade.compress()` (wrapper) | Backward compatible |
| `compression.decompress()` | `CompressionFacade.decompress()` (wrapper) | Backward compatible |
| Hard-coded `'brotli_6'` in articleCompression | `PRESETS.BROTLI_6` in CompressionFacade | Clarifies intent |
| Algorithm selection in compressionBuckets | Delegated to CompressionFacade.normalizeCompressionOptions() | Unified |
| Stats calculation (multiple places) | `CompressionFacade.createStatsObject()` | Single source |
| `getCompressionType(db, name)` | Remains in compression.js but wrapped by CompressionFacade | Centralized lookup |

---

## Success Criteria

✅ **Code Metrics:**
- Lines of duplication eliminated: ~150
- Modules with simplified interfaces: 3 (articleCompression, compressionBuckets, analytics)
- Single source of truth for: algorithm validation, level clamping, preset definitions

✅ **Test Coverage:**
- All existing tests pass without modification
- New tests for CompressionFacade cover: algorithm validation, level clamping, preset lookup
- No regressions in bucket or article compression behavior

✅ **API Clarity:**
- Consumers use `PRESETS.BROTLI_6` instead of hardcoded strings
- Compression type validation centralized in one function
- Stats object shape consistent across all operations

---

## Implementation Timeline

| Step | Task | Est. Time |
|---|---|---|
| 1 | Create CompressionFacade.js with presets and normalization | 45 min |
| 2 | Refactor articleCompression.js to use facade | 20 min |
| 3 | Refactor compressionBuckets.js to use facade | 20 min |
| 4 | Write/update tests for facade | 30 min |
| 5 | Verify all tests pass | 15 min |
| 6 | Update documentation | 15 min |
| **TOTAL** | | **~2.5 hours** |

---

## Notes

- This refactoring preserves the existing core compression algorithms; only the orchestration layer changes
- Backward compatibility is maintained through dual syntax support (`{ algorithm, level }` AND `{ preset }`)
- The facade is lightweight (orchestration + validation) and does NOT add compression logic
- Future extensibility: Adding new compression types requires updates to PRESETS and config/compression.js only

