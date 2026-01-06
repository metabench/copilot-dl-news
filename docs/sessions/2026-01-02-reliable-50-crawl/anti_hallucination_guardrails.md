# Anti-Hallucination Guardrails

**Phase 6 Deliverable** — 2026-01-02

## Core Principle

> **"Do not say 'downloaded' unless you can point to evidence artifacts."**

This document defines guardrails that prevent agents (AI or human) from making false claims about download counts.

---

## The Problem

AI agents and monitoring systems can "hallucinate" download counts by:
1. Trusting in-memory counters that drift from reality
2. Counting cache hits as downloads
3. Counting failed requests as successes
4. Not verifying claims against the database

---

## Guardrail 1: Always Query the Database

**Rule**: Never claim a download count without querying `http_responses`.

**Verification Query**:
```sql
SELECT COUNT(*) as verified
FROM http_responses
WHERE http_status = 200
  AND bytes_downloaded > 0
  AND fetched_at BETWEEN ? AND ?
```

**API Endpoint**: `GET /api/downloads/verify?start=<iso>&end=<iso>&claimed=<n>`

**Response**:
```json
{
  "valid": true|false,
  "actual": 50,
  "claimed": 50,
  "discrepancy": 0
}
```

---

## Guardrail 2: Require http_response_id

**Rule**: Every claimed download must have a corresponding `http_response_id`.

**Evidence Format**:
```json
{
  "url": "https://example.com/article",
  "http_response_id": 62770,
  "http_status": 200,
  "bytes_downloaded": 325667,
  "fetched_at": "2026-01-02T23:44:43.144Z"
}
```

If `http_response_id` is missing, the claim is **unverified**.

---

## Guardrail 3: bytes_downloaded > 0

**Rule**: A download is only valid if `bytes_downloaded > 0`.

A `bytes_downloaded` value of 0 or null indicates:
- Empty response
- Request timeout
- Network error

---

## Guardrail 4: Distinguish Cache vs Network

**Rule**: Log cache hits separately from network downloads.

| Source | Counts As Download? |
|--------|---------------------|
| Network (HTTP 200) | ✅ Yes |
| Browser cache | ❌ No |
| Application cache | ❌ No |
| 304 Not Modified | ❌ No |

When reporting progress, use:
- `downloaded_from_network: 25`
- `from_cache: 11`
- `total_verified: 36`

---

## Guardrail 5: Baseline + Delta Verification

**Rule**: Always capture baseline before crawl, then verify delta.

**Pre-crawl**:
```javascript
const baseline = downloadEvidence.getGlobalStats(db);
// { verified_downloads: 62769 }
```

**Post-crawl**:
```javascript
const after = downloadEvidence.getGlobalStats(db);
const newDownloads = after.verified_downloads - baseline.verified_downloads;
// newDownloads = 50
```

---

## Guardrail 6: Time-Bounded Evidence

**Rule**: All evidence queries must include time bounds.

Never use:
```sql
SELECT COUNT(*) FROM http_responses  -- ❌ All-time count
```

Always use:
```sql
SELECT COUNT(*) FROM http_responses
WHERE fetched_at BETWEEN ? AND ?  -- ✅ Time-bounded
```

---

## Implementation Checklist

### For Crawl Scripts

- [ ] Capture baseline before starting
- [ ] Use `verified-crawl.js` wrapper
- [ ] Query DB after completion, not just in-memory stats
- [ ] Log discrepancies if claimed ≠ actual

### For UI Components

- [ ] Fetch from `/api/downloads/stats`
- [ ] Display `verified_downloads`, not raw counts
- [ ] Show "Last updated" timestamp
- [ ] Indicate if data is stale

### For AI Agents

- [ ] Never say "downloaded X pages" without `http_response_id`
- [ ] Always cite the verification query used
- [ ] Log the time range for all claims
- [ ] If in doubt, run `verifyDownloadClaim()`

---

## Verification Commands

```bash
# Check evidence queries work
node checks/download-evidence.check.js

# Run verified crawl with DB verification
node tools/dev/verified-crawl.js https://www.theguardian.com --target 50

# Query API for verification
curl "http://localhost:3003/api/downloads/verify?start=2026-01-02T00:00:00Z&end=2026-01-03T00:00:00Z&claimed=50"
```

---

## Error Handling

| Error | Response |
|-------|----------|
| `discrepancy > 0` | Log warning, investigate missing downloads |
| `actual = 0` | Check if crawl ran, check for errors |
| `bytes_downloaded = 0` | Check for empty responses, timeouts |
| `http_status != 200` | Check for rate limiting, blocks |

---

## Summary

1. **Query the database** - don't trust counters
2. **Require http_response_id** - no ID = no proof
3. **Check bytes > 0** - empty = not downloaded
4. **Separate cache from network** - cache ≠ download
5. **Use baseline + delta** - verify before/after
6. **Time-bound everything** - always specify range
