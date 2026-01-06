# Chapter 15: Performance Targets

> **Implementation Status**: ⚠️ Targets defined, benchmark suite partially implemented.

## Codebase Quick Reference

| Component | File Location | Status |
|-----------|---------------|--------|
| Analysis timing | `labs/analysis-observable/analysis-observable.js` (RollingWindow) | ✅ Complete |
| Throughput tracking | `src/crawler/telemetry/` | ✅ Complete |
| Task events DB | `src/db/TaskEventWriter.js` | ✅ Complete |
| Memory monitoring | `src/crawler/telemetry/TelemetryIntegration.js` | ✅ Complete |
| Benchmark fixtures | Not yet created | ❌ Gap |

## Throughput Goals

### Crawl Throughput

| Metric | Current | Target | Method |
|--------|---------|--------|--------|
| Pages/minute (quick) | ~30 | 60+ | Parallel fetch |
| Pages/minute (deep) | ~10 | 20+ | Balanced concurrency |
| Domains/hour | ~50 | 100+ | Domain rotation |
| Bytes/second | ~500KB | 1MB+ | Connection pooling |

### Analysis Throughput

| Metric | Current | Target | Method |
|--------|---------|--------|--------|
| Pages/second (XPath) | 5-10 | 20+ | Cached patterns |
| Pages/second (JSDOM) | 0.03-0.1 | 0.5+ | Streaming parser |
| Batch size | 100 | 1000+ | Memory optimization |
| Concurrent workers | 1 | 4+ | Worker pool |

### Disambiguation Throughput

| Metric | Current | Target | Method |
|--------|---------|--------|--------|
| Lookups/second | 100 | 500+ | In-memory index |
| Batch disambiguate | 10/sec | 100/sec | Bulk queries |
| Cache hit rate | - | >80% | LRU cache |

---

## Latency Targets

### API Response Times

| Endpoint | Current | P50 Target | P95 Target |
|----------|---------|------------|------------|
| `/health` | 5ms | 5ms | 10ms |
| `/jobs/list` | 50ms | 20ms | 50ms |
| `/jobs/:id` | 100ms | 30ms | 100ms |
| `/jobs/start` | 200ms | 100ms | 200ms |

### Database Query Times

| Query Type | Current | Target | Method |
|------------|---------|--------|--------|
| Single lookup by URL | 5ms | 2ms | Covering index |
| Batch insert (100) | 500ms | 100ms | Prepared statements |
| Full-text search | 200ms | 50ms | FTS5 index |
| Aggregation query | 1s | 100ms | Materialized views |

### Analysis Stage Times

| Stage | Current | Target | Method |
|-------|---------|--------|--------|
| Decompression | 5ms | 2ms | Streaming zstd |
| XPath extraction | 50ms | 20ms | Compiled patterns |
| JSDOM parse | 20s | 5s | Alternative parser |
| Classification | 50ms | 20ms | Batch rules |
| Fact extraction | 100ms | 30ms | Combined pass |
| Place detection | 200ms | 50ms | Optimized NER |

---

## Resource Budgets

### Memory

```
Daemon Process
├── Base overhead        50 MB
├── Connection pool      20 MB
├── Job registry         10 MB
├── Active crawl state   100 MB  (per job)
└── Buffer                20 MB
                         ─────────
                         ~200 MB baseline
                         +100 MB per active job

Analysis Process
├── Base overhead         50 MB
├── JSDOM instance       300 MB  (worst case)
├── Result buffer        100 MB
├── Gazetteer index      200 MB  (if loaded)
└── Buffer                50 MB
                         ─────────
                         ~700 MB peak
                         Target: <500 MB stable
```

### Disk

| Data Type | Growth Rate | Retention | Budget |
|-----------|-------------|-----------|--------|
| Raw HTML (compressed) | 50MB/day | Indefinite | 20GB |
| Analysis results | 5MB/day | Indefinite | 2GB |
| Telemetry events | 10MB/day | 30 days | 300MB |
| Logs | 20MB/day | 7 days | 200MB |
| Temp files | Variable | 1 day | 1GB |

### CPU

| Operation | CPU Target | Strategy |
|-----------|------------|----------|
| Crawl coordination | <5% | Event-driven |
| HTML fetch | <10% | Async I/O |
| Decompression | <20% | Native zstd |
| DOM parsing | <80% | Optimize/parallelize |
| Classification | <10% | Simple rules |
| Database writes | <5% | Batching |

---

## Accuracy Targets

