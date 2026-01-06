# DB Access Patterns Lab

This lab benchmarks and demonstrates efficient database access patterns for the gazetteer and other high-volume tables.

## Purpose

1. **Measure baseline performance** — Understand current query costs
2. **Compare patterns** — Single vs batch, prepared vs ad-hoc, indexed vs unindexed
3. **Document best practices** — Reusable patterns for the whole project
4. **Catch regressions** — Run benchmarks before/after schema changes
5. **Place detection analysis** — URL vs content-based place detection

## Quick Start

```bash
# Check table sizes
node labs/db-access-patterns/check-sizes.js

# Check indexes and query plans
node labs/db-access-patterns/check-indexes.js

# Run URL-only place detection benchmark (2000 URLs)
node labs/db-access-patterns/benchmarks/url-place-detection.bench.js

# Run content-based place detection benchmark
node labs/db-access-patterns/benchmarks/content-place-detection.bench.js

# Run specific benchmarks
node labs/db-access-patterns/benchmarks/gazetteer-lookup.bench.js
node labs/db-access-patterns/benchmarks/prepared-statements.bench.js
```

## Key Findings (Updated 2026-01-04)

See [FINDINGS.md](FINDINGS.md) for detailed analysis.

### LIKE Query Optimization

**Critical Finding: SQLite LIKE queries CANNOT use B-tree indexes.**

```sql
-- LIKE with prefix → FULL TABLE SCAN (slow!)
SELECT * FROM place_names WHERE name LIKE 'London%'
-- → SCAN place_names

-- Exact match → USES INDEX (fast!)
SELECT * FROM place_names WHERE normalized = 'london'
-- → SEARCH place_names USING INDEX idx_place_names_norm
```

**Recommendation**: Use normalized exact match instead of LIKE when possible.

### Place Detection Benchmarks

| Pattern | Throughput | Notes |
|---------|------------|-------|
| URL parsing | 500K-640K/sec | Just parsing, no lookup |
| Slug lookup (Map) | 9-12M/sec | In-memory, O(1) |
| Full URL extraction | 75-260/sec | Bottleneck: chain building |
| Title detection | 30K/sec | Fastest text analysis |
| Body text detection | 1.5K/sec | 12M chars/sec |
| Full pipeline | 250/sec | URL + title + body |

### Key Insights

1. **In-memory lookups are extremely fast** (~10M ops/sec)
2. **URL chain analysis is the bottleneck** - not database access
3. **Title detection is cheap** - add it for minimal overhead
4. **Body text processing** runs at 12M chars/sec
5. **content_analysis.body_text is NULL** - requires HTML parsing for real content

| Pattern | Ops/sec | Avg (ms) | Notes |
|---------|---------|----------|-------|
| Single lookup (prepared) | 1,042 | 0.96 | Baseline - 20 queries per op |
| Single lookup (ad-hoc) | 694 | 1.44 | 1.5x slower - compile overhead |
| Batch IN clause (20 names) | 794 | 1.26 | **Slower than single!** |
| Normalized name lookup | 1,923 | 0.52 | 1.85x faster - better index |
| Batch normalized | 1,000 | 1.00 | Similar to batch exact |
| Transaction batch write | 12,500 | 0.08 | Very fast with transaction |

### Surprising Finding: Single Beats Batch

For this dataset (732K place names), **single lookups with prepared statements outperform batch IN clauses**. This is because:

1. SQLite's B-tree index is highly optimized for single-key lookups
2. The IN clause requires the query planner to handle multiple values
3. The ORDER BY + LIMIT adds complexity to batch queries

**Recommendation**: For gazetteer lookups with <50 names, use prepared single lookups.

### Normalized Column is Fastest

The `normalized` column (lowercase, trimmed) has a dedicated index and lookups are nearly 2x faster than exact name lookups. **Always normalize input before lookup.**

## Database Stats

- `places`: 13,688 rows
- `place_names`: 732,785 rows (avg 53 names per place)
- `place_hierarchy`: 10,369 rows

