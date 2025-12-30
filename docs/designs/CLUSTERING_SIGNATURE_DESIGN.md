# Clustering Signature Design

> **Status**: Draft / Planning  
> **Last Updated**: 2024-12-21  
> **Related Diagrams**: `docs/diagrams/extensible-512bit-signatures.svg`

---

## Implementation Status

### ✅ Already Implemented

| Component | Location | Notes |
|-----------|----------|-------|
| **layout_signatures table** | `src/db/migrations/012-layout-signatures.sql` | 7 columns: `signature_hash`, `level`, `signature`, `first_seen_url`, `seen_count`, `created_at`, `last_seen_at` |
| **layout_masks table** | `src/db/migrations/013-layout-masks.sql` | Dynamic node detection for template masking |
| **SkeletonHash** | `src/analysis/structure/SkeletonHash.js` | Level 1 (with IDs/classes) and Level 2 (tags only) |
| **SkeletonDiff** | `src/analysis/structure/SkeletonDiff.js` | Mask generation from multiple samples |
| **structure-miner tool** | `tools/structure-miner.js` | CLI: extracts signatures from `http_responses` |
| **Batch clustering lab** | `labs/batch-clustering/batch-cluster-lab.js` | JavaScript benchmark: 64/128/256-bit comparison |

### Current Signature Format (SkeletonHash)

The **existing** system uses a **SHA-256 truncated to 64 bits** (16 hex chars):

```javascript
// Current: src/analysis/structure/SkeletonHash.js
const hash = crypto.createHash('sha256')
    .update(signature)  // signature = serialized DOM tree string
    .digest('hex')
    .substring(0, 16);  // 64-bit equivalent
```

**Current `signature` column** stores the **serialized DOM tree** (variable-length string like `html(head(title)body(div(article(h1,p,p))))`) — NOT a fixed-size bit vector.

### ⚠️ Gap: Current vs. Planned Architecture

| Aspect | Current Implementation | Planned (512-bit) |
|--------|----------------------|-------------------|
| **Hash type** | SHA-256 truncated (exact match only) | SimHash (similarity via Hamming) |
| **Similarity** | Binary: identical or different | Continuous: 0–512 Hamming distance |
| **Clustering** | Hash bucket grouping | Threshold-based graph clustering |
| **Signature storage** | Variable-length string | Fixed 64 bytes (BLOB) |
| **Bands** | Single (structural only) | 4 bands (structural, content, semantic, reserved) |
| **Native speedup** | None | C++ N-API addon planned |

### 🔧 What Exists for C++ Integration

The project already uses **better-sqlite3** (`^12.5.0`), which is a **native C++ addon** built with node-addon-api. This proves:

1. ✅ Build toolchain works (node-gyp, Python for builds)
2. ✅ Native module resolution works in Node.js
3. ✅ Precedent for shipping C++ addons

**No custom C++ code exists yet** — no `.cc` files or `binding.gyp` in the repo.

---

## Overview

512-bit (64 bytes) extensible signature architecture for page clustering, designed to support multiple similarity dimensions while remaining storage-efficient and computationally fast via C++ N-API addon.

## Signature Layout

```
┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│   STRUCTURAL    │    CONTENT      │    SEMANTIC     │    RESERVED     │
│   128 bits      │    128 bits     │    128 bits     │    128 bits     │
│   (16 bytes)    │    (16 bytes)   │    (16 bytes)   │    (16 bytes)   │
├─────────────────┼─────────────────┼─────────────────┼─────────────────┤
│   Bytes 0-15    │   Bytes 16-31   │   Bytes 32-47   │   Bytes 48-63   │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┘
```

## Band 1: STRUCTURAL (128 bits) — IMPLEMENT FIRST

**Purpose**: Detect same-template, same-site, and mirror pages based on HTML/DOM structure.

### Signals Included

