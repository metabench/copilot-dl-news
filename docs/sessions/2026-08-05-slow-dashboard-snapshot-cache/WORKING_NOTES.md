# Working notes — slow-dashboard snapshot cache (2026-08-05)

## Profiling (measured, live data/news.db, readonly)

/quality GET / = three synchronous service calls:

| call | cold | warm |
|---|---|---|
| `getSummary()` | 21.4s | 5.8s |
| `getConfidenceDistribution()` | 5.7s | 5.8s (no warm speedup — scan+bucket is CPU-bound) |
| `getRegressions()` | 11.8s | 2.7s |
| **total** | **~39s** | **~14.4s** |

/place-hubs GET / — the census assumption ("heavy queries") was WRONG:

| step | cold | warm |
|---|---|---|
| `buildMatrixModel` (all db work) | 343ms | 9ms |
| jsgui3 render of the 200×30 matrix | — | **~9.1s**, producing an **8,515,820-byte** page |
| `require('placeHubGuessing/server')` | 18.0s (crawler stack) | — |

So /place-hubs is a *render* problem, not a query problem — and any child process
must not require server.js (18s of crawler-stack requires). Hence the extraction
of `renderMatrixPage.js` (jsgui + news-crawler-db + controls + shared only).

Consequence for the fix menu: an in-band TTL cache (option a alone) was
disqualified by measurement — the cache *fill* would still freeze the event loop
14-39s (/quality), and the walk's 20s budget would fail on truly-cold runs.

## Decision

Child-process snapshot builds behind a serve-stale HTML cache (TTL 45s) — the
established countryStats / hostHealth idiom from unifiedApp/server.js (#39/#40),
applied at the dashboard layer. No db changes. Cold requests get an instant
auto-refreshing 200 placeholder. See ADR
`docs/decisions/2026-08-05-dashboard-html-snapshot-cache.md`.

## Verification (all measured on the unified server, port 3499)

- Cold first hits after boot: /quality **38ms**, /place-hubs **23ms** (placeholders).
- Background snapshots landed: /quality after ~16s of child compute, /place-hubs
  in <3s — both children ran concurrently while every route stayed responsive
  (the /place-hubs snapshot landed *during* /quality's compute window: no freeze).
- Warm serves: /quality **3-4ms**, /place-hubs **142-187ms** (full 8.5MB body).
  Was (census): 9.1s and 6.0s.
- Content asserted, not just status: /quality has digit-grouped totals,
  "Average Confidence" percentage, histogram markup; /place-hubs serves the real
  matrix (hosts observed: theguardian.com, independent.co.uk; 8,515,820 bytes).
- Spot checks unchanged: / 15ms, /analytics 2.8s, /docs 591ms.
- Unit test: `npm run test:by-path tests/ui/htmlSnapshotCache.test.js` → 6/6 pass.
- E2E: `npx jest tests/ui/unifiedApp.puppeteer.e2e.test.js` → **2/2 pass in 23s**,
  with `skipActivation` and `knownSlowRoutes` removed — the walk now activates
  quality and place-hubs and rides their responses under the plain 20s budget.
- `--check` fast paths: quality's check-mode short-circuit untouched (still first
  in the handler); both routes skip child spawns under `--check`.
- "Jest did not exit one second after…" warning after the e2e pass: pre-existing,
  documented repo-wide (docs/guides/TEST_HANGING_PREVENTION_GUIDE.md exists for
  exactly this in server e2e suites). Attribution reasoned + repo-documented, not
  A/B-measured; mechanically the snapshot children belong to the *server*
  process, so jest never holds their handles.

## Follow-ups (not done here)

- /quality's sub-pages (/domains, /regressions) and /api/quality/* still run
  their aggregates in-band (multi-second scans). Not census-flagged, not walked
  by the e2e, but the same cache would drop in if they start to hurt.
- /analytics measured 2.8s here (census said 1.5s) — still under every budget,
  next-slowest page if the census re-runs.
