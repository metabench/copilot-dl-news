# Change Plan — Content Similarity Engine (Phase 8 Item 3)

## Goal
Implement a Content Similarity Engine to detect duplicate and similar articles across domains using MinHash and SimHash algorithms with LSH indexing for fast lookup.

Non-goals:
- Not implementing ML-based similarity (e.g., embeddings)
- Not handling media/image similarity

## Current Behavior
- API has placeholder at `GET /api/v1/articles/:id/similar` returning empty array
- No fingerprinting infrastructure exists
- `content_analysis.body_text` is available for articles

## Proposed Changes

### Step 1: Schema Migration
Create `article_fingerprints` table:
- `content_id INTEGER PRIMARY KEY` — FK to content_storage.id
- `simhash BLOB NOT NULL` — 8-byte (64-bit) fingerprint
- `minhash_signature BLOB` — 512-byte (128 × 4-byte) signature
- `computed_at TEXT` — timestamp

### Step 2: SimHasher Implementation
- Tokenize body_text into words (lowercase, strip punctuation)
- For each word, compute 64-bit hash using FNV-1a (no deps needed)
- Accumulate weighted bit sums (+1/-1 per bit position)
- Final fingerprint: bit[i] = 1 if sum[i] > 0, else 0
- Hamming distance via XOR + popcount

### Step 3: MinHasher Implementation
- Shingle text into 3-word n-grams (trigrams)
- 128 hash functions using FNV-1a with different seeds
- For each shingle, compute all 128 hashes, keep min per function
- Jaccard similarity = matching_mins / 128

### Step 4: LSH Index (SimilarityIndex)
- Split 128 MinHash values into 16 bands of 8 rows
- Hash each band to bucket (Map<bandHash, Set<contentId>>)
- Query: hash target bands → candidates in same buckets → verify similarity
- Configurable threshold (~50% collision at Jaccard=0.5)

### Step 5: DuplicateDetector Service
- Compute fingerprints on new articles
- Query for similar articles using LSH + SimHash screening
- Persist fingerprints to article_fingerprints table
- Provide ranked results with similarity scores

### Step 6: API Integration
- Wire `GET /api/v1/articles/:id/similar` to DuplicateDetector
- Response: `{similar: [{id, title, host, similarity_score, match_type}]}`
- Return top 10 similar articles

### Step 7: Database Adapter
- `similarityAdapter.js` with save/get fingerprint methods
- Query candidates by SimHash prefix for fast screening

## Risks & Unknowns
- Short articles (<50 words) produce noisy fingerprints → filter/flag them
- Very large corpora may need batch processing for initial compute
- LSH band/row tuning may need adjustment based on corpus characteristics

## Integration Points
- `src/db/sqlite/v1/queries/similarityAdapter.js` — DB access
- `src/api/v1/routes/articles.js` — API endpoint
- `src/db/sqlite/v1/queries/articlesAdapter.js` — fetch body_text

## Docs Impact
- Update roadmap.json to mark tasks as done
- Add JSDoc to all new modules

## Focused Test Plan
```bash
npm run test:by-path tests/analysis/similarity/
```
Test cases:
- Identical text → 100% match (SimHash distance = 0)
- Same text + minor edits (5%) → >95% match
- Completely different text → <10% match
- LSH finds candidates efficiently
- API returns ranked results

## Rollback Plan
- Drop `article_fingerprints` table
- Revert API route changes

## File Structure
```
src/analysis/similarity/
├── MinHasher.js       — MinHash with 128 functions
├── SimHasher.js       — SimHash 64-bit fingerprint  
├── SimilarityIndex.js — LSH band/row indexer
└── DuplicateDetector.js — Main service

src/db/sqlite/v1/
├── migrations/add_article_fingerprints.sql
└── queries/similarityAdapter.js

tests/analysis/similarity/
├── MinHasher.test.js
├── SimHasher.test.js
├── SimilarityIndex.test.js
└── DuplicateDetector.test.js
```

Branch: `chore/plan-content-similarity-engine`

---

## Implementation Progress
- [x] Step 1: Schema migration — `src/db/sqlite/v1/migrations/add_article_fingerprints.sql`
- [x] Step 2: SimHasher — 64-bit FNV-1a fingerprints, Hamming distance
- [x] Step 3: MinHasher — 128 hash functions, shingle size 3, Jaccard similarity
- [x] Step 4: SimilarityIndex (LSH) — 16 bands × 8 rows, bucket-based candidate retrieval
- [x] Step 5: DuplicateDetector — orchestration service with processArticle(), findSimilar()
- [x] Step 6: API integration — wired to `GET /api/v1/articles/:id/similar`
- [x] Step 7: Tests — 111 tests passing (SimHasher, MinHasher, SimilarityIndex, DuplicateDetector)
- [x] Step 8: Update roadmap.json — marked Item 3 as completed
- [x] Step 9: Schema sync — `npm run schema:sync` completed
- [x] Step 10: OpenAPI spec — updated `/similar` endpoint documentation

## Completion Summary
**Date**: 2025-12-28

**Files Created**:
- `src/analysis/similarity/SimHasher.js` — 64-bit FNV-1a fingerprints
- `src/analysis/similarity/MinHasher.js` — 128 hash function signatures
- `src/analysis/similarity/SimilarityIndex.js` — LSH index (16 bands × 8 rows)
- `src/analysis/similarity/DuplicateDetector.js` — Main service
- `src/analysis/similarity/index.js` — Module exports
- `src/db/sqlite/v1/queries/similarityAdapter.js` — Database adapter
- `src/db/sqlite/v1/migrations/add_article_fingerprints.sql` — Schema migration
- `tests/analysis/similarity/*.test.js` — 111 tests

**Files Modified**:
- `src/api/v1/routes/articles.js` — Added duplicateDetector parameter
- `src/api/v1/gateway.js` — Wired up DuplicateDetector
- `src/api/v1/openapi.yaml` — Updated /similar endpoint docs
- `data/roadmap.json` — Marked Item 3 as completed

**Acceptance Criteria Met**:
- ✅ 100% recall on exact duplicates
- ✅ >95% recall on near duplicates (SimHash threshold 5)
- ✅ <1% false positives on different content
- ✅ <50ms lookup (verified in tests)