| Signal | Description | Weight |
|--------|-------------|--------|
| Tag path shingles | Hash of ancestor paths like `html/body/div/article/p` | High |
| Tag frequency vector | Counts of `div`, `article`, `nav`, `header`, `footer`, `aside` | Medium |
| DOM depth histogram | Distribution of element depths (shallow vs deep nesting) | Medium |
| Structural ratios | `nav_count / total_elements`, `list_items / total` | Low |
| ID/class patterns | Hashed common class prefixes (e.g., `wp-`, `article-`) | Low |

### Algorithm

**SimHash of tag path 3-shingles**:
1. Extract all tag paths from DOM (e.g., `html/body/div/article`)
2. Generate 3-shingles: `("html/body/div", "body/div/article", ...)`
3. Hash each shingle to 128 bits
4. Weighted sum with sign accumulation
5. Threshold to produce final 128-bit signature

### What It Detects

- ✓ Same website (same CMS/template)
- ✓ Mirror sites
- ✓ Same category pages within a site
- ✓ Near-duplicate structural variants
- ✗ Does NOT detect similar content with different templates

### Threshold

**≤ 20 bits different** = structurally similar (Hamming distance)

---

## Band 2: CONTENT (128 bits) — PHASE 2

**Purpose**: Detect similar text content regardless of presentation/template.

### Signals Included

| Signal | Description | Weight |
|--------|-------------|--------|
| Word 3-grams | Hashed trigrams from visible text | High |
| Headline hash | Fingerprint of `<h1>` / `<title>` content | High |
| Named entities | People, organizations, places extracted | Medium |
| Number patterns | Dates, quantities, statistics in article | Low |
| Text length bucket | Short/medium/long article classification | Low |

### Algorithm

**SimHash of word 3-grams with TF-IDF weighting**:
1. Extract visible text (strip boilerplate via content extraction)
2. Tokenize, normalize (lowercase, stem optional)
3. Generate word 3-grams
4. Weight by inverse document frequency (precomputed from corpus)
5. SimHash to 128 bits

### What It Detects

- ✓ Syndicated articles (AP, Reuters copies)
- ✓ Rewrites and paraphrases (partial match)
- ✓ Wire service duplicates
- ✓ Same article on different sites
- ✗ Does NOT detect same topic, different article

### Threshold

**≤ 25 bits different** = content similar

---

## Band 3: SEMANTIC (128 bits) — FUTURE / OPTIONAL

**Purpose**: Detect same topic/event across different sources and presentations.

### Signals Included (Candidates)

| Signal | Description | Weight |
|--------|-------------|--------|
| Topic category | Politics, sports, tech, etc. (classifier output) | High |
| Event type | Election, disaster, crime, announcement | High |
| Geographic focus | Country/region codes from NER or explicit mentions | Medium |
| Temporal markers | Recent, historical, date-specific | Medium |
| Sentiment polarity | Positive/negative/neutral hash | Low |
| Key entity cluster | Top 3 entities hashed together | Medium |

### Algorithm Options

**Option A: LSH of embeddings**
1. Run text through a lightweight embedding model (or API)
2. Apply Locality-Sensitive Hashing to project to 128 bits
3. Semantically similar texts → similar bit patterns

**Option B: Topic model hash**
1. Run LDA/NMF topic model
2. Hash top-K topic weights
3. Simpler, no ML inference required

**Option C: Entity + category composite**
1. Hash(category) XOR Hash(top_entities) XOR Hash(geo) XOR Hash(date_bucket)
2. Deterministic, fast, no ML required

### What It Detects

- ✓ Same breaking news event across sources
- ✓ Topic clusters (all election coverage)
- ✓ Related stories (same incident, different angles)
- ✓ Cross-language matches (if using multilingual embeddings)

### Threshold

**≤ 30 bits different** = topically related

---

## Band 4: RESERVED (128 bits) — UNUSED

**Purpose**: Future expansion without schema migration.

### Potential Future Uses

