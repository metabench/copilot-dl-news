# Follow Ups – Reliable 50-Page Crawl with Evidence System

## Immediate (Next Session)

- [ ] Run 50-page crawl test: `node tools/dev/verified-crawl.js https://www.theguardian.com --target 50`
- [ ] Verify Downloads panel updates in UI: `npm run ui:unified` → Downloads
- [ ] Test API endpoints with curl

## Short-Term Improvements

- [ ] Add SSE progress updates during crawl (real-time progress bar)
- [ ] Add "Start Crawl" button in UI (currently CLI-only placeholder)
- [ ] Add content hash verification to evidence model
- [ ] Add rate limit indicator to Downloads panel

## Long-Term Enhancements

- [ ] Add historical download graph (downloads over time)
- [ ] Add per-domain download breakdown
- [ ] Add export function for evidence bundles
- [ ] Add scheduled verification checks

## Technical Debt

- [ ] Add Jest tests for downloadEvidence.js (currently only check script)
- [ ] Add OpenAPI spec for `/api/downloads/*` endpoints
- [ ] Add error boundary to Downloads panel activator_
