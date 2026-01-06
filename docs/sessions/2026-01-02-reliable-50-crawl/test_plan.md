# Test Plan & Failure Injection

**Phase 7 Deliverable** — 2026-01-02

## Test Categories

### 1. Unit Tests (Evidence Queries)

**File**: `checks/download-evidence.check.js`

| Test | Description | Status |
|------|-------------|--------|
| Global stats | Query all-time download count | ✅ Pass |
| Time range stats | Query downloads in time range | ✅ Pass |
| Evidence bundle | Get full evidence with IDs | ✅ Pass |
| Claim verification | Verify claimed count matches actual | ✅ Pass |
| Timeline | Get progress visualization data | ✅ Pass |

**Run**: `node checks/download-evidence.check.js`

---

### 2. Integration Tests (API Endpoints)

**Endpoints to test**:

| Endpoint | Method | Expected |
|----------|--------|----------|
| `/api/downloads/stats` | GET | 200 + stats object |
| `/api/downloads/range` | GET | 200 + time-bounded stats |
| `/api/downloads/timeline` | GET | 200 + cumulative timeline |
| `/api/downloads/evidence` | GET | 200 + evidence array |
| `/api/downloads/verify` | GET | 200 + valid/discrepancy |

**Run**:
```bash
# Start server
npm run ui:unified

# Test endpoints
curl http://localhost:3003/api/downloads/stats
curl "http://localhost:3003/api/downloads/range?start=2026-01-01T00:00:00Z&end=2026-01-03T00:00:00Z"
```

---

### 3. End-to-End Test (50-Page Crawl)

**Test Case**: Download exactly 50 pages with verification

**Steps**:
1. Capture baseline: `node checks/download-evidence.check.js`
2. Run crawl: `node tools/dev/verified-crawl.js https://www.theguardian.com --target 50`
3. Verify output shows `verified: 50` (or close)
4. Check UI: Open Downloads panel, verify stats updated

**Expected**:
- `verified_new_downloads >= 45` (allowing for some cache hits)
- `success_rate >= 90%`
- No discrepancy in verification

---

## Failure Injection Tests

### Test 1: Timeout (crawl takes too long)

**Inject**:
```bash
node tools/dev/verified-crawl.js https://www.theguardian.com --target 50 --timeout 5000
```

**Expected**: Crawl stops early, verification shows `verified < 50`

---

### Test 2: Rate Limit (site blocks requests)

**Inject**: Use a site with aggressive rate limiting

**Expected**: `http_status = 429` or `http_status = 503`, verification shows failures

---

### Test 3: Network Error

**Inject**: Disconnect network mid-crawl

**Expected**: Evidence shows `bytes_downloaded = 0` for failed requests

---

### Test 4: Claim Mismatch (anti-hallucination)

**Inject**:
```bash
curl "http://localhost:3003/api/downloads/verify?start=2026-01-02T00:00:00Z&end=2026-01-02T00:01:00Z&claimed=1000"
```

**Expected**:
```json
{
  "valid": false,
  "actual": <real_count>,
  "claimed": 1000,
  "discrepancy": <1000 - actual>
}
```

---

### Test 5: Empty Time Range

**Inject**:
```bash
curl "http://localhost:3003/api/downloads/range?start=2030-01-01T00:00:00Z&end=2030-01-02T00:00:00Z"
```

**Expected**:
```json
{
  "status": "ok",
  "stats": { "total": 0, "verified": 0, "failed": 0, "bytes": 0 }
}
```

---

## Continuous Verification

After any crawl operation, run:

```bash
# Quick health check
node checks/download-evidence.check.js

# Full verification report
node tools/dev/verified-crawl.js --help
```

---

## Coverage Summary

| Category | Tests | Status |
|----------|-------|--------|
| Evidence queries | 5 | ✅ Implemented |
| API endpoints | 5 | ⏳ Manual testing |
| E2E crawl | 1 | ⏳ Needs execution |
| Failure injection | 5 | 📋 Documented |

---

## Next Steps

1. Run E2E test: `node tools/dev/verified-crawl.js https://www.theguardian.com --target 50`
2. Verify UI panel updates with live stats
3. Document results in SESSION_SUMMARY.md
