# Crawl Ops Loop — Cycle 4: enforcement rep CLEAN (L4 unblocked) + failure observability FIXED

## Enforcement rep (the L4 gate)

`bounded-dispatch.js` (now with adopt-orphan + 60s API timeouts): BBC, 25pp, 150s budget → report `{finalStatus:"completed", elapsedMs:143440, underBudget:true, adopted:false, ok:true}`. Window: 32 responses (31×200 + **1×304 sitemap revalidation**), 0×429/0×5xx, +22 articles. **Gate satisfied — L4 eligible** (single domain, bounds mandatory).

## Failure observability — root-caused, fixed, PROVEN

`InProcessCrawlJobRegistry` set `job.status='failed'` but only *emitted* the reason (`job:failed` event) — never stored it; API job records were lifecycle-only, which is why NPR's c2 failure was unfindable. Fix: persist `job.error` on both failure paths + expose in `list()`/`get()`. Verified with a zero-traffic fail-probe (`http://127.0.0.1:9/` → ECONNREFUSED): the job record now carries the full reason. Polish note: error can arrive as `{message,stack}` object — normalize to string later. (UNCOMMITTED, like everything.)

## Also

- adopt-orphan logic added to bounded-dispatch (dispatch-timeout → find job by startUrl+createdAt and babysit it) — untested in anger this cycle (rep didn't need it).
- Day totals on news.db since morning baseline: responses 302113→302298 (+185), content 189974→190068 (+94 articles), urls +6.5K — all with ZERO politeness breaches across L1/L2/L3/rep.
- Telemetry topic-filter fix not reached this cycle (still filed).

## Rolling API/ops facts

Job routes need full UUIDs. Stop → terminal lags ~1min. In-process crawls starve the API (60s timeouts + patience). Do-not-crawl (bot-challenged 2026-07-07): npr.org, reuters.com.