| Candidate Signal | Description |
|------------------|-------------|
| Image fingerprint | pHash/dHash of primary article image |
| Author signature | Hash of byline / author patterns |
| Source credibility | Hash of domain reputation signals |
| Schema.org hash | Structured data fingerprint |
| Social signals | Engagement pattern fingerprint |
| Reading level | Flesch-Kincaid or similar hash |

### Current State

- **Filled with**: `0x00` (all zeros)
- **Distance impact**: Zero-filled bands contribute 0 to Hamming distance when compared
- **Activation**: Fill in when feature is implemented; no schema change needed

---

## Implementation Plan

### Phase 1: Structural Only (MVP)

```
Signature: [128 structural][0x00 × 48]
Storage:   64 bytes per page (future-proof)
Compare:   Only first 128 bits (mask = 0x01)
```

- Implement C++ N-API addon with SIMD Hamming distance
- Store full 64 bytes in DB, but only populate first 16
- Achieves: ~50M pairs/sec comparison speed

### Phase 2: Add Content Band

```
Signature: [128 structural][128 content][0x00 × 32]
Compare:   First 256 bits (mask = 0x03)
```

- Requires text extraction pipeline
- Backfill existing pages (batch job)
- Achieves: Syndication detection, duplicate articles

### Phase 3: Add Semantic Band (Optional)

```
Signature: [128 structural][128 content][128 semantic][0x00 × 16]
Compare:   First 384 bits (mask = 0x07), or selectively
```

- Requires topic classification or embeddings
- Most complex, highest value for "same event" clustering

---

## Query Patterns

### Band Mask for Different Use Cases

| Query Type | Band Mask | Bands Used | Use Case |
|------------|-----------|------------|----------|
| Exact/near duplicate | `0x01` | Structural only | Deduplication |
| Same article | `0x03` | Structural + Content | Syndication detection |
| Same template | `0x01` | Structural only | CMS fingerprinting |
| Same event | `0x04` or `0x07` | Semantic (± others) | News clustering |
| Full similarity | `0x0F` | All bands | Comprehensive match |

### Distance Thresholds

| Match Type | Max Hamming Distance | Notes |
|------------|---------------------|-------|
| Near-duplicate | ≤ 10 (128-bit) | Very strict |
| Structurally similar | ≤ 20 (128-bit) | Same template |
| Content similar | ≤ 25 (128-bit) | Same article text |
| Topically related | ≤ 30 (128-bit) | Same event/topic |
| Full match (512-bit) | ≤ 80 | All bands weighted |

---

## C++ N-API Addon Design

### Module: `sigcluster`

```javascript
const sig = require('sigcluster');

// Compute signature from HTML
const signature = sig.compute(html, {
  bands: ['structural'],        // Which bands to populate
  options: { /* band-specific */ }
});

// Batch distance calculation
const distances = sig.batchDistance(signatures, targetSignature, {
  bandMask: 0x03,  // Compare structural + content
  threshold: 25    // Early-exit optimization
});

// Cluster batch
const clusters = sig.cluster(signatures, {
  threshold: 20,
  algorithm: 'union-find'
});
```

### Performance Targets (Updated with Actual Measurements)

| Operation | Target | Actual | Notes |
|-----------|--------|--------|-------|
| Compute signature | < 1ms | TBD | DOM parsing is the bottleneck |
| Single distance (512-bit) | < 10ns | ~135ns | POPCNT × 8 + XOR × 8 |
| Batch 10K×10K | < 1 sec | **200ms** | 250M pairs/sec achieved |
| 2K×2K all-pairs | — | **8ms** | 250M pairs/sec |
| Thread scaling | Linear | 1.8x@8t | Memory-bound beyond 8 threads |

### SIMD Strategy

- **AVX2**: Process 4 × 64-bit words in parallel
- **AVX-512**: Process 8 × 64-bit words (full signature in one pass)
- **Fallback**: Scalar POPCNT for compatibility

---

## Storage Options

### Option A: Store Full Signatures (64MB / 1M pages)