### Extraction Accuracy

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Title extraction | ~95% | >99% | Manual audit |
| Body extraction | ~80% | >95% | Manual audit |
| Date extraction | ~70% | >90% | Parsed validation |
| Author extraction | ~60% | >80% | Manual audit |

### Classification Accuracy

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Article vs non-article | ~90% | >98% | Manual audit |
| Category assignment | ~70% | >85% | Manual audit |
| Duplicate detection | ~80% | >95% | SimHash validation |

### Disambiguation Accuracy

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Precision | ~70% | >90% | Ground truth |
| Recall | ~60% | >85% | Ground truth |
| F1 Score | ~65% | >87% | Computed |
| Confidence calibration | Unknown | ±10% | Statistical |

---

## Benchmark Suite

### Crawl Benchmarks

```javascript
// benchmarks/crawl-throughput.bench.js
const suite = new BenchmarkSuite('Crawl Throughput');

suite.add('Quick discovery (10 pages)', async () => {
  const result = await crawl('https://example.com', {
    operation: 'quickDiscovery',
    maxPages: 10
  });
  return result.pageCount;
}, {
  target: { throughput: 1.0, unit: 'pages/sec' },
  timeout: 30000
});

suite.add('Site explorer (50 pages)', async () => {
  const result = await crawl('https://example.com', {
    operation: 'siteExplorer',
    maxPages: 50
  });
  return result.pageCount;
}, {
  target: { throughput: 0.5, unit: 'pages/sec' },
  timeout: 120000
});
```

### Analysis Benchmarks

```javascript
// benchmarks/analysis-throughput.bench.js
const suite = new BenchmarkSuite('Analysis Throughput');

suite.add('XPath extraction (100 pages)', async () => {
  const pages = await loadTestPages(100, 'xpath-compatible');
  const results = await analyzePages(pages);
  return results.length;
}, {
  target: { throughput: 10.0, unit: 'pages/sec' }
});

suite.add('JSDOM extraction (10 pages)', async () => {
  const pages = await loadTestPages(10, 'jsdom-required');
  const results = await analyzePages(pages);
  return results.length;
}, {
  target: { throughput: 0.5, unit: 'pages/sec' }
});

suite.add('Mixed extraction (50 pages)', async () => {
  const pages = await loadTestPages(50, 'mixed');
  const results = await analyzePages(pages);
  return results.length;
}, {
  target: { throughput: 2.0, unit: 'pages/sec' }
});
```

### Disambiguation Benchmarks

```javascript
// benchmarks/disambiguation-accuracy.bench.js
const suite = new BenchmarkSuite('Disambiguation Accuracy');

suite.add('Ground truth corpus', async () => {
  const corpus = await loadGroundTruth();
  const results = await disambiguateAll(corpus.mentions);
  
  const correct = results.filter((r, i) => 
    r.resolvedPlaceId === corpus.expected[i]
  ).length;
  
  return {
    precision: correct / results.length,
    recall: correct / corpus.expected.length,
    f1: 2 * (precision * recall) / (precision + recall)
  };
}, {
  target: { f1: 0.87 }
});
```

---

## Monitoring Dashboards

### Real-Time Metrics

```
┌────────────────────────────────────────────────────────────┐
│ System Health Dashboard                                     │
├──────────────────────────┬─────────────────────────────────┤
│ Crawl Rate               │ ████████░░░░░░░░ 45/min (75%)   │
│ Analysis Rate            │ ██████████░░░░░░ 8/sec (80%)    │
│ Memory Usage             │ ██████░░░░░░░░░░ 350MB (47%)    │
│ Disk Usage               │ ████░░░░░░░░░░░░ 8GB (40%)      │
│ Error Rate               │ █░░░░░░░░░░░░░░░ 0.5% ✓         │
│ DB Connection Pool       │ ████████████░░░░ 6/10 (60%)     │
├──────────────────────────┴─────────────────────────────────┤
│ Active Jobs: 2  |  Queued: 0  |  Completed Today: 15       │
└────────────────────────────────────────────────────────────┘
```

### Performance Trends

```
Extraction Accuracy (7-day trend)
      │
  95% ─┤                           ●───●───●
      │                     ●───●
  90% ─┤               ●───●
      │         ●───●
  85% ─┤   ●───●
      │───●
  80% ─┤
      └────┬────┬────┬────┬────┬────┬────┬───
         Mon  Tue  Wed  Thu  Fri  Sat  Sun

Throughput (24-hour)
      │
  15/s─┤       ●
      │     ●   ●
  10/s─┤   ●       ●   ●       ●
      │ ●           ●   ●   ●   ●
   5/s─┤               ●   ●       ●
      │                           ●
   0/s─┤────────────────────────────────────
      00:00     06:00     12:00     18:00
```

