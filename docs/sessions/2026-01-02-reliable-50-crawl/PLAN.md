# Plan – Reliable 50-Page Crawl with Evidence System

## Objective
Build verified 50-page download with UI progress bar and anti-hallucination guardrails

## Done When
- [x] Phase 0: Database schema and current state documented
- [x] Phase 1: State machine and evidence contract defined
- [x] Phase 2: Evidence query functions implemented
- [x] Phase 4: Stats API for download graph
- [x] Phase 5: Downloads panel in Unified UI (green progress bar)
- [ ] Phase 3: Reliable 50-page crawl verified (manual test)
- [ ] Phase 6: Anti-hallucination guardrails documented
- [ ] Phase 7: Test plan with failure injection

## Change Set

### Created
- `docs/sessions/2026-01-02-reliable-50-crawl/current_state.md` - Phase 0 analysis
- `docs/sessions/2026-01-02-reliable-50-crawl/data_contract.md` - Evidence contract
- `src/db/queries/downloadEvidence.js` - Evidence query functions
- `checks/download-evidence.check.js` - Evidence query validation
- `tools/dev/verified-crawl.js` - Crawl runner with DB verification

### Modified
- `src/api/server.js` - Added `/api/downloads/*` endpoints
- `src/ui/server/unifiedApp/subApps/registry.js` - Added Downloads panel
- `src/ui/server/unifiedApp/views/UnifiedShell.js` - Added downloads activator

### Key Discoveries
- **62,769 total HTTP responses** in database (60,934 verified with HTTP 200)
- **http_responses table** is the source of truth for downloads
- **task_events table** provides structured logging
- **Rate limiting**: The Guardian requires ~2s between requests

## Evidence Contract (Summary)

A download is **verified** when:
```sql
http_status = 200 AND bytes_downloaded > 0 AND fetched_at IS NOT NULL
```

Never claim "downloaded" without:
1. `http_response_id` from database
2. `bytes_downloaded > 0`
3. `http_status = 200`

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/downloads/stats` | Global download statistics |
| `GET /api/downloads/range?start=&end=` | Stats for time range |
| `GET /api/downloads/timeline?start=&end=` | Progress visualization data |
| `GET /api/downloads/evidence?start=&end=&limit=` | Full evidence bundle |
| `GET /api/downloads/verify?start=&end=&claimed=` | Anti-hallucination check |

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Rate limiting stops crawl | Use `--slow` flag (2s delay) |
| Timeout too short | Default 600000ms (10 min) |
| Cache hits counted as downloads | Filter by `fetched_at` time range |
| Memory counter drift | Always query DB, not in-memory stats |

## Tests / Validation

1. `node checks/download-evidence.check.js` - Evidence queries work ✅
2. `node tools/dev/verified-crawl.js <url> --target 50` - Run verified crawl
3. Compare claimed vs actual downloads via `verifyDownloadClaim()`
4. View in UI: `npm run ui:unified` → Downloads panel