## Patterns Demonstrated

### 1. Prepared Statements (REQUIRED)
Always use prepared statements for repeated queries:

```javascript
// ❌ BAD - compiles query every time
for (const name of names) {
  db.prepare(`SELECT * FROM place_names WHERE name = ?`).get(name);
}

// ✅ GOOD - prepare once, execute many
const stmt = db.prepare(`SELECT * FROM place_names WHERE name = ?`);
for (const name of names) {
  stmt.get(name);
}
```

### 2. Batch Lookups with IN Clause
For small batches (< 100 items):

```javascript
const placeholders = names.map(() => '?').join(',');
const stmt = db.prepare(`
  SELECT * FROM place_names 
  WHERE name IN (${placeholders})
`);
const results = stmt.all(...names);
```

### 3. Batch Lookups with Temp Table
For large batches (> 100 items):

```javascript
db.exec('CREATE TEMP TABLE IF NOT EXISTS lookup_batch (name TEXT)');
const insert = db.prepare('INSERT INTO lookup_batch VALUES (?)');
const insertMany = db.transaction((names) => {
  db.exec('DELETE FROM lookup_batch');
  for (const name of names) insert.run(name);
});
insertMany(names);

const results = db.prepare(`
  SELECT pn.* FROM place_names pn
  JOIN lookup_batch lb ON pn.name = lb.name
`).all();
```

### 4. Index-Aware Queries
Know which indexes exist and use them:

```javascript
// Uses idx_place_names_norm (normalized name search)
db.prepare(`SELECT * FROM place_names WHERE name_norm = ?`).get(normalizedName);

// Uses idx_place_names_name (exact name search)
db.prepare(`SELECT * FROM place_names WHERE name = ?`).get(exactName);

// ⚠️ LIKE with leading wildcard - NO index!
db.prepare(`SELECT * FROM place_names WHERE name LIKE ?`).all('%' + term + '%');

// ✅ LIKE prefix only - CAN use index
db.prepare(`SELECT * FROM place_names WHERE name LIKE ?`).all(term + '%');
```

### 5. Transactions for Multiple Writes
Group writes in transactions:

```javascript
const insert = db.prepare(`INSERT INTO place_names (place_id, name) VALUES (?, ?)`);
const insertMany = db.transaction((rows) => {
  for (const row of rows) {
    insert.run(row.placeId, row.name);
  }
});
insertMany(rowsToInsert); // Single transaction
```

## Files

- `check-sizes.js` — Quick table size check
- `run-benchmarks.js` — Run all benchmarks and save results
- `benchmarks/gazetteer-fast.bench.js` — Core lookup pattern benchmarks
- `benchmarks/candidate-generation.bench.js` — Disambiguation pipeline simulation
- `benchmarks/quick-test.js` — Simple sanity check
- `results/` — Benchmark results (JSON, timestamped)
- `__tests__/benchmarks.test.js` — Test coverage for benchmark infrastructure

## Candidate Generation Performance

Simulating the full disambiguation pipeline (Chapter 11-13):

| Pattern | Ops/sec | Articles/sec | Notes |
|---------|---------|--------------|-------|
| Sequential candidates | ~1,000 | ~5,000 | Simple lookup |
| Candidates + hierarchy | ~400 | ~2,000 | Adds parent queries |
| Deduped lookup | ~1,200 | ~6,000 | Avoids repeat queries |
| Full disambiguation | ~500 | ~2,500 | Complete pipeline |

### Pipeline Recommendations

Based on benchmarks, the DisambiguationService should:

1. **Pre-normalize all mentions** before lookup (use `normalized` column)
2. **Dedupe normalized mentions** to avoid repeat queries
3. **Limit hierarchy fetches** to top 3 candidates only
4. **Cache canonical names** (they rarely change)
5. **Lazy-load hierarchy** only when scoring requires it

At ~2,500 articles/second, we can process a typical news feed in real-time.
