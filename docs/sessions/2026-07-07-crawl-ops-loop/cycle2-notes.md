# Crawl Ops Loop — Cycle 2: L3 PARTIAL — strong Guardian leg, two real gaps exposed

## Campaign (2026-07-07 20:00–20:17Z, into data/news.db)

- **Guardian (repeat domain, 25pp, sitemap ON):** job a9ae9a92 — 28×200, 13.9MB, ran until manually stopped at ~14min, then finished **completed**. Window contentAdded **24** (the datetime() fix works). Politeness clean.
- **NPR (new domain, 25pp):** job 0bf19ef8 — **failed** ~2min in after only robots.txt (1×200, 5KB). Probable bot-challenge/CAPTCHA-class rejection; exact classification UNCONFIRMED (see gaps).
- Window totals: 29 responses, **0×429, 0×5xx**; DB: content 190020 (+35 since L2 close), urls 1646764.
- **Ratchet verdict: L3 NOT proven** (one leg failed externally; other needed manual stop). L3 stays eligible; rerun after the gaps below are closed.

## Gaps exposed (next parcel material)

1. **No job runtime bound**: a 25-download job ran 14min open-ended (sitemap-fed queue keeps it busy). L4 would run hours. Need a maxDuration/maxWallClock override honored by the operation (check engine knobs first — c-series notes mention watchdog/timeout options) or a dispatcher-side auto-stop. `/stop` verb works (POST /api/v1/crawl/jobs/<id>/stop, 200 → graceful completed).
2. **Domain preflight missing**: NPR burned a ratchet slot on a bot-challenged host. Cheap preflight (robots + single conditional GET, classify challenge/403/ok) before dispatch.
3. **Error observability**: the live failure never landed in `errors` (newest rows are 2026-03, apnews CAPTCHA era) and `/api/crawl-telemetry/history?topic=error` ignored the topic filter (returned progress). Job record carries only lifecycle fields; progress/errors ride telemetry. Where do job-failure reasons persist? Unresolved.
4. Minor: recent-errors.js truncates JSON mid-string (slice 12000) — emit truncated-safe output.

## Confirmed API surface (documented)

Jobs list: `{status, items:[...]}`. Single job: `{status, job:{id,mode,operationName,startUrl,status,createdAt,startedAt,finishedAt,paused,abortRequested}}` — no progress fields. Job control: POST `/jobs/<id>/stop` (200), `/abort` → 400 "Unknown job action". Telemetry: `/api/crawl-telemetry/history?limit=N` works; topic filter doesn't.

## State at close

Bridge v3 healthy (watchdog+heartbeat working throughout). UI pid 135472 up on news.db. verify-crawl-delta.js now trustworthy (datetime fix). New read-only helpers: db-schema-peek.js, recent-errors.js.
