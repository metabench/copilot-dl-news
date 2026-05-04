# Pending Lab Experiments

These experiments are ready for execution. Each has a clear objective, methodology, and expected output.

---

## Experiment 1: Candidate Generation vs Filtering Benchmark

### Objective
Measure time spent in candidate generation vs disambiguation separately to identify optimization targets.

### Hypothesis
The `buildChains()` and `chooseBestChain()` functions consume >80% of URL extraction time.

### Methodology
1. Create `benchmarks/candidate-vs-filter.bench.js`
2. Use the existing 2000-URL fixture
3. Measure these phases independently:
   - **Phase A**: URL parsing + segment tokenization (baseline)
   - **Phase B**: Slug lookup in Map (candidate generation)
   - **Phase C**: `buildChains()` call
   - **Phase D**: `chooseBestChain()` call
4. Run each phase in isolation using the internal functions from `place-extraction.js`

### Key Functions to Import
From `src/analysis/place-extraction.js`:
- `resolveUrlPlaces(url, matchers, options)` - the main function (exported)
- Internal functions NOT exported: `analyzeSegment`, `buildChains`, `chooseBestChain`

**Approach**: Instrument `resolveUrlPlaces` by measuring time before/after internal phases.
You'll need to either:
1. **Option A**: Copy the function locally and add timing instrumentation, OR
2. **Option B**: Add temporary exports to `place-extraction.js` for benchmarking, then remove them

**Recommended: Option A** - Create a local instrumented version to avoid modifying production code.

### Expected Output
```json
{
  "phases": {
    "url_parsing": { "avgMs": "...", "percentOfTotal": "..." },
    "segment_analysis": { "avgMs": "...", "percentOfTotal": "..." },
    "build_chains": { "avgMs": "...", "percentOfTotal": "..." },
    "choose_best": { "avgMs": "...", "percentOfTotal": "..." }
  },
  "bottleneck": "build_chains"  // or whichever is slowest
}
```

### Success Criteria
- Benchmark runs without errors
- Results saved to `results/candidate-vs-filter-YYYY-MM-DD.json`
- Clear identification of which phase is the bottleneck

---

## Experiment 2: Content Decompression Benchmark

### Objective
Measure the overhead of decompressing HTML from `content_storage.content_blob`.

### Hypothesis
Decompression adds <10% overhead compared to text extraction.

### Methodology
1. Create `benchmarks/content-decompression.bench.js`
2. Query 200 content_storage records with content_blob
3. Benchmark:
   - **A**: Raw blob retrieval from DB (just the query)
   - **B**: Decompression only (using existing compression utilities)
   - **C**: HTML parsing with JSDOM/linkedom
   - **D**: Text extraction with HtmlArticleExtractor

### Compression Utilities (found in codebase)
```javascript
// Primary decompression function
const { decompress } = require('../../../src/utils/compression');
// OR for full article workflow:
const { decompressArticleHtml } = require('../../../src/utils/articleCompression');

// Usage:
const algorithm = 'db_compressed';  // or look up from compression_types table
const html = decompress(contentBlob, algorithm).toString('utf-8');
```

### Database Query
```sql
SELECT cs.id, cs.content_blob, cs.uncompressed_size, ct.name as compression_type
FROM content_storage cs
JOIN compression_types ct ON cs.compression_type_id = ct.id
WHERE cs.content_blob IS NOT NULL
LIMIT 200
```

### Expected Output
```json
{
  "phases": {
    "db_fetch": { "avgMs": "...", "bytesPerSec": "..." },
    "decompress": { "avgMs": "...", "bytesPerSec": "..." },
    "html_parse": { "avgMs": "...", "bytesPerSec": "..." },
    "text_extract": { "avgMs": "...", "charsPerSec": "..." }
  },
  "totalPipeline": { "avgMs": "...", "articlesPerSec": "..." }
}
```

### Success Criteria
- Locate and use the correct decompression function
- Benchmark runs on 200 real content records
- Results saved to `results/content-decompression-YYYY-MM-DD.json`

---

## Experiment 3: Body Text Backfill Test

### Objective
Test the existing backfill infrastructure and measure its throughput.

### Hypothesis
The existing `searchAdapter.updateArticleText()` can backfill >100 articles/second.