```sql
ALTER TABLE pages ADD COLUMN cluster_sig BLOB(64);
CREATE INDEX idx_cluster_sig ON pages(cluster_sig);
```

- Pro: Fast re-clustering, band-specific queries
- Con: 64MB for 1M pages

### Option B: Store Cluster ID Only (4MB / 1M pages)

```sql
ALTER TABLE pages ADD COLUMN cluster_id INTEGER;
ALTER TABLE clusters ADD COLUMN exemplar_sig BLOB(64);
```

- Pro: Minimal storage
- Con: Must recompute signature to verify

### Option C: Hybrid (Recommended)

- Store cluster_id on all pages (4 bytes)
- Store full signature on exemplars only (~10K × 64 = 640KB)
- Recompute signature on-demand for new pages

---

## Open Questions

1. **TF-IDF source**: Use global corpus stats or per-site stats for content band?
2. **Semantic band algorithm**: LSH embeddings vs topic model vs entity composite?
3. **Incremental updates**: How to handle page content changes over time?
4. **Cross-language**: Worth pursuing multilingual semantic band?
5. **Image fingerprinting**: Priority for reserved band?

---

## Quick-Win: C++ Native Addon for Analysis Speedups

### Why Now?

Even before implementing full 512-bit SimHash clustering, a C++ addon can provide **immediate speedups** for existing analysis tasks:

1. **Hamming distance** — Current JS: ~10M pairs/sec → C++ SIMD: ~50-100M pairs/sec (5-10x)
2. **Popcount** — Core operation for bit vector comparison
3. **Batch operations** — Process arrays of signatures in single call (avoid JS↔C++ overhead)
4. **SimHash computation** — Weighted hashing for future signature generation

### Proposed Module: `src/native/sigcluster`

```
src/native/sigcluster/
├── binding.gyp           # Node-gyp build config
├── package.json          # Optional: for npm link during dev
├── src/
│   ├── hamming.cc        # SIMD popcount + Hamming distance
│   ├── simhash.cc        # SimHash computation (future)
│   └── addon.cc          # N-API bindings
├── include/
│   └── simd_compat.h     # AVX2/NEON/fallback detection
└── test/
    └── hamming.test.js   # Node.js test harness
```

### API Draft

```javascript
const sigcluster = require('./src/native/sigcluster');

// Hamming distance between two Buffers (any size)
const dist = sigcluster.hamming(bufferA, bufferB);  // → number

// Batch: distance from one signature to N signatures
const distances = sigcluster.batchHamming(target, signaturesArray);  // → Uint8Array

// Find all pairs below threshold (returns sparse list)
const pairs = sigcluster.findSimilarPairs(signatures, threshold);  // → [{i, j, dist}, ...]

// Future: SimHash computation
const sig = sigcluster.simhash(tokens, weights, bits);  // → Buffer
```

### SIMD Intrinsics (Portable)

```cpp
#include <immintrin.h>  // AVX2
// or <arm_neon.h>      // ARM

inline uint32_t popcount64(uint64_t x) {
#if defined(__POPCNT__)
    return __builtin_popcountll(x);  // HW instruction
#else
    // Fallback: bit manipulation
    x = x - ((x >> 1) & 0x5555555555555555);
    x = (x & 0x3333333333333333) + ((x >> 2) & 0x3333333333333333);
    return (((x + (x >> 4)) & 0x0f0f0f0f0f0f0f0f) * 0x0101010101010101) >> 56;
#endif
}

uint32_t hamming512(const uint64_t* a, const uint64_t* b) {
    uint32_t dist = 0;
    for (int i = 0; i < 8; i++) {  // 8 × 64 = 512 bits
        dist += popcount64(a[i] ^ b[i]);
    }
    return dist;
}
```

### Build Configuration (binding.gyp)

