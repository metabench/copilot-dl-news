# Distributed Crawl Lab Results Summary

**Date**: January 2025  
**Worker Location**: OCI Cloud (144.21.42.149:8081)  
**Database**: 599,905 URLs total, ~520,000 unfetched

---

## 1. Hub Speed Comparison (HEAD requests)

| Location | Time (20 URLs) | Throughput |
|----------|----------------|------------|
| Local (sequential) | 4338ms | 4.6 URLs/sec |
| Remote (parallel) | 729ms | 27.4 URLs/sec |
| **Speedup** | | **5.95x** |

**Conclusion**: The remote worker's parallel execution provides significant speedup for URL verification.

---

## 2. Batch Size Comparison

| Batch Size | Time (40 URLs) | Throughput | Notes |
|------------|----------------|------------|-------|
| 5 | 22179ms | 2.3 URLs/sec | Slowest (overhead per batch) |
| 10 | 17202ms | 2.9 URLs/sec | |
| 20 | 16585ms | 3.0 URLs/sec | |
| **50** | 15460ms | **3.2 URLs/sec** | ⭐ Best |

**Recommendation**: Use batch size 50 for optimal throughput. Larger batches reduce per-request overhead.

---

## 3. Concurrency Comparison

| Concurrency | Time (40 URLs) | Throughput | Notes |
|-------------|----------------|------------|-------|
| 5 | 17046ms | 2.9 URLs/sec | |
| 10 | 16666ms | 3.0 URLs/sec | |
| 20 | 16497ms | 3.0 URLs/sec | |
| **40** | 16684ms | **3.0 URLs/sec** | Similar to 20 |

**Observation**: Concurrency above 20 shows diminishing returns. The bottleneck is likely network latency or target site response times, not parallelism.

**Recommendation**: Use concurrency 20-40. Higher values may trigger rate limiting from target sites.

---

## 4. Compression Comparison (Response Transfer)

| Mode | Transfer Size | Compression Ratio | Time |
|------|---------------|-------------------|------|
| None | ~1.8 KB | 1.0 | 1274ms |
| **Gzip** | ~0.8 KB | **0.38** (62% smaller) | 676ms |

**Key Metrics**:
- **53% transfer savings** with gzip
- **1.88x faster** total time
- Decompression overhead: ~1ms (negligible)

**Recommendation**: Always use gzip for response compression. The transfer savings far outweigh decompression cost.

---

## 5. Optimal Configuration

Based on all lab results:

```javascript
const OPTIMAL_CONFIG = {
  batchSize: 50,           // Larger batches reduce overhead
  maxConcurrency: 20,      // Beyond 20, diminishing returns
  timeoutMs: 30000,        // 30s per request timeout
  compress: 'gzip',        // 62% smaller transfers, 1.88x faster
  includeBody: false,      // For HEAD/metadata only
  retryCount: 2,           // Retry failed requests
};
```

---

## 6. Expected Production Performance

With optimal settings on the OCI worker:

| Metric | Value |
|--------|-------|
| Throughput (HEAD) | ~3 URLs/sec sustained |
| Throughput (GET) | ~1-2 URLs/sec (body download) |
| Daily capacity | 86,400+ HEAD requests |
| Time to clear 520K backlog | ~2 days (HEAD only) |

---

## 7. Lab Files Created

| File | Purpose |
|------|---------|
| `lab-hub-speed-compare.js` | Compare local vs remote HEAD performance |
| `lab-batch-strategies.js` | Benchmark batch sizes and concurrency |
| `lab-real-crawl.js` | Full GET downloads with DB save option |
| `lab-body-download.js` | Compression efficiency for body content |
| `speedometer-web.js` | Web dashboard for real-time monitoring |

---

## 8. Next Steps

1. **Integration**: Create a `DistributedCrawlService` that uses these optimal settings
2. **Queue Management**: Add priority-based URL selection from database
3. **Rate Limiting**: Implement per-host rate limiting to avoid being blocked
4. **Error Handling**: Add retry logic with exponential backoff
5. **Monitoring**: Deploy speedometer dashboard for production monitoring