### Methodology
1. Create `benchmarks/body-text-backfill.bench.js`
2. Use `searchAdapter.getArticlesNeedingBackfill(limit)` to get candidates
3. For each article:
   - Get content_id
   - Retrieve and decompress HTML (use findings from Experiment 2)
   - Extract text with `HtmlArticleExtractor`
   - Call `searchAdapter.updateArticleText(id, { body_text, byline, authors })`
4. **DRY RUN MODE**: Do NOT actually write to DB unless `--fix` flag is passed
5. Measure throughput with and without actual writes

### Key Files
- `src/db/sqlite/v1/queries/searchAdapter.js` - has `updateArticleText` and `getArticlesNeedingBackfill`
- `src/utils/HtmlArticleExtractor.js` - text extraction
- `src/extraction/TemplateExtractor.js` - site-specific extraction

### Expected Output
```json
{
  "dryRun": true,
  "articlesProcessed": 100,
  "extractionOnly": { "avgMs": "...", "articlesPerSec": "..." },
  "withDbWrite": { "avgMs": "...", "articlesPerSec": "..." },
  "successRate": "95%",
  "failures": [{ "id": "...", "error": "..." }]
}
```

### Success Criteria
- Dry run completes without errors
- Throughput measured for extraction-only and with-write modes
- Results saved to `results/body-text-backfill-YYYY-MM-DD.json`

---

## Experiment 4: Title-Based Place Detection Quality

### Objective
Compare place detection quality between URL-only vs URL+title approaches.

### Hypothesis
Adding title analysis increases detection rate by >10% with minimal performance cost.

### Methodology
1. Create `benchmarks/title-boost-quality.bench.js`
2. Use the 2000-URL fixture
3. For each URL:
   - Get the title from `content_analysis.title`
   - Run URL-only detection → record places found
   - Run title detection → record additional places found
   - Run combined (URL + title) → record total unique places
4. Compare detection rates and measure overlap

### Expected Output
```json
{
  "sampleSize": 2000,
  "urlOnly": { "detectionRate": "72%", "avgPlaces": 0.95 },
  "titleOnly": { "detectionRate": "79%", "avgPlaces": 0.98 },
  "combined": { "detectionRate": "85%", "avgPlaces": 1.2 },
  "titleBoost": "+13% detection rate",
  "overlap": "60% of title places also found in URL",
  "performanceCost": "+0.1ms per article (title adds <1% overhead)"
}
```

### Success Criteria
- Quality comparison completed
- Overlap analysis between URL and title detections
- Results saved to `results/title-boost-quality-YYYY-MM-DD.json`

---

## File Structure

After experiments, the lab should have:

```
labs/db-access-patterns/
├── benchmarks/
│   ├── candidate-vs-filter.bench.js      # Experiment 1
│   ├── content-decompression.bench.js    # Experiment 2
│   ├── body-text-backfill.bench.js       # Experiment 3
│   ├── title-boost-quality.bench.js      # Experiment 4
│   ├── url-place-detection.bench.js      # Existing
│   └── content-place-detection.bench.js  # Existing
├── results/
│   ├── candidate-vs-filter-2026-01-04.json
│   ├── content-decompression-2026-01-04.json
│   ├── body-text-backfill-2026-01-04.json
│   └── title-boost-quality-2026-01-04.json
├── fixtures/
│   └── urls-with-content-2000.json       # Existing
├── EXPERIMENTS.md                         # This file
└── FINDINGS.md                            # Update with new findings
```

---

## Execution Order

**Recommended sequence:**
1. Experiment 1 (candidate-vs-filter) - identifies the bottleneck
2. Experiment 2 (content-decompression) - needed for Experiments 3 & 4
3. Experiment 4 (title-boost-quality) - quick win assessment
4. Experiment 3 (body-text-backfill) - if Experiment 2 shows feasible throughput

---

## Reference: Existing Benchmark Pattern

Use the existing benchmarks as templates. Key patterns:

```javascript
// Standard benchmark file structure
const JSON_OUTPUT = process.argv.includes('--json');
function log(...args) { if (!JSON_OUTPUT) console.log(...args); }

// Save results
const date = new Date().toISOString().slice(0, 10);
const resultsPath = path.join(__dirname, '../results', `<name>-${date}.json`);
fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));

// Close DB in finally block
try { ... } finally { db.close(); }
```