```json
{
  "targets": [{
    "target_name": "sigcluster",
    "sources": ["src/addon.cc", "src/hamming.cc"],
    "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")"],
    "dependencies": ["<!(node -p \"require('node-addon-api').gyp\")"],
    "cflags!": ["-fno-exceptions"],
    "cflags_cc!": ["-fno-exceptions"],
    "cflags": ["-mavx2", "-mpopcnt"],  // x86_64
    "conditions": [
      ["OS=='win'", {
        "msvs_settings": {
          "VCCLCompilerTool": { "AdditionalOptions": ["/arch:AVX2"] }
        }
      }]
    ]
  }]
}
```

### Implementation Status: ✅ COMPLETE

The `sigcluster` native addon has been implemented and benchmarked:

**Location**: `src/native/sigcluster/`

**Files**:
- `binding.gyp` — Node-gyp config with OpenMP and hardware popcount
- `include/simd_compat.h` — Portable popcount (MSVC `__popcnt64`, GCC `__builtin_popcountll`)
- `src/hamming.cc` — Core algorithms with OpenMP parallelization
- `src/addon.cc` — N-API bindings for all operations
- `index.js` — JS wrapper with automatic fallback

**API**:
```javascript
const sigcluster = require('./src/native/sigcluster');

sigcluster.isAvailable();                    // true if native module loaded
sigcluster.hamming(bufA, bufB);              // Single distance
sigcluster.batchHamming(target, array);      // 1-to-N distances
sigcluster.findSimilarPairs(sigs, thresh);   // N² with threshold filter
sigcluster.getThreadCount();                 // OpenMP threads available
sigcluster.setThreadCount(n);                // Limit parallelism
```

**Benchmark Results** (Windows, AMD 16-core, 32 threads):

| Operation | JavaScript | C++ Native | Speedup |
|-----------|------------|------------|---------|
| Single 512-bit | 249ms/1M | 135ms/1M | 1.8x |
| Batch 50K | 8ms | 4ms | 2.0x |
| 500 pairs (125K) | 26ms (4.8M/s) | 2ms (62M/s) | 13x |
| 1000 pairs (500K) | 116ms (4.3M/s) | 3ms (167M/s) | 39x |
| 2000 pairs (2M) | 357ms (5.6M/s) | 8ms (250M/s) | **45x** |

**OpenMP Scaling** (3000 signatures, 4.5M pairs):

| Threads | Time | Pairs/sec | Speedup |
|---------|------|-----------|---------|
| 1 | 32ms | 141M | 1.0x |
| 4 | 20ms | 225M | 1.6x |
| 8 | 18ms | **250M** | 1.8x |
| 16+ | ~21ms | ~214M | (memory-bound) |

**Key Insights**:
- Peak performance at 8 threads; beyond that memory bandwidth is the bottleneck
- 250M pairs/sec = 16 billion pairs in 64 seconds
- For 100K pages: 5 billion pairs in 20 seconds
- The addon gracefully falls back to JavaScript if native module fails to load

### Integration Path

1. ~~**Week 1**: Create `src/native/sigcluster` with pure popcount/hamming~~ ✅ DONE
2. ~~**Week 2**: Add SIMD detection and OpenMP, benchmark vs JS baseline~~ ✅ DONE (45x speedup)
3. **Next**: Integrate into batch-cluster-lab.js as optional accelerator
4. **Future**: Add SimHash computation when ready to replace SkeletonHash

### Precedent: better-sqlite3

The existing `better-sqlite3` dependency proves the toolchain works:

```bash
npm ls better-sqlite3
# copilot-dl-news@1.0.0
# └── better-sqlite3@12.5.0

# Its build uses similar techniques:
# - node-gyp
# - Native C++ with node-addon-api
# - Prebuilt binaries via prebuildify
```

---

## Related Documents

- [Extensible 512-bit Signatures SVG](../diagrams/extensible-512bit-signatures.svg)
- [Signature Size Trade-offs SVG](../diagrams/signature-size-tradeoffs.svg)
- [Batch Compute Clustering SVG](../diagrams/batch-compute-clustering.svg)
- [Lab: Batch Clustering Experiment](../../labs/batch-clustering/batch-cluster-lab.js)