---

## Performance Testing Protocol

### Before Optimization

1. **Establish baseline**
   ```bash
   npm run bench:all -- --json > baselines/$(date +%Y-%m-%d).json
   ```

2. **Profile bottlenecks**
   ```bash
   node --prof analysis.js
   node --prof-process isolate-*.log > profile.txt
   ```

3. **Document current state**
   - Record metrics
   - Screenshot dashboards
   - Note resource usage

### During Optimization

1. **Make focused changes**
   - One optimization at a time
   - Measure after each change
   - Compare to baseline

2. **Run targeted benchmarks**
   ```bash
   npm run bench:analysis -- --json > after-optimization.json
   ```

3. **Verify no regressions**
   ```bash
   npm run bench:compare baselines/2025-01-05.json after-optimization.json
   ```

### After Optimization

1. **Full benchmark run**
   ```bash
   npm run bench:all
   ```

2. **Update targets if needed**
   - If targets exceeded, raise them
   - If new bottleneck found, document it

3. **Document changes**
   - What was optimized
   - Measured improvement
   - Any trade-offs

---

## Scaling Considerations

### Horizontal Scaling

```
Current: Single Node
┌─────────────────────────────────────┐
│ Daemon + Crawler + Analysis + DB    │
└─────────────────────────────────────┘

Future: Distributed
┌─────────────┐     ┌─────────────┐
│ Coordinator │────▶│ Job Queue   │
└─────────────┘     └─────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Worker 1    │    │ Worker 2    │    │ Worker N    │
│ Crawl/Analyze│   │ Crawl/Analyze│   │ Crawl/Analyze│
└─────────────┘    └─────────────┘    └─────────────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           ▼
                   ┌─────────────┐
                   │ PostgreSQL  │
                   │ (shared)    │
                   └─────────────┘
```

### Data Partitioning

| Strategy | Use Case | Complexity |
|----------|----------|------------|
| By domain | Domain-specific workers | Low |
| By date | Time-series optimization | Medium |
| By region | Geographic distribution | High |

### Caching Layers

```
Request Flow
     │
     ▼
┌─────────────┐
│ L1: Memory  │  TTL: 1 min, Size: 100MB
│ (per-process)│
└─────────────┘
     │ miss
     ▼
┌─────────────┐
│ L2: Redis   │  TTL: 1 hour, Size: 1GB
│ (shared)    │
└─────────────┘
     │ miss
     ▼
┌─────────────┐
│ L3: SQLite  │  TTL: ∞, Size: 20GB
│ (persistent)│
└─────────────┘
```

---

## Summary

This book has documented:

1. **System Architecture** — Modular design with clear boundaries
2. **Data Flow** — Six-stage pipeline from discovery to export
3. **Crawl System** — Daemon, operations, telemetry
4. **Analysis System** — Extraction, classification, fact detection
5. **Disambiguation** — Multi-feature scoring with explanation
6. **Integration** — Unified pipeline vision
7. **AI Patterns** — JSON-first design for agent consumption
8. **Error Handling** — Recovery strategies at every level
9. **Roadmap** — Phased development plan
10. **Performance** — Measurable targets and benchmarks

The system is designed to evolve. Each component can be improved independently while maintaining the overall architecture. The performance targets and benchmarks provide objective criteria for measuring progress.

---

## Appendix: Quick Reference

### Key Commands

```bash
# Daemon control
node tools/dev/crawl-daemon.js start|stop|status

# Quick crawl
node tools/dev/crawl-api.js jobs start quickDiscovery <url> --json

# Analysis backfill
node labs/analysis-observable/run-all.js --electron

# Check status
node tools/dev/crawl-api.js status --json
node tools/dev/task-events.js --summary <jobId>
```

### Key Files

| Purpose | Location |
|---------|----------|
| Daemon | `tools/dev/crawl-daemon.js` |
| API client | `tools/dev/crawl-api.js` |
| Operations | `src/modules/crawler/operations/` |
| Analysis | `labs/analysis-observable/` |
| Gazetteer | `src/db/queries/gazetteerQueries.js` |
| Disambiguation | `src/modules/analysis/disambiguation/` |

### Key Tables

| Table | Purpose |
|-------|---------|
| `content_cache` | Compressed HTML storage |
| `articles` | Article metadata |
| `content_analysis` | Versioned analysis results |
| `place_mentions` | Detected place references |
| `resolved_places` | Disambiguation results |
| `task_events` | Telemetry and logging |

---

*End of Book*

[← Back to Index](../README.md)
