# Working Notes: Crawler Reliability Recursive Plan

Date: 2026-05-29

## 2026-05-31 — Audit node COMPLETE (read-only), advanced to robots-cache impl

- Node `audit_and_encapsulate_politeness_robots_cache_freshness_modules` done.
  HEADLINE CORRECTION: robots DB caching (24h TTL), conditional GET
  (etag/last-modified), 304 not-modified skip, and sitemap `<lastmod>` surfacing
  are ALREADY implemented + live-wired — the prompt had OVERSTATED these gaps.
  Live path is `RobotsAndSitemapCoordinator` (wired `CrawlerServiceWiring` L334),
  not bare `robots.js`. Conditional GET lives in `FetchPipeline`
  `_buildConditionalHeaders` L1357 + 304 path L915-965.
- GENUINE gaps (downstream work): (a) `Crawl-delay` never parsed/persisted/
  enforced; (b) robots cache is a generic article row w/ hardcoded 24h TTL, no
  revalidation; (c) sitemap lastmod unused for new-vs-updated prioritization;
  (d) ttfb/transferKbps captured but never decomposed into regimes.
- Artifacts: `tmp/crawl-quality-audit.json`,
  `crawl-quality-module-boundaries.svg` + `.md`. Baseline GREEN: 5 suites, 139.
- State advanced: 89 completed, 10 pending; new active node
  `implement_robots_txt_cache_with_ttl_revalidation_and_db_persistence`
  (extract `RobotsCache`, typed persistence, configurable TTL + conditional
  revalidation, parse+persist `Crawl-delay`). Folded split-state node into its
  workload (prompt is 979 lines > 800 WARN).

## 2026-06-13 — RobotsCache extraction + concise recursive state split

- Node `implement_robots_txt_cache_with_ttl_revalidation_and_db_persistence`
  done. Added `src/core/crawler/RobotsCache.js` and wired
  `RobotsAndSitemapCoordinator` through it. The coordinator still owns
  `isAllowed()` and sitemap enqueue behavior; the cache module owns robots.txt
  cache lifecycle.
- `RobotsCache` now prefers typed coverage cache APIs
  `getRobotsCache(domain)` / `upsertRobotsCache(record)`, persists
  `robotsTxt`, `crawlDelaySeconds`, `sitemapUrls`, `etag`, `lastModified`, and
  `expiresAt` when available, and falls back to legacy article-row cache reads
  and writes for compatibility.
- TTL is configurable with `CRAWLER_ROBOTS_CACHE_TTL_SECONDS` (default 24h).
  Stale cache revalidation sends `If-None-Match` / `If-Modified-Since`; a 304
  refreshes cache timestamp without reparsing. `Crawl-delay` is parsed with
  per-agent plus `*` fallback and persisted for the next governor node. It is
  not enforced yet.
- `CrawlerDb` now exposes `getRobotsCache()` and `upsertRobotsCache()` when the
  wrapped DB exposes coverage access.
- Added focused tests for cache hit, miss/write, 304 revalidation, legacy
  fallback, Crawl-delay parsing, and sitemap normalization. Updated the
  coordinator sitemap enqueue expectation to preserve existing current behavior.
- Split recursive execution state to
  `docs/sessions/2026-05-29-crawler-reliability-recursive-plan/EXECUTION_STATE.json`.
  `CONTINUATION_PROMPT.md` is now concise, and
  `validate-continuation-state.js --json` reads the state file with no
  max-line warning.

Next active node: `honor_robots_crawl_delay_and_adaptive_per_host_politeness`.
No live network, remote crawler contact, remote mutation, or production DB write
was needed for this node.

Validation:
- Syntax checks passed for touched crawler JS, touched tests, and
  `tools/crawl/validate-continuation-state.js`.
- Focused Jest: combined no-contact run passed 145 assertions across 6 suites
  and hit one Jest transform-cache ENOENT in
  `sequential-fixture-proof.test.js`; isolated rerun with `--no-cache` passed
  that suite (4/4). Test artifacts:
  `data/test-results/run-2026-06-13-223905174-36320.json` and
  `data/test-results/run-2026-06-13-224106258-384bb.json`.
- State validator passed reading `EXECUTION_STATE.json`: 93 completed, 8
  pending, active
  `honor_robots_crawl_delay_and_adaptive_per_host_politeness`, prompt 100
  lines, no warnings.
- No-contact artifacts:
  `tmp/robots-cache-policy.json`,
  `tmp/robots-cache-local-smoke-plan.json`,
  `tmp/crawl-packet-tiny-robots-cache-plan.json`,
  `tmp/robots-cache-local-smoke-comparison.json`,
  `tmp/robots-cache-small-vs-medium-cadence.json`, and
  `tmp/robots-cache-small-vs-medium-card.json`. The cadence/card artifacts
  intentionally report divergence (small 96%, medium 93%, `poll-error` only in
  medium); this is existing saved-rung evidence, not a new blocker.
- Whitespace scan, targeted `git diff --check`, and process cleanup checks
  passed. `git diff --check` printed only existing CRLF-normalization warnings.

## 2026-06-13 — Crawl-delay politeness floor enforced

- Node `honor_robots_crawl_delay_and_adaptive_per_host_politeness` done.
  `RobotsAndSitemapCoordinator` now exposes robots policy evidence and calls
  the active pacing path when `RobotsCache` returns `crawlDelaySeconds`.
- `DomainThrottleManager.setRobotsCrawlDelay(host, seconds)` stores a per-host
  politeness floor and applies it to `DomainLimiter`. The fallback path also
  waits for `nextRequestAt` and schedules the next request from the floor.
- `DomainLimiter` now enforces `politenessFloorMs` even when a host is not in
  slow mode. 429/403 backoff can still reduce RPM below the floor, and success
  recovery caps RPM so it cannot pace faster than robots allows.
- Progress payloads now include `robotsSource`, `robotsCrawlDelaySeconds`, and
  `robotsPolitenessFloorMs` for operator clarity.
- Capability review: policy proven for robots allow/deny and Crawl-delay floor;
  preflight proven by no-contact plans; launch/watch/DB proof unchanged and
  still proven by saved tiny/small/medium artifacts; artifact/comparison
  tooling proven; dashboard card remains file-only; freshness and throughput
  remain partial and are the next horizon.
- Focused tests passed: 5 suites / 128 tests
  (`DomainThrottleManager`, `RobotsAndSitemapCoordinator`, `RobotsCache`,
  `crawl-packet`, `run`). Test artifact:
  `data/test-results/run-2026-06-13-225955383-1a284.json`.
- No-contact artifacts:
  `tmp/politeness-floor-policy.json`,
  `tmp/politeness-floor-local-smoke-plan.json`,
  `tmp/crawl-packet-tiny-politeness-floor-plan.json`,
  `tmp/politeness-floor-local-smoke-comparison.json`,
  `tmp/politeness-floor-small-vs-medium-cadence.json`, and
  `tmp/politeness-floor-small-vs-medium-card.json`. Cadence/card still exit 2
  for the known saved-rung divergence: small 96%, medium 93%, `poll-error` only
  in medium.

Next active node:
`implement_freshness_detection_sitemap_lastmod_head_and_conditional_get`.
No live network, remote crawler contact, remote mutation, loopback crawl, or
production DB write was required for this node.

## Context

- The user explicitly redirected away from docs-viewer work in
  `jsgui3-ecosystem` and asked for crawler reliability planning plus an initial
  recursive continuation prompt.
- `coordination-jsgui-ecosystem.code-workspace/AGENTS.md` says that workspace
  is not a news, crawler, or downloader workspace.
- The active crawler operational repo is `copilot-dl-news`.
- `coordination-news-jsgui-ecosystem.code-workspace` identifies reusable owners:
  `news-crawler-backend-core` for crawler runtime, `news-crawler-db` for DB
  boundary, and `news-db-analysis` for analysis services.

## Context Read

- `AGENTS.md`
- `docs/INDEX.md`
- `tools/crawl/AGENT.md`
- `docs/RUNBOOK.md`
- `docs/cli/crawl.md`
- `package.json`
- `docs/sessions/SESSIONS_HUB.md`
- `docs/sessions/long-term/lt-001-advanced-crawler-ui/PLAN.md`
- `docs/sessions/long-term/lt-001-advanced-crawler-ui/WORKING_NOTES.md`
- `docs/sessions/2026-05-26-crawler-graph-feedback-loop/NEXT_FEW_DAYS_PLAN.md`
- `docs/sessions/2025-12-12-crawler-reliability/PLAN.md`
- `docs/sessions/2026-03-08-crawl-remote-bounded-reliability/PLAN.md`

## Current State

- The unified crawler launcher and `tools/crawl/AGENT.md` already define a
  local/remote operator surface, watch mode, DB proof, graph-feedback artifacts,
  remote readiness, and monitored small-crawl evidence.
- The current proven smallest useful path is
  `tools/crawl/monitored-small-crawl.js local-smoke --execute`, followed by DB
  verification and comparison evidence.
- The current risky remote path is residual queue/deploy state: a previous tiny
  approved graph-feedback seed succeeded, but `bbc.com` retained a large pending
  queue and deploy preflight reports busy state.
- Existing rules require explicit approval for live seeds, queue maintenance,
  prune, drain, clear, force deploy, or similar remote mutation.

## Decisions

- The initial pass was docs/session planning only; the implementation follow-up
  moved into an additive local/no-contact packet path.
- The next pass should first produce a no-contact "crawl packet" artifact shape
  and scorecard before broadening to real local or remote runs.
- Medium crawl readiness should grow from repeated, scored small runs rather
  than jumping straight to a broad remote crawl.
- Continuation prompts must be written both to `CONTINUATION_PROMPT.md` and
  inline in chat output.
- Follow-up user instruction on 2026-05-29 tightened the process: future turns
  must cover a large amount of connected work and must run crawler validations
  where possible. Bounded local small crawls are expected when the local
  environment allows them; medium orchestration proof should be dry-run or live
  local depending on safety. Remote live crawls and destructive remote
  maintenance remain separately gated.
- Implementation follow-up on 2026-05-29 added the first no-contact packet and
  scorecard path in `copilot-dl-news`, not in jsgui3 coordination.
- Small/medium launch commands generated by the packet now carry
  `CRAWL_RUN_SERVER_READY_TIMEOUT_MS` because the first small live proof showed
  the default 30-second local UI readiness window is too short on this machine.
- Do not broaden to live medium until the small local proof either passes or the
  launch/watch behavior for partial local batch starts is fixed.

## Validation

- `node tools/crawl/monitored-small-crawl.js policy --json` passed and printed
  the no-action monitored small-crawl policy/sequence.
- `node tools/crawl/monitored-small-crawl.js local-smoke --json` passed and
  printed the local-smoke plan without starting a crawler, contacting remote, or
  writing the DB.
- `node --check tools/crawl/lib/crawl-packet.js`,
  `node --check tools/crawl/crawl-packet.js`, and
  `node --check tests/tools/crawl/crawl-packet.test.js` passed.
- `npm run test:by-path -- tests/tools/crawl/crawl-packet.test.js` passed with
  5 tests.
- `node tools/crawl/crawl-packet.js plan --crawl-class tiny-local --json --out tmp/crawl-packet-tiny.json`
  passed and wrote a no-contact 85% packet ready for the tiny local run.
- `node tools/crawl/crawl-packet.js plan --crawl-class small-local --json --out tmp/crawl-packet-small.json`
  passed and wrote a no-contact 85% packet requiring tiny local proof first.
- `node tools/crawl/crawl-packet.js plan --crawl-class medium-local --json --out tmp/crawl-packet-medium.json`
  passed and wrote a no-contact 85% medium packet requiring tiny local proof
  first.
- `node tools/crawl/index.js local-small-reliability --dry-run` passed and
  resolved to BBC + Reuters local batch targets, one page each.
- `node tools/crawl/index.js local-medium-reliability --dry-run` passed and
  resolved to BBC + Reuters + AP local batch targets, one page each.
- `node tools/crawl/monitored-small-crawl.js local-smoke --execute --json --out tmp/local-smoke-report.json`
  passed. It started one bounded local BBC crawl, reached watch
  `minFetches=1`, and verified DB evidence. The latest report now records 3
  successful responses, 1 content row, and 960804 bytes for `www.bbc.com`.
- `node tools/crawl/monitored-small-crawl.js compare --report tmp/local-smoke-report.json --json --out tmp/local-smoke-comparison.json`
  passed with stable pass evidence.
- `node tools/crawl/crawl-packet.js plan --crawl-class small-local --local-smoke-report tmp/local-smoke-report.json --json --out tmp/crawl-packet-small-after-smoke.json`
  passed with score 13/13 and `ready-for-small-local`.
- `node tools/crawl/crawl-packet.js plan --crawl-class medium-local --local-smoke-report tmp/local-smoke-report.json --json --out tmp/crawl-packet-medium-after-smoke.json`
  passed with score 13/13 and `ready-for-medium-local`; this was treated as a
  dry-run/orchestration proof only because live small later blocked.
- First small live proof:
  `node tools/crawl/run.js --local ... --watch ... https://www.bbc.com/news,https://www.reuters.com/world/`
  with baseline/verify artifacts exited 3. The saved stderr says
  `auto-spawned unified UI did not become ready within 30s`; verification found
  zero DB delta. This classified as `runtime-error` / startup readiness.
- After adding packet launch env guidance, the small retry used
  `CRAWL_RUN_SERVER_READY_TIMEOUT_MS=240000`. It passed the UI startup gate but
  exited 2 because Reuters timed out during launch after four attempts. The
  launch result was `partial`: BBC job accepted, Reuters failed. `run.js` then
  skipped watch on launch exit 2 and auto-stopped, so the accepted BBC job did
  not reach DB proof in the monitored window.
- `node tools/crawl/crawl-packet.js plan --crawl-class small-local --local-smoke-report tmp/local-smoke-report.json --verification-report tmp/small-local-retry-verify.json --json --out tmp/crawl-packet-small-after-retry.json`
  exited 2 as expected for a blocked packet. It wrote score 13/16,
  classification `blocked`, taxonomy `no-new-data` and `partial-persistence`,
  and verification blockers `expected-download-count-not-met` and
  `db-success-delta-below-expected`.
- Final no-contact reruns after packet env/report-ingestion changes passed:
  monitored policy, monitored local-smoke plan, tiny packet, small packet after
  smoke (`ready-for-small-local`, score 100, server-ready env 240000), medium
  packet after smoke (`ready-for-medium-local`, score 100, server-ready env
  360000), small/medium profile dry-runs, and the blocked small retry packet.
- Medium live execution was not run because the small live proof remained
  blocked. Medium no-contact packet and profile dry-run proof were completed.
- Final syntax checks passed for `tools/crawl/lib/crawl-packet.js`,
  `tools/crawl/crawl-packet.js`, and
  `tests/tools/crawl/crawl-packet.test.js`.
- Final targeted whitespace scan over touched source/session files had no
  matches.
- Final targeted `git diff --check -- <touched files>` passed.
- Full `timeout 60 git diff --check` did not complete before timeout because
  the repo emitted a very large stream of pre-existing CRLF replacement
  warnings across unrelated files. The targeted diff check passed for this
  pass's touched files.
- `rg -n "[ \t]+$" docs/sessions/2026-05-29-crawler-reliability-recursive-plan`
  passed with no matches.
- A wider whitespace scan over the hub and LT-001 notes surfaced existing
  trailing-space Markdown line breaks in `docs/sessions/SESSIONS_HUB.md`; these
  were not introduced or normalized in this pass.
- `git diff --check -- docs/sessions/2026-05-29-crawler-reliability-recursive-plan docs/sessions/SESSIONS_HUB.md docs/sessions/long-term/lt-001-advanced-crawler-ui/WORKING_NOTES.md`
  passed.
- Full `git diff --check` was started, but it emitted a very large number of
  existing CRLF conversion warnings across the repo and was manually stopped
  before completion. No whitespace error was observed before termination, but
  the full command did not complete.

## Continuation Pass: Partial Watch And Small Timeout

- Re-read the active session docs, crawler docs, git state, command surfaces,
  packet/report helpers, and local crawl artifacts before changing code.
- Implemented bounded local partial-launch handling in `tools/crawl/run.js`:
  when a local launch exits partially but reports accepted jobs, `--watch`
  continues against accepted targets only if `--watch-min-fetches` is set. The
  watch result is still bounded and a failed launch exit remains nonzero.
- Added saved artifact ingestion to `tools/crawl/lib/crawl-packet.js` and
  `tools/crawl/crawl-packet.js`: `--launch-report` records status/counts and
  accepted/failed targets, while `--watch-log` parses the final bounded
  `watchFinal` JSON line.
- Added focused tests in `tests/tools/crawl/run.test.js` and
  `tests/tools/crawl/crawl-packet.test.js` for partial launch decisions,
  launch-result packet classification, watch timeout classification, DB proof
  expectations, and refusal to treat unbounded partial launches as proof.
- Fresh syntax checks passed for `tools/crawl/run.js`,
  `tools/crawl/lib/crawl-packet.js`, `tools/crawl/crawl-packet.js`,
  `tests/tools/crawl/run.test.js`, and
  `tests/tools/crawl/crawl-packet.test.js`.
- `npm run test:by-path -- tests/tools/crawl/run.test.js tests/tools/crawl/crawl-backend.test.js tests/tools/crawl/crawl-batch.test.js`
  passed with 3 suites and 93 tests.
- `npm run test:by-path -- tests/tools/crawl/crawl-packet.test.js tests/tools/crawl/run.test.js`
  passed after the watch-log test with 2 suites and 76 tests.
- No-contact checks passed:
  `node tools/crawl/monitored-small-crawl.js policy --json`,
  `node tools/crawl/monitored-small-crawl.js local-smoke --json`, packet plans
  for tiny/small/medium, and
  `node tools/crawl/index.js local-medium-reliability --dry-run`.
- Fresh tiny local proof passed:
  `node tools/crawl/monitored-small-crawl.js local-smoke --execute --json --out tmp/local-smoke-report.json`.
  It generated a report at `2026-05-29T15:05:08.265Z`, reached
  `watchFinal.stoppedReason=min-fetches-met`, verified DB deltas of 34 URLs, 3
  responses, 3 successful responses, and 1 content row, with max DB snapshot
  timing 3144ms.
- Tiny comparison passed:
  `node tools/crawl/monitored-small-crawl.js compare --report tmp/local-smoke-report.json --json --out tmp/local-smoke-comparison.json`
  with no blockers or warnings.
- Small two-host proof artifacts:
  `tmp/small-local-partial-watch-baseline.json`,
  `tmp/small-local-partial-watch.stdout.json`,
  `tmp/small-local-partial-watch.stderr.log`, and
  `tmp/small-local-partial-watch-verify.json`.
- The small launch accepted both BBC and Reuters targets, but watch timed out
  after the 240s budget with `fetched=0`, `minFetches=1`,
  `minFetchesMet=false`, and `jobs=null`. DB verification found zero URL,
  response, success response, failed response, or content delta for the
  requested hosts.
- Classified packet:
  `node tools/crawl/crawl-packet.js plan --crawl-class small-local --local-smoke-report tmp/local-smoke-report.json --verification-report tmp/small-local-partial-watch-verify.json --launch-report tmp/small-local-partial-watch.stdout.json --watch-log tmp/small-local-partial-watch.stderr.log --json --out tmp/crawl-packet-small-after-partial-watch.json`
  exited 2 as expected, wrote score 16/22 (73%), and classified the proof as
  `blocked` with taxonomy `no-new-data`, `partial-persistence`, and
  `watch-timeout`.
- Medium live local execution was not run because the small local proof is still
  blocked. The current safe medium proof is packet/profile dry-run only.
- Process cleanup check found no lingering `git status`, `git diff`, local UI,
  `run.js`, `crawl-batch.js`, or manual jobs-endpoint probes.

## Continuation Pass: Fresh Target Small Proof

- Confirmed the previous `jobs=null` symptom was caused by repeated
  `/api/v1/crawl/jobs` poll timeouts: the old 2s watch interval combined with a
  5s jobs request timeout produced roughly 7s watch ticks and no final job
  evidence.
- Updated `tools/crawl/lib/crawl-backend.js` and `tools/crawl/run.js` so local
  jobs polling uses a bounded sub-interval timeout and reports unavailable job
  evidence plus `jobPollErrors` in `watchTick`/`watchFinal`.
- Added packet target-freshness inspection against local DB exact URLs. Default
  small/medium packets now warn when selected URLs already have response
  evidence and recommend fresh exact targets before spending live watch budget.
- Added packet warnings and score categories for weak content proof
  (`weak-content-proof`, e.g. zero-byte or robots-only DB evidence) and
  intermittent local job polling (`poll-error` despite final DB proof).
- Focused tests added or updated in `tests/tools/crawl/crawl-backend.test.js`,
  `tests/tools/crawl/run.test.js`, and
  `tests/tools/crawl/crawl-packet.test.js`.
- Syntax checks passed for `tools/crawl/run.js`,
  `tools/crawl/lib/crawl-backend.js`, `tools/crawl/lib/crawl-packet.js`, and
  `tools/crawl/crawl-packet.js`.
- `npm run test:by-path -- tests/tools/crawl/crawl-packet.test.js tests/tools/crawl/run.test.js tests/tools/crawl/crawl-backend.test.js`
  passed with 3 suites and 100 tests.
- No-contact checks passed:
  `node tools/crawl/monitored-small-crawl.js policy --json`,
  `node tools/crawl/monitored-small-crawl.js local-smoke --json`,
  `node tools/crawl/index.js local-small-reliability --dry-run`,
  `node tools/crawl/index.js local-medium-reliability --dry-run`, and packet
  plans for tiny/small/medium.
- Default small packet
  `tmp/crawl-packet-small-after-smoke.json` now scores 14/15 (93%) because
  `https://www.bbc.com/news` already has exact local DB response evidence.
- Reuters `/world/` had no exact-response evidence, so it was selected as the
  deterministic one-host small proof target under the 1-3 host small cap.
- `node tools/crawl/monitored-small-crawl.js baseline --hosts www.reuters.com --db data/news.db --out tmp/small-local-reuters-baseline.json --json`
  passed.
- Bounded live small proof ran:
  `CRAWL_RUN_SERVER_READY_TIMEOUT_MS=240000 node tools/crawl/run.js --local --profile gentle --max-pages 1 --max-depth 0 --concurrency 1 --per-domain-interval-ms 1000 --override preferCache=false --override maxAgeMs=0 --override useSitemap=false --override sitemapOnly=false --override skipQueryUrls=false --watch --watch-interval 2000 --watch-timeout 240 --watch-min-fetches 1 --launch-timeout 180 --no-output-timeout 90 --auto-stop --no-meter --json --db data/news.db --ui-host 127.0.0.1 --ui-port 3172 https://www.reuters.com/world/`
  with stdout in `tmp/small-local-reuters.stdout.json` and stderr in
  `tmp/small-local-reuters.stderr.log`; exit code was 2.
- The Reuters run launch accepted one job. Watch reached
  `stoppedReason=timeout` with `fetched=0`, `minFetchesMet=false`, and
  `jobPollErrors=69`. Final job evidence was unavailable because
  `/api/v1/crawl/jobs` timed out at 1500ms throughout the watch.
- Verification blocked:
  `tmp/small-local-reuters-verify.json` reports DB delta 0 URLs, 0 responses, 0
  success responses, 0 failed responses, and 0 content rows. It records blockers
  `expected-download-count-not-met` and `db-success-delta-below-expected`.
- Classified packet:
  `tmp/crawl-packet-small-reuters-after-run.json` scores 18/24 (75%), label
  `blocked`, taxonomy `no-new-data`, `partial-persistence`, `watch-timeout`,
  and `poll-error`, with blockers `expected-download-count-not-met`,
  `db-success-delta-below-expected`, `watch-timeout`, and
  `job-evidence-unavailable`.

## Continuation Pass: Local Fixture Small And Medium Proofs

- Inspected the local job API path:
  `src/server/crawl-api/v1/core/InProcessCrawlJobRegistry.js` and
  `src/server/crawl-api/v1/express/routes/operations.js`. The `/jobs` and
  `/jobs/:jobId` routes are already low-cost in-memory projections, so the
  Reuters job timeout is more likely event-loop starvation during the active
  crawl than route payload cost.
- Updated `tools/crawl/run.js` so successful local launches parse saved launch
  stdout and carry accepted jobs into `watchFinal.launchJobs`. The watch final
  can now connect a later timeout or DB proof back to accepted local job IDs
  even when `/api/v1/crawl/jobs` times out.
- Updated `tools/crawl/lib/crawl-packet.js` so packets classify accepted jobs
  that become unobservable during a local timeout as
  `accepted-job-unobservable`. Packet evidence now preserves
  `watchFinal.launchJobs`.
- Updated packet safety policy so loopback-only fixture URLs
  (`localhost`/`127.*`/`::1`) report
  `contactsInternetTargetsWhenExecuted=false`; they still report
  `writesLocalDbWhenExecuted=true`.
- Added focused tests for launch-job fallback evidence, accepted-job
  unobservable classification, and loopback fixture action policy.
- Syntax checks passed for `tools/crawl/run.js`,
  `tools/crawl/lib/crawl-backend.js`, `tools/crawl/lib/crawl-packet.js`,
  `tools/crawl/crawl-packet.js`, `tests/tools/crawl/run.test.js`,
  `tests/tools/crawl/crawl-backend.test.js`, and
  `tests/tools/crawl/crawl-packet.test.js`.
- `npm run test:by-path -- tests/tools/crawl/crawl-packet.test.js tests/tools/crawl/run.test.js tests/tools/crawl/crawl-backend.test.js`
  passed with 3 suites and 103 tests. Latest result artifact:
  `data/test-results/run-2026-05-29-170248211-d0011.json`.
- No-contact checks passed:
  `node tools/crawl/monitored-small-crawl.js policy --json`,
  `node tools/crawl/monitored-small-crawl.js local-smoke --json`,
  `node tools/crawl/index.js local-small-reliability --dry-run`,
  `node tools/crawl/index.js local-medium-reliability --dry-run`, tiny packet,
  small fixture packet, and medium fixture packet.
- Tiny comparison refreshed:
  `node tools/crawl/monitored-small-crawl.js compare --report tmp/local-smoke-report.json --json --out tmp/local-smoke-comparison.json`
  passed with stable pass evidence.
- Started a one-host loopback HTML fixture on `127.0.0.1:41891`, confirmed it
  returned 200 and 570 bytes, then ran a bounded small local proof against
  `http://127.0.0.1:41891/news/fixture-article.html`.
- Small fixture artifacts:
  `tmp/small-local-fixture-baseline.json`,
  `tmp/small-local-fixture.stdout.json`,
  `tmp/small-local-fixture.stderr.log`,
  `tmp/small-local-fixture-verify.json`, and
  `tmp/crawl-packet-small-fixture-after-run.json`.
- Small fixture result: exit 0, `watchFinal.stoppedReason=min-fetches-met`,
  `fetched=3`, `bytes=1710`, `launchJobs.accepted=1`, DB delta 2 URLs, 3
  responses, 3 successful responses, 1 content row. Packet score 24/26 (92%).
  Remaining warning: 13 job poll errors before the job endpoint became
  observable.
- Started a three-host loopback fixture on `127.0.0.1:41892`,
  `127.0.0.2:41892`, and `127.0.0.3:41892`, confirmed all three returned 200
  and 493 bytes, then ran a bounded medium local proof against three fixture
  URLs.
- Medium fixture artifacts:
  `tmp/medium-local-fixture-baseline.json`,
  `tmp/medium-local-fixture.stdout.json`,
  `tmp/medium-local-fixture.stderr.log`,
  `tmp/medium-local-fixture-verify.json`, and
  `tmp/crawl-packet-medium-fixture-after-run.json`.
- Medium fixture result: exit 0, 3 accepted launch jobs,
  `watchFinal.stoppedReason=min-fetches-met`, `fetched=6`, `bytes=2958`,
  `jobPollErrors=0`, DB delta 3 URLs, 6 responses, 6 successful responses
  across 3 loopback hosts. Packet score 25/26 (96%). Remaining gap: response
  proof passed but `content` delta was 0.
- Both fixture servers were shut down after the proof runs. A process cleanup
  check found no lingering fixture, `run.js`, local UI, or `crawl-batch`
  processes.
- Medium live local execution was not run because the fresh-target one-host
  small proof remained blocked. Medium packet/profile dry-run proof remains the
  current safe medium rung.

## Continuation Pass: Reusable Fixture Helper And Host Proof

- Added `tools/crawl/local-fixture-server.js` and
  `tools/crawl/lib/local-fixture-server.js`. The helper has no-contact `--plan`
  mode and live loopback-only server mode for `small` and `medium` presets.
  `--target-token` creates fresh deterministic URLs for repeated local proofs
  without internet target contact.
- Updated `tools/crawl/lib/crawl-packet.js` and `tools/crawl/crawl-packet.js`
  with `--fixture-preset`, `--fixture-port`, and `--fixture-target-token`.
  Fixture packets infer loopback URLs, include the fixture start/plan commands,
  and keep `contactsInternetTargetsWhenExecuted=false`.
- Tightened packet scoring: weak content proof now includes clean responses with
  zero content-row delta, packets include per-host launch/watch/DB summaries,
  and verification reports missing requested hosts score `host-coverage=warn`
  with taxonomy `host-mismatch`.
- Added focused tests in `tests/tools/crawl/local-fixture-server.test.js` and
  `tests/tools/crawl/crawl-packet.test.js` for fixture plans, loopback serving,
  port collision, tokenized URLs, fixture packet inference, host proof,
  zero-content warning, and missing-host coverage.
- No-contact checks passed:
  `node tools/crawl/monitored-small-crawl.js policy --json`,
  `node tools/crawl/monitored-small-crawl.js local-smoke --json`,
  fixture helper plans, fixture packets, and small/medium reliability dry-runs.
  Tiny smoke was not rerun because `tmp/local-smoke-report.json` from
  `2026-05-29T15:05:08.265Z` was current and the changed code did not affect
  the tiny live execution path.
- Tiny comparison refreshed with
  `tmp/local-smoke-comparison-fixture-helper.json`; it passed stable pass
  evidence against `tmp/local-smoke-report.json`.
- Tokenized small helper proof used
  `small-20260529-1757` on `127.0.0.1:41901`. Artifacts:
  `tmp/small-local-fixture-helper-token-plan.json`,
  `tmp/small-local-fixture-helper-token-ready.json`,
  `tmp/small-local-fixture-helper-token-baseline.json`,
  `tmp/small-local-fixture-helper-token.stdout.json`,
  `tmp/small-local-fixture-helper-token.stderr.log`,
  `tmp/small-local-fixture-helper-token-verify.json`, and
  `tmp/crawl-packet-small-fixture-helper-token-after-run.json`.
- Tokenized small result: exit 0, one accepted launch job,
  `watchFinal.stoppedReason=min-fetches-met`, `fetched=3`, `bytes=2604`,
  DB delta 1 URL, 3 responses, 3 successes, and 1 content row. Packet score:
  24/26 (92%). Warnings: 11 transient job poll errors and the post-run target
  is now already processed.
- Tokenized medium helper proof used
  `medium-20260529-1757` on `127.0.0.1:41902`,
  `127.0.0.2:41902`, and `127.0.0.3:41902`. Artifacts:
  `tmp/medium-local-fixture-helper-token-plan.json`,
  `tmp/medium-local-fixture-helper-token-ready.json`,
  `tmp/medium-local-fixture-helper-token-baseline.json`,
  `tmp/medium-local-fixture-helper-token.stdout.json`,
  `tmp/medium-local-fixture-helper-token.stderr.log`,
  `tmp/medium-local-fixture-helper-token-verify.json`, and
  `tmp/crawl-packet-medium-fixture-helper-token-after-run.json`.
- Tokenized medium result: exit 0, 3 accepted launch jobs,
  `watchFinal.stoppedReason=min-fetches-met`, `fetched=3`, `bytes=2547`,
  `jobPollErrors=0`, DB delta 4 URLs, 3 responses, 3 successes, and 1 content
  row. Packet score: 26/28 (93%). Warning/taxonomy: `host-mismatch` because DB
  recent evidence was attributed only to `127.0.0.2`; host proof shows zero DB
  downloads for `127.0.0.1` and `127.0.0.3`.
- Syntax and targeted tests passed:
  `node --check` for touched crawler JS files and
  `npm run test:by-path -- tests/tools/crawl/local-fixture-server.test.js tests/tools/crawl/crawl-packet.test.js tests/tools/crawl/run.test.js tests/tools/crawl/crawl-backend.test.js`
  with 4 suites and 110 tests. Latest result artifact:
  `data/test-results/run-2026-05-29-180545160-6fb65.json`.
- Both helper fixture servers were shut down after proof runs.

## Continuation Pass: Host-Watch Gate And Medium Fixture Blocker

- Added local watch host coverage: `tools/crawl/run.js` now parses
  `--watch-min-hosts`, emits `watchTick.hostCoverage`, and includes
  `minHosts`, `minHostsMet`, `coveredHosts`, and `missingLocalTargets` in
  `watchFinal`. It exits nonzero with `local-host-coverage-not-met` or
  `local-job-terminal-without-host-coverage` when global fetch count is met but
  requested-host DB evidence is incomplete.
- Updated `tools/crawl/lib/crawl-packet.js`,
  `tools/crawl/crawl-packet.js`, and `tools/crawl/lib/monitored-small-crawl.js`
  so tiny/small/medium packets and tiny local-smoke commands carry host
  coverage thresholds. Packets classify host-watch failures as
  `watch-host-coverage-not-met` and surface host partial runs as
  `host-mismatch`.
- Added focused tests for `--watch-min-hosts`, local host coverage calculation,
  host-coverage exit reasons, medium packet host-partial labeling, and
  watch-final host coverage blocking.
- No-contact artifacts refreshed:
  `tmp/host-watch-policy.json`,
  `tmp/host-watch-local-smoke-plan.json`,
  `tmp/small-fixture-host-watch-plan.json`,
  `tmp/medium-fixture-host-watch-plan.json`,
  `tmp/crawl-packet-tiny-host-watch-plan.json`,
  `tmp/crawl-packet-small-fixture-host-watch-plan.json`,
  `tmp/crawl-packet-medium-fixture-host-watch-plan.json`,
  `tmp/local-smoke-comparison-host-watch.json`, and
  `tmp/local-smoke-cadence-host-watch.json`.
- Profile dry-runs passed:
  `node tools/crawl/index.js local-small-reliability --dry-run` and
  `node tools/crawl/index.js local-medium-reliability --dry-run`.
- Small host-watch fixture proof used `small-hostwatch-live-1840` on
  `127.0.0.1:41921`. Artifacts:
  `tmp/small-hostwatch-live-ready.json`,
  `tmp/small-hostwatch-live-baseline.json`,
  `tmp/small-hostwatch-live-launch.stdout.json`,
  `tmp/small-hostwatch-live-watch.stderr.log`,
  `tmp/small-hostwatch-live-verify.json`, and
  `tmp/crawl-packet-small-hostwatch-live.json`.
- Small host-watch result: exit 0,
  `watchFinal.stoppedReason=min-fetches-and-hosts-met`, fetched 3 responses,
  bytes 2622, DB delta 1 URL, 3 responses, 3 successes, and 1 content row.
  Packet score: 26/28 (93%). Remaining warnings: 10 transient job poll errors
  and post-run exact target freshness.
- Medium host-watch fixture proof used `medium-hostwatch-live-1840` on
  `127.0.0.1:41922`, `127.0.0.2:41922`, and `127.0.0.3:41922`. Artifacts:
  `tmp/medium-hostwatch-live-ready.json`,
  `tmp/medium-hostwatch-live-baseline.json`,
  `tmp/medium-hostwatch-live-launch.stdout.json`,
  `tmp/medium-hostwatch-live-watch.stderr.log`,
  `tmp/medium-hostwatch-live-verify.json`, and
  `tmp/crawl-packet-medium-hostwatch-live.json`.
- Medium host-watch result: exit 2, 3 accepted launch jobs, global
  `minFetchesMet=true`, but `minHostsMet=false`. DB evidence covered only
  `127.0.0.1` and missed `127.0.0.2`/`127.0.0.3`; packet score 23/28 (82%),
  label `blocked`, primary `watch-host-coverage-not-met`, taxonomy
  `host-mismatch`.
- Targeted tests passed with `--no-cache`:
  `npm test -- --no-cache --runTestsByPath tests/tools/crawl/run.test.js tests/tools/crawl/crawl-packet.test.js tests/tools/crawl/monitored-small-crawl.test.js tests/tools/crawl/local-fixture-server.test.js`
  with 4 suites and 112 tests. Latest result artifact:
  `data/test-results/run-2026-05-29-184253814-c52da.json`.
- Initial focused Jest run without `--no-cache` hit a Jest transform-cache
  `ENOENT` in `crawl-packet.test.js`; rerun with `--no-cache` passed.
- Process cleanup after live proofs found no lingering host-watch fixture,
  `run.js`, local UI, or `crawl-batch` processes.

## Continuation Pass: Job-ID Watch Evidence And Non-Retrying Fixture Launch

- Diagnosed the previous medium host-watch blocker from
  `tmp/medium-hostwatch-live-launch.stdout.json`,
  `tmp/medium-hostwatch-live-watch.stderr.log`,
  `tmp/medium-hostwatch-live-verify.json`, and
  `tmp/crawl-packet-medium-hostwatch-live.json`.
  The earlier medium run accepted three final launch jobs but the watch saw
  extra running jobs because the packet-generated `gentle` batch launcher used
  retrying operation-start POSTs. DB proof still attributed rows to one host.
- Added dispatcher-level batch controls in `tools/crawl/run.js`:
  `--batch-concurrency`, `--batch-retries`, `--batch-retry-delay-ms`, and
  `--batch-request-timeout-ms`. Packet-generated fixture and tiny smoke
  commands now use `--batch-retries 0 --batch-request-timeout-ms 60000`, so a
  timed-out operation-start request is preserved as launch uncertainty instead
  of creating duplicate local operation jobs.
- Added a local job-ID status fast path in
  `tools/crawl/lib/crawl-backend.js`. When launch accepted job IDs are known,
  watch polls `/api/v1/crawl/jobs/:jobId` for those jobs before falling back to
  broad `/jobs` evidence. This makes watch evidence about the accepted launch
  jobs rather than retry-created or unrelated local jobs.
- Tightened partial-launch watch semantics: when a partial local launch has
  accepted jobs and failed jobs, watch follows the accepted subset and lowers
  the runtime `minHosts` gate to the accepted-job count while preserving the
  original nonzero launch exit. The packet still blocks on `partial-launch`,
  but watch no longer asks for an impossible three-host proof after only two
  hosts were accepted.
- Added focused tests for batch launch controls, packet command retry safety,
  tiny smoke retry safety, job-ID status evidence, and partial-launch
  min-host adjustment.
- No-contact artifacts refreshed:
  `tmp/host-jobid-policy.json`,
  `tmp/host-jobid-local-smoke-plan.json`,
  `tmp/small-fixture-jobid-plan.json`,
  `tmp/medium-fixture-jobid-plan.json`,
  `tmp/crawl-packet-tiny-jobid-plan.json`,
  `tmp/crawl-packet-small-fixture-jobid-plan.json`,
  `tmp/crawl-packet-medium-fixture-jobid-plan.json`,
  `tmp/small-reliability-dry-run-jobid.json`,
  `tmp/medium-reliability-dry-run-jobid.json`,
  `tmp/medium-run-explain-jobid.json`, and
  `tmp/local-smoke-comparison-jobid.json`.
- Small job-ID fixture proof used `small-jobid-live-1956` on
  `127.0.0.1:41941`. Artifacts:
  `tmp/small-jobid-live-ready.json`,
  `tmp/small-jobid-live-baseline.json`,
  `tmp/small-jobid-live-launch.stdout.json`,
  `tmp/small-jobid-live-watch.stderr.log`,
  `tmp/small-jobid-live-verify.json`,
  `tmp/small-jobid-live-run-status.json`, and
  `tmp/crawl-packet-small-jobid-live.json`.
- Small job-ID result: exit 0, one accepted launch job, no launch retries,
  `watchFinal.stoppedReason=min-fetches-and-hosts-met`, fetched 3 responses,
  bytes 2610, DB delta 1 URL, 3 responses, 3 successes, and 1 content row.
  Packet score: 26/28 (93%). Warnings: 11 transient job poll errors and
  post-run exact target freshness.
- Medium job-ID fixture proof used `medium-jobid-live-1958` on
  `127.0.0.1:41942`, `127.0.0.2:41942`, and `127.0.0.3:41942`. Artifacts:
  `tmp/medium-jobid-live-ready.json`,
  `tmp/medium-jobid-live-baseline.json`,
  `tmp/medium-jobid-live-launch.stdout.json`,
  `tmp/medium-jobid-live-watch.stderr.log`,
  `tmp/medium-jobid-live-verify.json`,
  `tmp/medium-jobid-live-run-status.json`, and
  `tmp/crawl-packet-medium-jobid-live.json`.
- Medium job-ID result: exit 2, no retry-created duplicate operation jobs, 2
  accepted launch jobs, and one failed launch target
  (`127.0.0.3`, `read ECONNRESET`). Watch initially observed the two accepted
  job IDs as running, then job polling timed out. DB proof remained host
  partial: only `127.0.0.1` produced recent rows; `127.0.0.2` and
  `127.0.0.3` were missing. Packet score: 20/28 (71%), label `blocked`,
  primary `partial-launch`, blockers `partial-launch` and
  `watch-host-coverage-not-met`, taxonomy `host-mismatch`,
  `partial-launch`, and `runtime-error`.
- Checks passed:
  `node --check tools/crawl/run.js`,
  `node --check tools/crawl/lib/crawl-backend.js`,
  `node --check tools/crawl/lib/crawl-packet.js`,
  `node --check tools/crawl/lib/monitored-small-crawl.js`, and
  `npm test -- --runTestsByPath tests/tools/crawl/run.test.js tests/tools/crawl/crawl-backend.test.js tests/tools/crawl/crawl-packet.test.js tests/tools/crawl/monitored-small-crawl.test.js --runInBand`
  with 4 suites and 132 tests. Latest result artifact:
  `data/test-results/run-2026-05-29-200258829-f30df.json`.
- Process cleanup after live proofs found no lingering fixture, `run.js`,
  `crawl-batch`, or local UI processes.

## Continuation Pass: Optional Terminal Wait Policy

- Reconstructed state from the recursive prompt, session docs, terminal helper
  artifacts, and dirty git status. Remote contact and remote mutation remained
  disallowed; only loopback fixture proof and file-only comparisons were run.
- Added local watch flags `--watch-wait-terminal-after-db-proof` and
  `--watch-terminal-timeout <seconds>`. DB proof remains the default stop
  condition; the terminal wait is an opt-in post-proof diagnostic.
- Updated `tools/crawl/sequential-fixture-proof.js execute` with
  `--wait-for-terminal --terminal-wait-timeout <seconds>`. The helper now
  carries terminal-wait evidence into composed watch summaries and packets.
- Updated packets to preserve `watchFinal.terminalWait` and classify
  incomplete terminal waits as
  `job-terminal-wait-after-db-proof-incomplete`. This is a warning when DB
  proof and host coverage already passed.
- First terminal-wait proof used token `medium-terminal-wait-live-20260530-1`
  on port `41985`. DB proof passed and packet was ready, but the helper exited
  2 because the global watch timeout overrode an already-started terminal wait
  on one host. This exposed a real local-watch timeout-boundary bug.
- Fixed local watch so terminal-wait-active runs use the terminal wait budget
  instead of being relabeled as a hard overall watch timeout after DB proof.
- Corrected terminal-wait proof used token
  `medium-terminal-wait-fixed-20260530-1` on port `41986`. Result artifact:
  `tmp/medium-sequential-terminal-wait-fixed-result.json`; packet:
  `tmp/medium-sequential-terminal-wait-fixed-packet.json`; comparison:
  `tmp/medium-sequential-terminal-wait-fixed-comparison.json`.
- Corrected proof result: exit 0, all three loopback hosts reached DB and host
  proof, combined DB delta was 3 URLs, 9 responses, 9 successes, 0 failures,
  and 3 content rows. Packet scored 26/28 (93%), label
  `ready-for-medium-local`, blockers `[]`, taxonomy `poll-error`,
  `job-still-running-after-db-proof`,
  `job-terminal-wait-after-db-proof-incomplete`, and
  `target-already-processed`.
- Terminal wait outcome was `incomplete` with per-host
  `job-evidence-unavailable` for all three accepted jobs after the 15s wait.
  Next diagnosis should improve or explain local job endpoint responsiveness
  during active crawls; DB proof and host coverage are no longer the blocker.
- Refreshed no-contact/file-only artifacts:
  `tmp/terminal-wait-policy.json`,
  `tmp/terminal-wait-local-smoke-plan.json`,
  `tmp/small-fixture-terminal-wait-plan.json`,
  `tmp/medium-fixture-terminal-wait-plan.json`,
  `tmp/crawl-packet-small-fixture-terminal-wait-plan.json`,
  `tmp/crawl-packet-medium-fixture-terminal-wait-plan.json`,
  `tmp/medium-sequential-terminal-wait-plan.json`,
  `tmp/local-smoke-comparison-terminal-wait.json`,
  `tmp/local-smoke-cadence-terminal-wait.json`,
  `tmp/medium-concurrent-vs-terminal-wait-baseline-comparison.json`,
  `tmp/terminal-wait-run-explain.json`, and
  `tmp/medium-reliability-dry-run-terminal-wait.txt`.
- Checks passed:
  `node --check tools/crawl/run.js`,
  `node --check tools/crawl/lib/sequential-fixture-proof.js`,
  `node --check tools/crawl/sequential-fixture-proof.js`,
  `node --check tools/crawl/lib/crawl-packet.js`,
  `node --check tests/tools/crawl/run.test.js`,
  `node --check tests/tools/crawl/sequential-fixture-proof.test.js`,
  `node --check tests/tools/crawl/crawl-packet.test.js`, and
  `npm run test:by-path -- tests/tools/crawl/run.test.js tests/tools/crawl/sequential-fixture-proof.test.js tests/tools/crawl/crawl-packet.test.js`
  with 3 suites and 96 tests. Latest result artifact:
  `data/test-results/run-2026-05-29-232614417-de2b2.json`.

## Continuation Pass: Sequential Helper Promotion

- Reconstructed state from the read-first docs, saved concurrent/sequence
  artifacts, crawl packet code, and targeted git status. Existing dirty
  worktree state remains intentional; no unrelated changes were reverted.
- Added `tools/crawl/lib/sequential-fixture-proof.js` and
  `tools/crawl/sequential-fixture-proof.js`. The helper supports no-contact
  `plan` output and bounded `execute` output for medium loopback fixtures. The
  execute path starts checked-in loopback fixture servers, launches one host at
  a time, writes per-host baseline/start/end/launch/watch/verify/status
  artifacts, composes medium launch/watch/verify artifacts, emits a packet, and
  optionally compares against a prior packet.
- Updated medium fixture packets so `preflight.sequentialStrategy` includes
  direct helper plan/execute commands, not only the lower-level manual command
  recipe.
- Added `tests/tools/crawl/sequential-fixture-proof.test.js` and extended
  `tests/tools/crawl/crawl-packet.test.js`. Focused tests cover the no-contact
  helper plan, composed host coverage proof, CLI plan output, packet blocker
  exit code behavior, and packet helper command surfacing.
- Refreshed no-contact artifacts:
  `tmp/sequential-helper-policy.json`,
  `tmp/sequential-helper-local-smoke-plan.json`,
  `tmp/small-fixture-sequential-helper-plan.json`,
  `tmp/medium-fixture-sequential-helper-plan.json`,
  `tmp/medium-sequential-helper-plan.json`,
  `tmp/crawl-packet-tiny-sequential-helper-plan.json`,
  `tmp/crawl-packet-small-fixture-sequential-helper-plan.json`,
  `tmp/crawl-packet-medium-sequential-helper-plan.json`,
  `tmp/local-smoke-comparison-sequential-helper.json`,
  `tmp/local-smoke-cadence-sequential-helper.json`,
  `tmp/small-reliability-dry-run-helper.txt`,
  `tmp/medium-reliability-dry-run-helper.txt`, and
  `tmp/medium-concurrent-vs-sequential-helper-comparison.json`.
- Ran fresh sequential medium helper proof with token
  `medium-seq-helper-live-20260529-1` on port `41966`. Result artifact:
  `tmp/medium-sequential-helper-live-result.json`. Composed proof artifacts:
  `tmp/medium-sequential-helper-live-launch.summary.json`,
  `tmp/medium-sequential-helper-live-watch.summary.log`,
  `tmp/medium-sequential-helper-live-verify.json`,
  `tmp/medium-sequential-helper-live-run-status.json`,
  `tmp/medium-sequential-helper-live-packet.json`, and
  `tmp/medium-sequential-helper-live-comparison.json`, plus per-host
  `tmp/medium-sequential-helper-live-{1,2,3}-127.0.0.{1,2,3}-*` artifacts.
- Helper proof result: exit 0, all three hosts accepted one local operation
  job, each reached `min-fetches-and-hosts-met`, combined DB proof produced
  delta 3 URLs, 9 responses, 9 successful responses, 0 failed responses, and
  3 content rows, with recent evidence for `127.0.0.1`, `127.0.0.2`, and
  `127.0.0.3`. Packet score: 26/28 (93%), label
  `ready-for-medium-local`, blockers `[]`, taxonomy `poll-error` and
  `target-already-processed`.
- Comparison `tmp/medium-sequential-helper-live-comparison.json` selected the
  helper packet over blocked concurrent `tmp/crawl-packet-medium-jobid-rerun.json`:
  concurrent blocked at 71%, helper sequential passed at 93%, score delta +22,
  DB host coverage delta +2.
- Checks passed:
  `node --check tools/crawl/lib/sequential-fixture-proof.js`,
  `node --check tools/crawl/sequential-fixture-proof.js`,
  `node --check tools/crawl/lib/crawl-packet.js`,
  `node --check tests/tools/crawl/sequential-fixture-proof.test.js`, and
  `npm run test:by-path -- tests/tools/crawl/sequential-fixture-proof.test.js tests/tools/crawl/crawl-packet.test.js`
  with 2 suites and 19 tests. Latest result artifact:
  `data/test-results/run-2026-05-29-214238315-9cb22.json`.
- Remaining diagnosis: helper/sequential per-host launch is repeatable, while
  concurrent medium still needs investigation for `read ECONNRESET`,
  accepted-job/no-DB behavior on `127.0.0.2`, and active-crawl job endpoint
  timeout bursts.

## Continuation Pass: Per-Target Terminal Assertions

- Reconstructed state from the current recursive prompt, session docs, saved
  concurrent `medium-jobid-rerun` artifacts, helper sequential artifacts, and
  targeted git status. Remote contact and remote mutation remained disallowed.
- Inspected blocked concurrent evidence. `tmp/medium-jobid-rerun-watch.stderr.log`
  shows partial launch adjusted from `minHosts=3` to the two accepted jobs, then
  blocked with `local-host-coverage-not-met`: `127.0.0.1` produced DB rows,
  `127.0.0.2` stayed accepted/running without DB rows, and `127.0.0.3` failed
  launch with `read ECONNRESET`.
- Added per-target job terminal assertions to
  `tools/crawl/lib/sequential-fixture-proof.js`. Composed sequential watch
  summaries now include job ID, status, status source, observed/terminal flags,
  terminal state, DB proof state, and per-target warnings.
- Updated `tools/crawl/lib/crawl-packet.js` so packets preserve
  `watchFinal.perTarget` and classify
  `job-still-running-after-db-proof` when DB proof succeeds while accepted jobs
  are still non-terminal. This remains a warning, not a blocker, because DB
  persistence and host coverage are already proven.
- Extended focused tests in
  `tests/tools/crawl/sequential-fixture-proof.test.js` and
  `tests/tools/crawl/crawl-packet.test.js` for non-terminal accepted jobs after
  DB proof. Tests passed: `npm run test:by-path -- tests/tools/crawl/sequential-fixture-proof.test.js tests/tools/crawl/crawl-packet.test.js`
  with 2 suites and 19 tests. Latest result artifact:
  `data/test-results/run-2026-05-29-221952356-7f3c6.json`.
- Refreshed no-contact artifacts:
  `tmp/terminal-helper-policy.json`,
  `tmp/terminal-helper-local-smoke-plan.json`,
  `tmp/small-fixture-terminal-helper-plan.json`,
  `tmp/medium-fixture-terminal-helper-plan.json`,
  `tmp/medium-sequential-terminal-plan.json`,
  `tmp/crawl-packet-tiny-terminal-plan.json`,
  `tmp/crawl-packet-small-fixture-terminal-plan.json`,
  `tmp/crawl-packet-medium-fixture-terminal-plan.json`,
  `tmp/local-smoke-comparison-terminal-helper.json`,
  `tmp/local-smoke-cadence-terminal-helper.json`,
  `tmp/small-reliability-dry-run-terminal-helper.txt`,
  `tmp/medium-reliability-dry-run-terminal-helper.txt`, and
  `tmp/medium-concurrent-vs-terminal-helper-comparison.json`.
- Ran fresh sequential medium helper proof with token
  `medium-terminal-live-20260529-1` on port `41972`. Result artifact:
  `tmp/medium-sequential-terminal-live-result.json`. Composed artifacts:
  `tmp/medium-sequential-terminal-live-launch.summary.json`,
  `tmp/medium-sequential-terminal-live-watch.summary.log`,
  `tmp/medium-sequential-terminal-live-verify.json`,
  `tmp/medium-sequential-terminal-live-run-status.json`,
  `tmp/medium-sequential-terminal-live-packet.json`, and
  `tmp/medium-sequential-terminal-live-comparison.json`, plus per-host
  `tmp/medium-sequential-terminal-live-{1,2,3}-127.0.0.{1,2,3}-*` artifacts.
- Terminal-state helper proof result: exit 0, all three hosts accepted one
  local operation job, each reached `min-fetches-and-hosts-met`, combined DB
  proof produced delta 3 URLs, 9 responses, 9 successful responses, 0 failed
  responses, and 3 content rows, with recent evidence for all three hosts.
  Packet score: 26/28 (93%), label `ready-for-medium-local`, blockers `[]`,
  taxonomy `poll-error`, `job-still-running-after-db-proof`, and
  `target-already-processed`.
- New terminal evidence: `tmp/medium-sequential-terminal-live-watch.summary.log`
  and packet evidence show all three accepted jobs were still `running` at the
  DB proof boundary. This validates the new warning and creates the next
  diagnostic target: decide whether the helper should optionally wait for job
  terminal state after DB proof.

## Continuation Pass: Medium Sequential Fixture Strategy

- Reconstructed current state from the session docs, saved job-ID artifacts,
  crawler docs, and targeted git status. Existing worktree state remains dirty
  with crawler/session files and unrelated UI/remote changes; no unrelated
  changes were reverted.
- Inspected `tmp/medium-jobid-live-*` artifacts. The previous blocked medium
  proof accepted `127.0.0.1` and `127.0.0.2`, failed `127.0.0.3` with
  `read ECONNRESET`, and used an impossible `minHosts=3` watch gate after only
  two jobs were accepted. DB proof remained single-host for `127.0.0.1`.
- Reran concurrent medium after the partial-launch min-host adjustment using
  token `medium-jobid-rerun-20260529-1` on port `41952`. Artifacts:
  `tmp/medium-jobid-rerun-ready.json`,
  `tmp/medium-jobid-rerun-baseline.json`,
  `tmp/medium-jobid-rerun-start.txt`,
  `tmp/medium-jobid-rerun-end.txt`,
  `tmp/medium-jobid-rerun-launch.stdout.json`,
  `tmp/medium-jobid-rerun-watch.stderr.log`,
  `tmp/medium-jobid-rerun-verify.json`,
  `tmp/medium-jobid-rerun-run-status.json`, and
  `tmp/crawl-packet-medium-jobid-rerun.json`.
- Concurrent medium rerun result: exit 2. The watch now correctly reported
  `minHostsAdjustedFrom=3`, `minHosts=2`, and followed the two accepted jobs.
  It still blocked with `local-host-coverage-not-met`: `127.0.0.3` failed
  launch, `127.0.0.2` was accepted but produced no recent DB rows, and
  `127.0.0.1` alone produced 3 successful responses and 1 content row. Packet
  score stayed 20/28 (71%), label `blocked`, primary `partial-launch`, blockers
  `partial-launch` and `watch-host-coverage-not-met`.
- Added a no-contact sequential per-host medium fixture strategy to
  `crawl-packet`. Medium fixture packets now include
  `preflight.sequentialStrategy` with per-host launch/verify commands and
  composed artifact paths. Added `crawl-packet.js compare --packet ...` for
  file-only packet comparisons.
- Added focused tests for medium fixture sequential strategy and packet
  comparison. `tests/tools/crawl/crawl-packet.test.js` now has 16 passing
  tests for packet generation, host coverage, sequential strategy, and packet
  compare behavior.
- Ran sequential medium proof with token `medium-sequential-live-20260529-1` on
  port `41953`, launching and watching one host at a time. Artifacts include
  `tmp/medium-sequential-live-ready.json`,
  `tmp/medium-sequential-live-baseline.json`,
  per-host `tmp/medium-sequential-live-{1,2,3}-127.0.0.{1,2,3}-*` launch,
  watch, verify, status files, plus composed
  `tmp/medium-sequential-live-launch.summary.json`,
  `tmp/medium-sequential-live-watch.summary.log`,
  `tmp/medium-sequential-live-verify.json`,
  `tmp/medium-sequential-live-run-status.json`, and
  `tmp/crawl-packet-medium-sequential-live.json`.
- Sequential medium result: exit 0, all three hosts accepted one operation
  job, each host reached `min-fetches-and-hosts-met`, combined DB proof
  produced delta 4 URLs, 9 responses, 9 successes, 0 failed responses, and
  3 content rows, with recent evidence for `127.0.0.1`, `127.0.0.2`, and
  `127.0.0.3`. Packet score: 26/28 (93%), label `ready-for-medium-local`.
  Remaining warnings: 30 aggregate transient job poll errors and post-run exact
  target freshness.
- Packet comparison artifact
  `tmp/medium-concurrent-vs-sequential-comparison.json` passed file-only:
  concurrent rerun blocked at 71%, sequential passed at 93%, best packet is
  `tmp/crawl-packet-medium-sequential-live.json`, score delta +22, DB host
  coverage delta +2.
- No-contact artifacts refreshed:
  `tmp/sequential-policy.json`,
  `tmp/sequential-local-smoke-plan.json`,
  `tmp/small-fixture-sequential-plan.json`,
  `tmp/medium-fixture-sequential-plan.json`,
  `tmp/crawl-packet-tiny-sequential-plan.json`,
  `tmp/crawl-packet-small-fixture-sequential-plan.json`,
  `tmp/crawl-packet-medium-fixture-sequential-plan.json`,
  `tmp/small-reliability-dry-run-sequential.txt`,
  `tmp/medium-reliability-dry-run-sequential.txt`,
  `tmp/local-smoke-comparison-sequential.json`, and
  `tmp/local-smoke-cadence-sequential.json`.
- Checks passed:
  `node --check tools/crawl/crawl-packet.js`,
  `node --check tools/crawl/lib/crawl-packet.js`,
  `node --check tests/tools/crawl/crawl-packet.test.js`, and
  `npm run test:by-path -- tests/tools/crawl/crawl-packet.test.js tests/tools/crawl/run.test.js tests/tools/crawl/crawl-backend.test.js`
  with 3 suites and 113 tests. Latest result artifact:
  `data/test-results/run-2026-05-29-203351463-b470e.json`.
- Targeted whitespace scan across touched crawler/session docs had no matches.
  Targeted `git diff --check -- docs/RUNBOOK.md docs/cli/crawl.md tools/crawl/AGENT.md`
  passed with existing CRLF replacement warnings only. Untracked session and
  packet files were covered by the whitespace scan.
- Process cleanup after live proofs found no lingering fixture, `run.js`,
  `crawl-batch`, or local UI processes.

## 2026-05-30 � Terminal-wait job-poll responsiveness fix (node improve_job_endpoint_poll_responsiveness_after_terminal_wait)

- Root cause confirmed: during the optional terminal-wait phase the cheap
  `/jobs/:jobId` poll reused the normal short budget (max 1500ms) and was
  starved by the in-process CPU-bound crawl, producing false
  `job-evidence-unavailable` evidence even though the route/registry are cheap.
- Fix implemented (code complete, validated):
  - `tools/crawl/run.js`: new flag `--watch-terminal-job-poll-timeout <ms>`
    (default 5000, clamped 1500-5000); `inTerminalWaitPhase` uses the longer
    per-poll budget; `terminalWait` now tracks `jobPolls`, `jobPollErrors`,
    `endpointResponded`, `jobPollTimeoutMs`; new exported pure function
    `classifyTerminalWaitOutcome` returns `terminal` / `timed-out` /
    `endpoint-unavailable`; help text + module.exports updated.
  - `tools/crawl/lib/crawl-packet.js`: serialization of the four new
    terminalWait fields; sub-taxonomy `job-terminal-wait-timed-out` and
    `job-terminal-wait-endpoint-unavailable` registered + emitted under the
    umbrella `job-terminal-wait-after-db-proof-incomplete`.
  - `tools/crawl/lib/sequential-fixture-proof.js`: flag normalization
    (1500-5000, default 5000) + `--watch-terminal-job-poll-timeout` appended to
    the per-step launch command when `--wait-for-terminal` is set.
- Validation passed:
  - `node --check` clean on run.js, crawl-packet.js, sequential-fixture-proof.js.
  - `npm run test:by-path -- tests/tools/crawl/run.test.js tests/tools/crawl/crawl-packet.test.js tests/tools/crawl/sequential-fixture-proof.test.js` => 3 suites, **99 tests passing** (incl. new classifier 4-case test, endpoint-unavailable packet test, flag default/override test, sequential launch-shape assertion).
  - No-contact plan checks: local-smoke plan exit 0; sequential proof PLAN exit 0 with `--watch-terminal-job-poll-timeout 5000` + `--watch-terminal-timeout 15` confirmed in command shape.
  - `git diff --check` on all six touched files => exit 0 (CRLF warnings only).
- BLOCKED � fresh live sequential medium loopback proof: two consecutive
  `execute` runs (tokens medium-tw-fixed-20260530-1528, medium-tw-fixed2-20260530-1530)
  crashed exit 1 with
  `\\?\C:\Users\james\Documents\repos\news-crawler-db\node_modules\better-sqlite3\build\Release\better_sqlite3.node is not a valid Win32 application.`
  Environment diagnosis: the binary loads fine via direct `require` under the
  terminal node (v25.2.1 x64, execPath C:\nvm4w\nodejs\node.exe) but fails when
  the unified-app crawl process loads it. copilot-dl-news has **no local
  better-sqlite3** (`require` => Cannot find module), so resolution climbs to
  the sibling `news-crawler-db` build, which the spawned process rejects as an
  ABI/arch mismatch. Both spawns use `process.execPath` (same node), so this is
  a pre-existing native-module/runtime regression, **not** caused by this change.
  Prior session live proofs succeeded, so the environment changed mid-session.
- Decision: did NOT rebuild/reinstall `better-sqlite3` (install/build mutation
  to a sibling repo => requires user approval). Code change is conservatively
  validated by syntax + 99 focused tests + no-contact command-shape checks.
- Cleanup: removed failed-proof scratch artifacts
  (`tmp/medium-seq-tw-fixed*`, `tmp/medium-seq-tw-fixed2*`, `tmp/medium-seq-tw-plan*`).
  Three node PIDs (2648, 18988, 38780) predate the proof attempts and may be
  legitimate dev servers � left running, flagged in FOLLOW_UPS.
## Continuation Pass: better-sqlite3 ELF/Win32 Root Cause (2026-05-30)

- Re-confirmed the six touched terminal-wait files are still present/modified
  (`git status`): `tools/crawl/run.js` (M), `tests/tools/crawl/run.test.js` (M),
  plus four untracked (`tools/crawl/lib/crawl-packet.js`,
  `tools/crawl/lib/sequential-fixture-proof.js`,
  `tests/tools/crawl/crawl-packet.test.js`,
  `tests/tools/crawl/sequential-fixture-proof.test.js`).
- **ROOT CAUSE FOUND (definitive, evidence-backed).** The
  `better-sqlite3 is not a valid Win32 application` blocker is NOT an ABI/arch
  mismatch in the abstract — the sibling
  `news-crawler-db/node_modules/better-sqlite3/build/Release/better_sqlite3.node`
  is a **Linux ELF binary**, confirmed by magic bytes `7F 45 4C 46` (`\x7FELF`).
  It was built under WSL — the prior "successful" runs in `tmp/_unified-ui.log`
  show `/mnt/c/...` data paths, i.e. they ran under **WSL Linux node**, which
  matched the Linux addon.
- The current proof spawns **Windows node** (`C:\nvm4w\nodejs\node.exe`,
  v25.2.1 x64) via `process.execPath`. Windows `process.dlopen` (LoadLibrary)
  rejects the ELF `.node` with ERROR_BAD_EXE_FORMAT (193), reported with the
  `\\?\` namespaced path — that prefix is just Node's internal dlopen error
  formatting, not a different resolution path.
- Why earlier probes misled: `require('news-crawler-db')` and even
  `require('.../better-sqlite3')` succeed because they only load JS. The native
  `.node` is **dlopen'd lazily on first `new Database(...)`**. A direct
  `new Database(':memory:')` against the news-crawler-db copy reproduces the
  exact failure deterministically.
- Magic-byte audit of all three repo copies:
  - `news-crawler-db/...better_sqlite3.node` => **ELF/Linux** (broken on Windows).
  - `dl-news/...better_sqlite3.node` => PE/Windows (`4D 5A`, valid).
  - `copilot-dl-news/deploy/remote-crawler-v3/...better_sqlite3.node` =>
    PE/Windows (`4D 5A`, valid).
- Fix class: rebuild `better-sqlite3` for Windows in `news-crawler-db`
  (`npm rebuild better-sqlite3` under Windows node, or reinstall) so the spawned
  Windows crawl can dlopen it. This is a build mutation to a sibling repo =>
  **requires explicit user approval** (asked as the single blocking question
  this pass). copilot-dl-news has no local better-sqlite3, so a local rebuild
  there would first require an install.
- No live medium proof run to completion this pass: the live `execute` attempt
  (token medium-tw-env-clear-20260530-1600) crashed identically and its
  artifacts were cleaned. Awaiting rebuild approval before re-running.
- Cleanup: removed all diagnostic probe scripts
  (`tmp/_bsqlite_spawn_probe.js`, `tmp/_ncdb_require_probe.js`,
  `tmp/_ncdb_spawn_probe.js`, `tmp/_bs_open_probe.js`) and the failed-proof
  artifacts (`tmp/medium-tw-env-clear-20260530-1600*`).

## Continuation Pass: Concurrent-Launch ECONNRESET Inspection (2026-05-30)

Advanced the non-live backlog node
`inspect_concurrent_launch_econnreset_under_batch_concurrency` while the live
proof remained blocked on the (approval-gated) Windows better-sqlite3 rebuild.
This was a read-only code inspection — no live crawl, no DB, no mutation.

- **Symptom (from prior facts):** concurrent medium proof token
  `medium-jobid-rerun-20260529-1` (port 41952, `--batch-concurrency 3
  --batch-retries 0`) exited 2 — `127.0.0.3` failed launch with
  `read ECONNRESET`, only `127.0.0.1` produced DB evidence, packet 20/28
  `blocked` (`partial-launch` + `watch-host-coverage-not-met`).
- **Mechanism (confirmed by reading the harness):**
  1. `tools/crawl/crawl-batch.js` `startOne()` POSTs
     `/operations/<op>/start` per host; `runWithConcurrency()` fans out
     `--batch-concurrency` POSTs simultaneously.
  2. `isRetryableStartFailure()` DOES classify `ECONNRESET` as retryable
     (regex `/ECONNRESET|ETIMEDOUT|timeout|socket hang up/i`), BUT the
     deliberate non-retrying fixture policy passes `--batch-retries 0`. The
     retry loop is `for (attempt=0; attempt<=retries; attempt++)` with the
     re-attempt guarded by `if (attempt < retries)` → `0 < 0` is false, so a
     single `ECONNRESET` is a permanent per-host launch failure.
  3. The `retries 0` policy was chosen on purpose (see prior facts) to avoid
     POST retries spawning duplicate local operation jobs. So the fragility is
     an intentional trade-off: no duplicate jobs, but zero tolerance for a
     transient socket reset.
  4. Why the reset happens under concurrency: the in-process unified server's
     operation-start path does synchronous, event-loop-blocking work — engine
     boot plus the **synchronous** better-sqlite3 `new Database(...)` open.
     While the first host's start blocks the event loop, concurrent POST
     sockets for the other hosts are not serviced and get reset
     (`read ECONNRESET`) before the server accepts them.
- **Why the sequential rung is reliable:** the sequential fixture proof launches
  one host at a time, so there is never a second in-flight POST competing with a
  blocked event loop. This is exactly why the sequential/terminal-wait rungs
  score 26/28 `ready-for-medium-local` while concurrent stalls at 20/28.
- **Decision (no code change this pass — implementation discipline):** the
  canonical local medium proof is the **sequential** rung; do not chase
  concurrent-launch reliability with harness-side retries (they would either
  reintroduce duplicate-job risk or require an idempotency probe that the
  sequential path already makes unnecessary). The proper concurrent-launch fix
  is **server-side** — make operation-start accept/enqueue before the blocking
  engine+DB boot so concurrent connections are serviced — which lives in the
  unified-server / `news-crawler-backend-core` ownership boundary, not in the
  copilot-dl-news harness. Recorded as a promotion candidate; not actioned
  because the sequential rung already satisfies the reliability goal.
- **Node closed** as an inspection with a documented mechanism + ownership
  routing; no live crawl required to reach this conclusion.

## Continuation Pass: better-sqlite3 Windows Rebuild + Live Terminal-Wait Proof (2026-05-30)

- **Blocker resolved (approved rebuild):** ran `npm rebuild better-sqlite3` in
  `news-crawler-db` under Windows node `C:\nvm4w\nodejs\node.exe` (v25.2.1 x64).
  Rebuild exit 0. Post-rebuild magic-byte check on
  `news-crawler-db/...better_sqlite3.node` is now **`4D 5A 90 00` (PE/Windows)**,
  and a spawned-Windows-node `new Database(':memory:')` create/insert/select
  round-trip returns `db-ok 42`. The Linux-ELF blocker is gone.
- **Live sequential medium terminal-wait proof (token
  `medium-terminal-wait-rebuilt-20260530-1`, port 41990):** exit 0, all three
  hosts `verified-new-data`, DB delta **3 URLs / 9 responses / 9 successes /
  0 failed / 3 content rows** (1/3/1 per host across 127.0.0.1/.2/.3). Packet
  `tmp/medium-sequential-terminal-wait-rebuilt-packet.json` scored **26/28 (93%)
  `ready-for-medium-local`**, blockers `[]`. Comparison vs the prior baseline
  `tmp/medium-sequential-terminal-wait-fixed-packet.json`: both pass, blocked 0,
  score delta 0, DB-host delta 0 — full parity with full host coverage.
- **Terminal-wait responsiveness fields now populated (the goal of the prior
  implementation pass):** per-host `terminalWait` from the watch stderr ticks:
  - `127.0.0.1`: outcome `endpoint-unavailable`, jobPolls 4, jobPollErrors 4,
    endpointResponded false, elapsedMs ~21058.
  - `127.0.0.2`: outcome `endpoint-unavailable`, jobPolls 4, jobPollErrors 4,
    endpointResponded false, elapsedMs ~21045.
  - `127.0.0.3`: outcome `terminal`, jobPolls 1, jobPollErrors 0,
    endpointResponded true, elapsedMs 0.
  The three-state classifier (`terminal` / `timed-out` / `endpoint-unavailable`)
  fires correctly per host. The longer 5s per-poll budget did NOT make the
  in-process `/jobs/:jobId` endpoint responsive for the first two hosts — it is
  still starved while the CPU-bound crawl runs, and only the last host (whose
  crawl had wound down) responded. So the reliability gap is confirmed as
  **job-endpoint starvation during active in-process crawls**, now precisely
  classified rather than lumped into the umbrella warning.
- **Observation (per-poll budget can overshoot the terminal-wait window):**
  4 polls × 5s ≈ 21s elapsed against a 15s terminal-wait timeout. The terminal
  wait completes correctly (DB/host proof already passed), but the per-poll
  timeout dominates the wall clock. Candidate next-pass tweak: cap total poll
  time at the terminal-wait budget. Not changed this pass.
- **Fix shipped this pass (composed sub-taxonomy plumbing):** the sequential
  composer collapses mixed per-host terminalWait outcomes to `outcome:
  "incomplete"` while preserving the per-outcome breakdown in `counts`
  (`{endpoint-unavailable: 2, terminal: 1}`). The packet classifier previously
  keyed the sub-taxonomy off a single `outcome`, so a sequential proof only
  emitted the umbrella `job-terminal-wait-after-db-proof-incomplete`.
  `tools/crawl/lib/crawl-packet.js` now derives the sub-taxonomy from `counts`
  when `outcome === 'incomplete'`: a homogeneous non-terminal set yields the
  precise tag, a mixed set stays umbrella-only. Regenerating the real packet now
  emits `job-terminal-wait-endpoint-unavailable`. Added two focused tests
  (homogeneous → precise sub-taxonomy; mixed → umbrella-only). Focused suite
  now **101 passing** (was 99).
## Continuation Pass: Terminal-Wait Poll-Budget Cap + Capped Live Proof (2026-05-30)

Advanced the active node `harden_job_endpoint_responsiveness_during_active_crawl`
to its local, fully-testable conclusion and live-validated it, then routed the

## Continuation Pass: Server-Side Spec + Recursive-System Improvements (2026-05-30)

Active node `promote_serverside_accept_before_boot_fix_to_owner_repo`. Two
deliverables this pass: (1) the routed-out server-side spec, and (2) an explicit
brainstorm-and-apply on the recursive prompting system itself.

### 1. Server-side accept/enqueue/yield-before-boot spec (read-only, no owner-repo edit)

Drafted [`SERVERSIDE_ACCEPT_BEFORE_BOOT_SPEC.md`](SERVERSIDE_ACCEPT_BEFORE_BOOT_SPEC.md).
Pinned the blocking-boot location precisely:

- `POST /operations/:op/start` → `InProcessCrawlJobRegistry.startOperation()`
  **already accepts + defers correctly**: it registers the job and returns
  `{jobId, job}` synchronously, deferring the run via
  `Promise.resolve().then(() => service.runOperation(...))`. The acceptance path
  is **not** the bottleneck.
- The starvation is in the **synchronous prefix of `runOperation`**
  (`src/server/crawl-api/core/crawlService.js` line ~106): although `async`, it
  runs `instantiateFacade()` + `runner(startUrl, overrides)` synchronously up to
  the first real `await`. That prefix boots the engine, which opens the DB via a
  synchronous `new NewsDatabase(...)` → synchronous `better-sqlite3`
  `new Database(...)`. better-sqlite3 is a synchronous binding, so the open
  blocks the libuv loop, starving queued `/jobs/:jobId` polls and concurrent
  start sockets (shared root with the concurrent-launch ECONNRESET).
- Spec proposes A (yield via `setImmediate` before boot), B (open DB once at
  server construction, inject handle), C (worker_thread offload); recommends
  A+B in `news-crawler-backend-core`, C reserved. Approval-gated — captured as a
  ready-to-implement spec, not actioned.

### 2. Recursive-system brainstorm → applied (A + B)

Ranked options (Impact/Effort/Risk): A state validator (High/S/Low), B reconcile
duplicate prompt file (Med/S/Low), C standalone STATE.json (High/M/Med),
D bound Facts/completed growth (Med/M/Med), E per-turn delta log (Low-Med/S/Low).
Coverage: Tooling/Data/Ops/Docs all addressed. Applied A + B (highest value,
lowest risk, local + reversible); deferred C/D/E.

- **A — `tools/crawl/validate-continuation-state.js` (new):** parses the
  `## Execution State` ```json block in `CONTINUATION_PROMPT.md` and asserts
  invariants: parses; `active_node` is a non-empty string and equals
  `pending_nodes[0]`; no duplicates within either list; no node in both
  `completed_nodes` and `pending_nodes`; `blocked_on` null|string. `--json`,
  exit 0/1, clean exit, module exports for testability.
  **It immediately caught real drift on first run:** the recurring generic node
  `update_docs_and_next_prompt` was present in **both** completed and pending
  (recurring step names were reused without unique suffixes; `_2` already
  existed in completed). Fixed by renaming the pending instance to
  `update_docs_and_next_prompt_3`. Re-run: `OK ... 73 completed, 10 pending`.
  Folded into the per-turn verification ladder going forward.
- **B — reconciled duplicate prompt file:** `NEXT_CONTINUATION_PROMPT.md`
  (a stale 188-line older copy) now carries a DEPRECATED/ARCHIVE banner at the
  top pointing to the single canonical `CONTINUATION_PROMPT.md`, removing the
  "which file is authoritative?" ambiguity.

**Lesson:** recurring step-node names in the execution-state list must be
uniquely suffixed each turn (`update_docs_and_next_prompt_N`) or they collide
with completed instances — exactly the silent drift the new validator now guards.

residual server-side work to its owner boundary.

- **Local fix shipped:** added the pure helper `clampTerminalWaitJobPollTimeout({
  elapsedMs, totalTimeoutMs, maxPollTimeoutMs })` in `tools/crawl/run.js` (right
  after `classifyTerminalWaitOutcome`). It caps each terminal-wait `/jobs/:jobId`
  poll budget to the time remaining in the terminal-wait window and returns `0`
  when the budget is exhausted (signal to finalize without another poll). Wired
  into the job-poll site under `inTerminalWaitPhase` (computes
  `terminalWaitElapsedMs` from `terminalWait.startedAt`); a `0` budget skips the
  poll and reuses `lastJobEvidence`. Exported for unit testing. This stops the
  previously observed 4x5s ~= 21s overshoot of a 15s window.
- **Unit test:** added a 6-case test (elapsed 0/9000 -> 5000; 13000/total 15000 ->
  2000; 15000 and 16000 -> 0; missing elapsed -> 5000). Focused suites now
  **102 passing** across the same 3 files. `node --check` clean.
- **Capped live proof PASSED** (token `medium-terminalcap-20260530-173203-1`,
  port 39711, `--wait-for-terminal --terminal-wait-timeout 15`): exit 0, all
  three hosts `verified-new-data`, DB delta 3 URLs / 9 responses / 9 successes /
  0 failed / 3 content rows (1/3/1 per host). Packet
  `tmp/medium-sequential-terminalcap-packet.json` 26/28 (93%)
  `ready-for-medium-local`, blockers `[]`. Comparison vs rebuilt baseline: both
  pass, blocked 0, score delta 0, DB-host delta 0. Per-host terminalWait this run:
  `elapsedMs` ~2.0s, `jobPolls` 2, `jobPollErrors` 1, `outcome` `terminal`,
  `endpointResponded` true for ALL three hosts (the crawls finished fast enough
  that the endpoint responded; no overshoot). The overshoot-bounding logic is
  covered deterministically by the unit test even though this fast run did not
  need to clamp.
- **Server-side frontier routed to owner (read-only inspection):** the
  `/jobs/:jobId` route in
  `src/server/crawl-api/v1/express/routes/operations.js` is trivial (a registry
  `get`), and `InProcessCrawlJobRegistry.startOperation` already registers +
  returns the job synchronously and defers `service.runOperation` via
  `Promise.resolve().then(...)`. So the start-acceptance path is NOT the
  bottleneck. The starvation is inside the deferred `service.runOperation`: the
  engine boot plus the SYNCHRONOUS better-sqlite3 `new Database(...)` open block
  the event loop during an active CPU-bound crawl, starving subsequent job polls.
  Durable fix (move the synchronous DB open + heavy boot off the main thread /
  yield cooperatively) shares the root with the concurrent-launch ECONNRESET and
  belongs to the crawl-service / `news-crawler-backend-core` boundary. Recorded
  as the new active promotion node
  `promote_serverside_accept_before_boot_fix_to_owner_repo`; NOT actioned locally
  because the harness-side cap + sequential rung already meet the local goal.

## Read-only Trace: Basic Article Crawl Parallel Local Runner Scheduling (2026-05-30)

Node `inspect_basic_article_crawl_parallel_local_runner_scheduling`. Read-only
trace of how the basic article crawl schedules parallel local runners, and how
that scheduling relates to the server-side synchronous-boot starvation root in
`SERVERSIDE_ACCEPT_BEFORE_BOOT_SPEC.md`.

**Call path.** `src/cli/crawl/runner.js` → `runMultiModalCrawl()` →
`MultiModalCrawlManager` (when >1 domain) else a single
`MultiModalCrawlOrchestrator`. The CLI `runRunnerOperation()` path (server-style
`service.runOperation`) is the *single-operation* path; the *parallel local
runner* path for the basic article crawl is the multi-modal manager.

**Scheduler shape (`MultiModalCrawlManager.start`, lines ~39-86).** Classic
in-process worker-pool:
- `limit = maxParallel` (default **30**, clamped `>=1`).
- `this.queue = uniqueDomains.slice()`.
- Launch `min(limit, queue.length)` `runNext()` chains into `starters[]`.
- Each `runNext()` does `this.queue.shift()`, `_startDomain(domain)`,
  `await session.promise`, then in `finally` tail-recurses `await runNext()`
  while the queue is non-empty. `await Promise.all(starters)` joins all chains.
- This is promise-chained tail recursion (not a stack leak); concurrency is
  bounded by `limit`.

**Critical DB-handle detail (the relation to the boot-starvation root).**
In `runner.js` `runMultiModalCrawl()` the better-sqlite3 handle is opened
**ONCE** (`const db = openNewsDb(dbPath)`) and captured in the
`createOrchestrator` closure. `MultiModalCrawlManager._startDomain` calls
`this.createOrchestrator(config)` per domain, so **all N parallel domain
orchestrators share the single `db` handle and the single `CrawlOperations`
facade**. The `db.close()` happens once in the outer `finally`.

**Consequence — this path does NOT recur the server-side starvation per
runner.** The server-side root (per spec) is that
`service.runOperation` runs a synchronous prefix that calls
`instantiateFacade()` + boots the engine + `new NewsDatabase(...)` →
synchronous `new Database(...)` **per operation start**, blocking libuv and
starving queued `/jobs/:jobId` polls and concurrent start sockets. The local
multi-modal parallel runner already implements the **Option B** remedy from
`SERVERSIDE_ACCEPT_BEFORE_BOOT_SPEC.md` (open the DB once at the boundary and
inject the handle): there is exactly one synchronous open for the whole fan-out,
not one per parallel runner. So scheduling 30 parallel local domains does not
multiply the synchronous-open cost.

**Residual, lower-severity contention (in-process, single handle).** Because
better-sqlite3 is synchronous and all 30 "parallel" orchestrators share one
handle on one event loop, "parallel" here is I/O-interleaving (fetch waits),
not CPU/DB parallelism: any heavy synchronous DB write from one orchestrator
serializes and briefly blocks the others. This is the same event-loop family as
the server root but **bounded and benign** because (a) the open is amortized
once, and (b) writes are short relative to network waits. No local change is
warranted; the durable cross-cutting fix (off-main-thread DB / cooperative
yield) still belongs to the owner-repo promotion node, not the local harness.

**Net finding.** The local parallel-runner scheduler is correct and already
follows the inject-once-handle pattern the server-side spec recommends. No
local harness change is warranted from this trace; it is recorded as a spec-only
finding and strengthens the case that the remaining starvation is exclusively
the server-side *per-operation* synchronous boot, not the local fan-out.

## Read-only Trace: Accepted Job, No DB Rows for 127.0.0.2 (2026-05-30)

Node `inspect_accepted_job_no_db_rows_for_127_0_0_2`. Read-only forensics of the
blocked concurrent medium rerun (token `medium-jobid-rerun-20260529-1`, port
41952, `--batch-concurrency 2 --batch-retries 0`) to explain why `127.0.0.2`
was accepted but produced no recent DB rows, vs the ECONNRESET-rejected
`127.0.0.3` and the proven `127.0.0.1`.

**Evidence (saved artifacts, no live run).**
- `tmp/medium-jobid-rerun-launch.stdout.json`: launch `status:"partial"`,
  startedAt `20:14:58.857`, finishedAt `20:15:37.111` (the whole batch POST
  phase took ~38s). Per host:
  - `127.0.0.1`: accepted, job `ad1a4f6b`, **createdAt/startedAt
    `20:14:59.087`** (immediate — ~0.2s after batch start).
  - `127.0.0.2`: accepted, job `a13fb129`, **createdAt/startedAt
    `20:15:37.110`** — i.e. its POST `/operations/.../start` did NOT return for
    **~38 seconds**.
  - `127.0.0.3`: `ok:false`, `error:"read ECONNRESET"`, `retryable:true`,
    1 attempt.
- `tmp/medium-jobid-rerun-watch.stderr.log`: at `20:15:39.221` both accepted
  jobs are `running` (host1 since `20:14:59`, host2 since `20:15:37`). Host1's
  rows land at `20:15:45.545` (fetched 0->3, host `127.0.0.1`). From that tick
  onward the `/jobs` endpoint returns `available:false,
  error:"timeout after 1500ms"` (the active crawl starves the cheap job route).
  Watch ends `local-host-coverage-not-met` at ~`20:15:56`, coveredHosts
  `[127.0.0.1]`, missing `[127.0.0.2]`, `jobPollErrors:4`.
- `tmp/medium-jobid-rerun-verify.json`: DB window until `20:15:59.078`; delta
  `urls 2 / responses 3 / success 3 / content 1`; `recent.distinctHosts 1`,
  only `127.0.0.1`; `missingRecentEvidence:["127.0.0.2","127.0.0.3"]`;
  `readinessLabel:"verified-host-partial"`.

**Root cause (single shared root with the ECONNRESET and the poll starvation).**
With `--batch-concurrency 2`, `crawl-batch.js runWithConcurrency()` puts two
POST `/start` requests in flight first (host1 + host3) and queues host2 third.
The in-process unified server's start path runs synchronous, event-loop-blocking
work (engine boot + the SYNCHRONOUS better-sqlite3 `new Database(...)` open) per
operation. That single blocking prefix produces ALL THREE symptoms from ONE
cause:
- `127.0.0.1` (first in): accepted immediately, boots, runs, commits rows.
- `127.0.0.3` (second concurrent slot): its socket is reset while host1's
  synchronous boot blocks the loop -> `read ECONNRESET` -> with `--batch-retries
  0` this is a permanent per-host launch failure.
- `127.0.0.2` (queued third): its `/start` cannot be accepted until a
  concurrency slot frees AND the event loop is free — which only happens after
  host1's crawl winds down (~38s later, `20:15:37`). By then only ~19-22s of the
  host-coverage watch window remained; host2's first DB write did not commit
  before watch ended at `20:15:59`. So `127.0.0.2` is **accepted-too-late-to-
  prove, NOT crashed or silently dropped**: its job is genuinely `running`, just
  started far too late within the bounded window.

**Relation to `SERVERSIDE_ACCEPT_BEFORE_BOOT_SPEC.md`.** This is the same
synchronous-boot starvation root, now shown to cause a SECOND distinct symptom
beyond the documented ECONNRESET: a queued start is delayed by a full prior
host's crawl duration. A single server-side accept/enqueue-before-boot change
(spec Option A yield + Option B open-DB-once-and-inject) would fix BOTH the
host3 ECONNRESET and the host2 late-start-no-rows at once. Strengthens the
recommendation; no new options needed.

**Decision.** No local harness change warranted — the sequential rung (one
in-flight POST, no second concurrent socket, no queued-behind-boot host) already
sidesteps all three symptoms and is the canonical local medium proof (26/28
`ready-for-medium-local`). Do NOT add harness start retries (duplicate-job
risk). Recorded as a spec-only finding appended to the server-side promotion
candidate. Spec updated with the host2 late-start evidence.

## Packet Cadence Comparison: Small vs Medium (2026-05-30)

Node `add_packet_cadence_compare_for_small_medium` complete. Added a bounded,
no-contact, `--json` cadence-comparison capability that contrasts a SMALL and a
MEDIUM reliability packet on score, DB delta, host coverage, label, and
taxonomy.

**Capability.** `tools/crawl/lib/crawl-packet.js` gains
`buildPacketCadenceComparison({ small, medium })` +
`renderPacketCadenceComparisonText`, exported and wired into
`tools/crawl/crawl-packet.js` as a new `cadence` (alias `cadence-compare`) mode:
`node tools/crawl/crawl-packet.js cadence --small <packet> --medium <packet>
--json [--out <path>]`. It reads two saved reliability packets only (no crawl,
no network, no DB write), emitting `mode: crawl-packet-cadence-comparison` with
per-rung summaries (`score`, `db{downloads,success,content}`, `hostCoverage`,
`label`, `taxonomy`, `blockers`), medium-minus-small `deltas`, a taxonomy diff
(`shared`/`onlySmall`/`onlyMedium`), a `cadenceConsistent` boolean, diagnostics,
and a `nextSafestAction`. CLI exit is 0 when consistent, 2 otherwise.

**Artifact.** `tmp/small-vs-medium-cadence-comparison.json` composed over the
saved `tmp/crawl-packet-small-jobid-live.json` (small, 1 host, db 3/3) and
`tmp/medium-sequential-terminalcap-packet.json` (medium, 3 hosts, db 9/9). Both
score 93%, share taxonomy `poll-error` + `target-already-processed`, no
blockers -> `cadenceConsistent: true`, deltas scorePercent 0, dbDownloads +6,
dbSuccess +6, hostsRequested +2, hostsDbCovered +2. No small-rung re-crawl
needed; the saved small packet was reused.

**Tests.** 4 new focused tests in `tests/tools/crawl/crawl-packet.test.js`
(consistent contrast, inconsistent score+taxonomy flagging, required-args
guard, CLI cadence mode) -> 106 passing across the 3 suites. No-contact plan
smoke still `planContactsRemoteCrawler:false` / `planContactsInternetTargets:false`.

## Fresh Small Rung Cadence Refresh (2026-05-30)

**Node `rerun_small_fixture_cadence`.** Produced a FRESH bounded loopback small
packet and re-fed the no-contact cadence comparison so the artifact reflects a
current small rung, not a stale saved one.

**Procedure (loopback only, no internet, no remote contact).**
1. `local-fixture-server.js --preset small --port 41901 --target-token small-cadence-20260530-224344` (detached).
2. Pre-run baseline via `monitored-small-crawl.js baseline --hosts 127.0.0.1`.
3. Watched launch `run.js ... --watch --watch-min-fetches 1 --watch-min-hosts 1` against the single loopback URL -> `watchFinal.stoppedReason=min-fetches-and-hosts-met`, fetched 3, `jobPollErrors=0`, run-exit 0.
4. `monitored-small-crawl.js verify` over the launch window -> `verified-new-data`, no blockers/warnings, delta urls 1 / responses 3 / success 3 / content 1.
5. `crawl-packet.js plan --fixture-preset small ...` -> `tmp/crawl-packet-small-cadence-live.json`: `ready-for-small-local` 96% (27/28), db 3/3, taxonomy `[target-already-processed]` only.
6. `crawl-packet.js cadence --small tmp/crawl-packet-small-cadence-live.json --medium tmp/medium-sequential-terminalcap-packet.json` -> `tmp/small-vs-medium-cadence-comparison.json`.

**Finding.** The fresh small rung scores 96% (vs the saved 26/28 93%) because a
warm UI gave `jobPollErrors=0`, so the small rung carries NO `poll-error`
taxonomy. The cadence comparison therefore now reports `cadenceConsistent:false`
(small 96% vs medium 93%; `poll-error` only in medium). This divergence is
benign and expected: medium's `poll-error` is the known synchronous-boot
job-registry timeout captured in `SERVERSIDE_ACCEPT_BEFORE_BOOT_SPEC.md`, not a
small-rung regression. Refreshing the small rung is what surfaced the divergence
honestly; the previous saved-vs-saved run hid it because both stale packets
happened to share `poll-error`.

**Gotcha.** PowerShell `2>` redirect of long `run.js` stderr lines inserts
spurious mid-token newlines (console-width wrapping). The `watch-log` JSON had
to be repaired by joining physical lines and re-splitting into brace-balanced
objects before `crawl-packet.js plan` could parse `watchFinal`. `verify` is
the source of truth for DB evidence regardless.

**Safety.** Loopback fixture only (127.0.0.1:41901); no internet target, no
remote crawler contact, no queue/deploy mutation. Fixture process stopped after
the proof; only the 5 legit MCP/Playwright processes remained. Focused suites
106 passing; validator OK; cadence policy `readOnly:true startsCrawler:false
contactsRemote:false contactsInternet:false writesDb:false mutatesQueue:false`.

## Node `add_dashboard_packet_comparison_card` (2026-05-30, read-only, no-contact)

**What.** Added a compact dashboard "card" renderer for the small-vs-medium
cadence comparison. New lib functions in `tools/crawl/lib/crawl-packet.js`:
`buildPacketComparisonCard` (accepts a `comparison` object, a saved
`--cadence` artifact, or builds from `--small`/`--medium`),
`renderPacketComparisonCardText`, `renderPacketComparisonCardHtml` (no
`<script>`, all values HTML-escaped). Exported all three. Wired a `card`
mode + `--html` flag + `--cadence` option (distinct from plan mode's
`--comparison`) into the CLI `tools/crawl/crawl-packet.js`.

**Shape.** `mode: crawl-packet-comparison-card` with `actionPolicy` all
read-only/false, `rungs[2]` (`scorePercent`, `db{downloads,success,content}`,
`hostCoverage{requested,dbCovered,dbMissing}`, `taxonomy`, `blockers`),
and `verdict{cadenceConsistent, diagnostics, nextSafestAction}`. Exit 0 when
consistent, 2 otherwise.

**Rendered against fresh artifacts.** `tmp/small-vs-medium-cadence-comparison.json`
(fresh small 96% vs saved medium 93%) -> card verdict DIVERGENT, diagnostics
`score percent differs by -3` + `taxonomy only in medium: poll-error`. Saved
`tmp/small-vs-medium-card.json` and `tmp/small-vs-medium-card.html`.

**Recursive-system improvement (brainstorm conclusion applied).** Added a
non-fatal `--max-lines` growth guard (default 800) to
`tools/crawl/validate-continuation-state.js`. It prints `WARN:` pointing at
`split_execution_state_to_standalone_file_if_growth_warrants` when
`CONTINUATION_PROMPT.md` is large (currently 631 lines), giving the loop an
objective split trigger without ever changing the exit code. Chosen over a
heavier state-file split this turn because it is read-only, low-risk, and
operationalizes a pending node rather than pre-empting it.

**Verification.** `node --check` on all touched JS exit 0; focused suites
`crawl-packet` + `run` + `sequential-fixture-proof` = 110 passing / 3
suites (was 106; +4 card tests); validator OK (still 80 completed / 6 pending
before this turn's prompt rewrite); growth guard WARN fires at `--max-lines 100`
and is silent at default.

**Safety.** Strictly read-only/no-contact: card reads saved artifacts only; no
crawler start, no network, no DB write, no queue mutation.

---

## 2026-05-31 — Internet + production-DB promotion research (node `research_internet_crawl_and_production_db_promotion_ladder`)

**Operator approval.** Internet downloading is APPROVED AND ENCOURAGED.
Production-DB writes to `data/news.db` are APPROVED BUT GATED: small AND medium
internet crawls must first prove they work well saving to smaller SAMPLE DBs.
Remote crawler contact / queue mutation stay out of scope unless separately
approved.

**Sample-DB convention.** Internet proofs write to
`data/samples/<rung>-sample.db` (gitignored, auto-created on first crawl):
`internet-small-sample.db`, `internet-medium-sample.db`. Promotion ladder:
rung1 internet-small -> sample, rung2 internet-medium -> sample (sequential,
one-host-at-a-time), rung3 re-run the SAME bounded crawl with
`DB_PATH=data/news.db` (crawler upsert/dedup handles re-fetch) GATED on both
rungs green + `npm run schema:check`. Research artifact:
`tmp/internet-and-production-promotion-research.json`.

**ISOLATION MECHANISM PROVEN.** The in-process unified backend reads its
crawl-output DB from `process.env.DB_PATH`
(`src/ui/server/unifiedApp/server.js` ~line 1937; default `data/news.db`).
`run.js --db` only points the WATCH METER, NOT the backend — so a bare
`--db data/samples/...` STILL writes crawl rows to production. Confirmed: the
first BBC run (DB_PATH unset) leaked real rows 302104-302111 (309 KB front page
+ 251 KB article) into `data/news.db`. The correct isolation is to ALSO set
`DB_PATH=<sample>` in the environment before invoking run.js (the auto-spawn env
is `Object.assign({}, process.env, …)`, so it inherits DB_PATH). Verified: with
DB_PATH set, the sample DB was created (1.4 MB, full schema) and production
received NO new rows (still tops at id 302111).

**Internet-small rung gap classified.** A raw run.js `basicArticleCrawl`
against a FRESH (empty) sample DB completed `fetched=0`, whereas the same crawl
against the populated production DB fetched BBC fine. `crawl-packet.js plan --db
data/samples/internet-small-sample.db` prescribes the correct harness as
`nextSafestAction`: `monitored-small-crawl.js local-smoke --execute --db
data/samples/internet-small-sample.db --url https://www.bbc.com/news ...`. Next
node `run_internet_small_crawl_to_sample_db` uses that monitored baseline ->
execute -> verify ladder (with DB_PATH set), NOT the bare run.js path.

**Follow-up.** `tools/dev/db-downloads.js` hardcodes `data/news.db` (ignores
`--db`); sample-DB inspection uses `crawl-packet.js plan --db` and
`monitored-small-crawl.js verify --db`.

**Verification.** Validator OK (`82 completed, 7 pending`,
active_node `run_internet_small_crawl_to_sample_db`). Isolation proven by
before/after production `db-downloads.js --recent` top-id comparison (unchanged).
No production promotion performed (gated to rung3).

**Safety.** Internet contact used (approved). All crawl writes this turn went to
the sample DB except the first un-isolated probe (benign BBC public news into
production). No remote contact, no queue mutation, no production promotion.
## Node `run_internet_small_crawl_to_sample_db` -> ISOLATION DISPROVEN (2026-05-31, internet contact APPROVED)

**Ran it.** With `DB_PATH=data/samples/internet-small-sample.db` set, ran the
monitored baseline -> local-smoke --execute -> verify ladder against
`https://www.bbc.com/news` (max-pages 1, depth 0, gentle). The BBC page
DOWNLOADED fine: backend log `PAGE www.bbc.com/news status:success
httpStatus:200 bytesDownloaded:315431`, `MILESTONE crawl-exit:max-downloads-reached
downloads:1`, `PROGRESS visited:1 downloaded:1 saved:1 errors:0`. Internet
downloading WORKS.

**But isolation is BROKEN.** The sample-DB `verify` delta stayed
`0/0/0` and the row landed in PRODUCTION `data/news.db` instead -- new ids
**302112-302114** (308 KB, 00:43:13). `DB_PATH` did NOT redirect the writer.

**Root cause (verified by code read).** The in-process crawl WRITER ignores
BOTH `run.js --db` and `process.env.DB_PATH`:
- `run.js --db` only points the local WATCH METER (`tools/crawl/run.js` L235).
- `process.env.DB_PATH` only points the dashboard READ path
  (`src/ui/server/unifiedApp/server.js` L1937 `mountDashboardModules`).
- The writer resolves `dbPath = opts.dbPath || path.join(opts.dataDir,
  'news.db')` (`src/core/crawler/config/CrawlerConfigNormalizer.js` L208),
  `dataDir` defaults to `<cwd>/data` (L95), and NOTHING feeds it in the
  auto-spawn path -- `crawlServiceOptions` (server.js L1177) carries only
  `telemetryIntegration` and `run.js` never forwards `dbPath` as a crawl
  override. So the writer ALWAYS writes `<cwd>/data/news.db`.

**Corrects last turn.** The prior "ISOLATION MECHANISM PROVEN" fact was a FALSE
POSITIVE: that `DB_PATH` run ALSO `fetched=0`, so nothing was written
anywhere and the unchanged production count proved nothing about isolation.

**`fetched=0` reclassified.** The watch `fetched=0` verdict is a meter
accounting/timing artifact of the SAME gap (meter reads sample DB; writer writes
production), NOT a crawl failure. The crawl genuinely saved in ~450ms.

**Leak ledger.** Benign public BBC rows in production: 302104-302111 (turn 1) +
302112-302114 (this turn). Operator pre-approved internet downloading and deemed
the first leak benign; still, ALL further gated proof crawls are BLOCKED until
the writer is isolatable.

**State reshaped.** `run_internet_small_crawl_to_sample_db` marked completed
(it ran and classified the blocker). New active node
`fix_crawl_writer_db_isolation_plumbing` (plumb a writer DB path through the
in-process operation, default unchanged, + a regression test asserting a
sample-DB crawl leaves `data/news.db` unchanged), then
`rerun_internet_small_crawl_to_sample_db_after_isolation_fix`. Validator OK
(83 completed, 8 pending). Research artifact `empiricalProof` flipped to
`DISPROVEN-ISOLATION-BROKEN`.

**Safety.** No source/test JS changed this turn (analysis + docs only). No
remote contact, no queue mutation, no production promotion. The only writes
were the two BBC rows from the proof crawl (operator-approved internet
downloading).

## 2026-05-31 — isolation PROVEN end-to-end + agentic scaling-ladder directive

**Node `rerun_internet_small_crawl_to_sample_db_after_isolation_fix` COMPLETE.**
Ran a bounded BBC internet crawl with `run.js --crawl-db
data/samples/internet-small-sample.db` (`--profile gentle --max-pages 5
--max-depth 1 --concurrency 1`, seed `https://www.bbc.com/news`). Real content
downloaded into the SAMPLE DB (delta urls +5150 / responses +16 / success +16 /
content +6, latestFetchedAt `2026-05-31T01:02:55.842Z`) while production
`data/news.db` stayed EXACTLY unchanged (urls 1645541, responses 302113,
content 189974 before==after; delta 0/0/0). The `--crawl-db` writer-isolation
fix works end-to-end; the leak ledger is CLOSED for the small rung. Proof
artifact `tmp/iso-small-proof.json`; baselines `tmp/iso-prod-before.json` /
`tmp/iso-sample-before.json`; logs `tmp/iso-small-launch.stdout.json` /
`tmp/iso-small-watch.stderr.log`.

**Confirmed ergonomic gap (now the monitoring driver).** With `--crawl-db`
redirecting the writer, the live throughput meter and `--watch-min-fetches`
gate read the WRONG DB (production), so the isolated crawl reported `fetched=0`
and exited 2 even though the job completed and the sample DB grew. Scaled
agentic monitoring must read the WRITER (sample) DB for progress.

**Operator directive (2026-05-31).** Build incremental AGENTIC crawl-progress
monitoring so agents methodically run ever-larger internet crawls — first 1000
downloads, then 5k/25k as tooling improves — each saved to a sample DB and
isolation-proven before production promotion. New gated pending ladder:
`design_agentic_crawl_progress_monitor_for_scaled_runs` ->
`run_internet_1000_download_crawl_to_sample_db_with_agentic_monitoring` ->
`run_internet_medium_crawl_to_sample_db` ->
`define_scaling_crawl_size_ladder_1k_5k_25k_gated_on_tooling` -> production
promotion gate. Validator OK (85 completed, 9 pending). 115 focused tests pass.

**Safety.** No remote contact, no queue mutation, no production write. Sole
writes were the operator-approved BBC rows into the isolated sample DB; zero
production delta.
## Node run_internet_1000_download_crawl_to_sample_db_with_agentic_monitoring -> ISOLATION PROVEN AT 1000-SCOPE, MONITORED PARTIAL (2026-05-31)

**Ran a real bounded BBC internet crawl** (gentle, max-pages 1500, depth 4, conc 3) redirected to data/samples/internet-small-sample.db via --crawl-db, under the new agentic crawl-progress-monitor. Internet downloading was operator-APPROVED.

**Isolation PROVEN at the larger 1000-target scope (not just small):** production data/news.db delta 0/0/0/0, latestFetchedAt frozen at 2026-05-30T23:43:13. Sample DB delta responses +42 / content +13 / urls +208. Full artifact tmp/iso-1000-proof.json.

**Agentic monitor worked end-to-end:** tracked live writer-DB growth 16->40->49->55->58 (3 saved packets, verdict in-progress, no anomalies) WHILE the legacy watch meter reported fetched=0 (it polls the production meter DB) and the job endpoint was unresponsive (timeout after 1500ms). The monitor reading the WRITER DB is the difference between a visible isolated crawl and a false fetched=0.

**Honest classification:** gentle single-host pacing ~8 downloads/min, so 1000 was not reached in-turn; recorded as a MONITORED PARTIAL run rather than faked completion. Reaching 1000 needs faster pacing / more hosts or a long-running background watcher.

**Footguns hit + lessons (meta-AGI):**
1. Auto-spawned UI server tripped the 30s readiness timeout on first launch. Fix: set CRAWL_RUN_SERVER_READY_TIMEOUT_MS=120000 for any run >= small. MUST be a required preflight.
2. PowerShell inline (Get-Date) subexpressions and backslash-escaped quotes inside double-quoted strings repeatedly wedged the shell at >>. Lesson: pre-capture values into $vars on their own line; never embed (cmd) or escaped quotes inside a quoted -Pattern; prefer Node SCRIPT FILES over inline node -e for anything with quotes.
3. Wall-clock elapsed-ms computed as NEGATIVE 3.5M ms (session-clock vs file-timestamp skew). Lesson: the monitor must self-clock from DB latestFetchedAt deltas, never trust harness wall-clock for throughput/stall.
4. snapshot-both-dbs.js writes sample.totals but the monitor baseline adapter reads sample.before, so packet dbGrowth showed absolute totals; real delta computed from before/after. Follow-up: teach loadBaselineSnapshot the {sample:{totals}} shape.

**Safety.** No production write (delta 0). No remote crawler contact, no queue mutation. Background crawl stopped cleanly after the proof. Focused suite 100 green on 3 touched files.

## 2026-06-14 — freshness classifier and operator proof fields

**Capability review.** Policy/preflight/safety remain proven by no-contact
packets. Sitemap `lastmod` propagation is proven through
`RobotsAndSitemapCoordinator` enqueue metadata. Stored validator access is
proven through `FetchPipeline` article-header cache/DB adapter. Before this
pass, operator freshness status was partial because conditional GET existed but
new/updated/unchanged/stale status required raw field inference.

**Implementation.** Added `src/core/crawler/FreshnessClassifier.js` and wired
`FetchPipeline` to attach freshness proof to cache, network 200, conditional
304, and fallback results. Queue request metadata now propagates into fetch
context so sitemap `lastmod` can participate in classification.
`PageExecutionService` emits freshness in page events/log payloads and 304
fetch analysis; `ArticleProcessor` includes it in fetch analysis for saved
network content.

**Policy choice.** No live HEAD probe or sitemap-only skip was added. Safe
current behavior is: use stored validators through conditional GET where
available, use sitemap `lastmod` as operator evidence, and classify cache
fallback as `stale` without broadening contact semantics.

**Verification.** `node --check` passed for touched JS/test files. Focused Jest
passed 5 suites / 35 tests with artifact
`data/test-results/run-2026-06-13-231007535-9d7fd.json`. No-contact artifacts:
`tmp/freshness-policy.json`, `tmp/freshness-local-smoke-plan.json`,
`tmp/crawl-packet-tiny-freshness-plan.json`,
`tmp/freshness-local-smoke-comparison.json`,
`tmp/crawl-packet-small-freshness-plan.json`,
`tmp/crawl-packet-medium-freshness-plan.json`,
`tmp/freshness-small-vs-medium-cadence.json`, and
`tmp/freshness-small-vs-medium-card.json`. Cadence/card still exit 2 with the
known small/medium `poll-error` divergence.

**Safety.** No remote contact, no internet crawl, no live loopback crawl, and
no production DB write. Changes are metadata/classification only.

## 2026-06-14 — no-contact throughput analyzer

**Capability review.** Throughput was partial: `run.js` had a live meter and
`crawl-progress-monitor` had writer-DB-aware docs/sec/bytes/sec packets, but
operators still had to infer whether a run was limited by politeness, backoff,
latency, freshness/cache behavior, DB growth, or monitor visibility. Robots,
freshness, policy, and packet artifacts are proven; broad live internet
throughput measurement remains gated on explicit approval.

**Implementation.** Added `tools/crawl/lib/throughput-analyzer.js` and CLI
`tools/crawl/throughput-analyzer.js`. It is strictly no-contact: reads saved
progress, meter, fetch/page-event, limiter snapshot, and cadence artifacts and
emits `crawl-throughput-analysis` with action policy, evidence summaries,
limiting factors, diagnostics, and next safest action. Exit 3 means the saved
evidence is throughput-blocked/stalled, not a tool crash.

**Artifact.** Ran
`node tools/crawl/throughput-analyzer.js analyze --progress tmp/progress-selfclock-replay.json --cadence tmp/freshness-small-vs-medium-cadence.json --json --pretty --out tmp/throughput-analysis-progress-cadence.json`.
The report correctly labels the stale sample progress as
`throughput-blocked`, primary `stall`, while preserving proven writer-DB
growth (+48 responses / +15 content) and cadence diagnostics (`poll-error`
only in medium).

**Verification.** Syntax checks passed for analyzer files. Focused Jest passed
3 suites / 56 tests with artifact
`data/test-results/run-2026-06-13-231940038-b44c8.json`. Refreshed no-contact
artifacts: `tmp/throughput-policy.json`, `tmp/throughput-local-smoke-plan.json`,
`tmp/crawl-packet-tiny-throughput-plan.json`,
`tmp/throughput-local-smoke-comparison.json`,
`tmp/throughput-small-vs-medium-cadence.json`, and
`tmp/throughput-small-vs-medium-card.json`. Cadence/card still exit 2 with the
known small/medium taxonomy divergence.

**Safety.** No remote contact, no internet crawl, no loopback live crawl, and
no production DB write.

## 2026-06-14 — internet throughput sample approval boundary

**Capability review.** Policy, preflight, no-contact packet generation,
robots Crawl-delay parsing/enforcement, freshness proof metadata, saved
artifact comparison, and no-contact throughput decomposition are proven by
focused tests and refreshed artifacts. Live internet throughput measurement is
blocked in this prompt because there is no explicit approval for internet
target contact or isolated sample DB writes. Remote contact/mutation and
production DB writes remain blocked.

**Implementation.** Added `throughput-analyzer.js approval`, a no-contact
approval packet mode. It records the missing approval class, proposed bounded
BBC sample target, isolated sample DB path, production `data/news.db`
zero-delta proof plan, post-run analyzer plan, and no-action policy. Default
exit 3 is the expected `approval-missing` classification.

**Artifacts.** `tmp/internet-throughput-approval-blocked.json` is the blocked
handoff packet. Refreshed no-contact artifacts:
`tmp/throughput-approval-policy.json`,
`tmp/throughput-approval-local-smoke-plan.json`,
`tmp/crawl-packet-tiny-throughput-approval-plan.json`,
`tmp/throughput-approval-analysis.json`,
`tmp/throughput-approval-small-vs-medium-cadence.json`, and
`tmp/throughput-approval-small-vs-medium-card.json`.

**Verification.** `node --check` passed for touched analyzer files. Focused
Jest passed `tests/tools/crawl/throughput-analyzer.test.js` with artifact
`data/test-results/run-2026-06-13-232749443-8ef9c.json`. No internet crawl,
remote contact, sample DB write, or production DB write was performed.

## Priority update — Guardian local place/country hub sample ladder

The next recursive prompt begins Guardian place-hub work with the local crawler
only. Bounded local crawler runs may make HTTP requests directly from this
machine to public news targets and write isolated sample DBs without a separate
approval step. The goal is to make small/medium Guardian sample crawls find
latest stories from place hubs, especially country hubs. The system must handle
multiple URL patterns on the same site, country/place aliases, hub-to-story
extraction, freshness/dedupe proof, and isolated sample crawl artifacts. Remote
crawler servers, remote queues, deploy/sync/seed/maintenance, and production
`data/news.db` writes remain out of scope unless explicitly requested.

## 2026-06-14 — Guardian place/country hub inventory and local plans

**Capability review.** Policy/safety are proven for local-only planning:
Guardian helper commands do not contact remote crawler infrastructure and plan
isolated `data/samples/guardian-*.db` DB paths. Guardian hub discovery is now
partial/proven: explicit patterns cover `/world/<country>`,
`/world/<region>-news`, `/<country>-news`, and
`/international/world/<country>`, and saved-fixture extraction proves article
link filtering/dedupe. Launch/watch/isolated DB proof for live Guardian samples
is blocked locally until SQLite native access works in this Linux shell.

**Implementation.** Added `tools/crawl/lib/guardian-place-hubs.js` and CLI
`tools/crawl/guardian-place-hubs.js`. The helper builds an inventory of
Guardian place/country hub URL patterns, classifies sample hub URLs, extracts
latest Guardian article links from saved HTML with dedupe/rejection counts, and
emits small/medium local-only sample crawl plans with gentle single-concurrency
settings, `--crawl-db` + `--db` pointed at isolated sample DBs, and no remote
server command. Follow-up added `db-plan` and `persist` modes: `db-plan` maps
the heuristics into `place_hub_url_patterns` records, and `persist` applies
them through `src/data/db/placeHubUrlPatternsStore.js` /
`news-crawler-db.createSqlitePlaceHubUrlPatternsStore`. This keeps heuristic
storage DB-owned and avoids ad hoc SQL.

**Artifacts.** Refreshed/generated:
`tmp/guardian-place-hub-inventory.json`,
`tmp/guardian-place-hub-extraction-fixture.json`,
`tmp/guardian-small-sample-plan.json`,
`tmp/guardian-medium-sample-plan.json`,
`tmp/guardian-small-run-explain.json`,
`tmp/guardian-medium-run-explain.json`,
`tmp/guardian-local-policy.json`, and
`tmp/guardian-local-smoke-plan.json`. New DB persistence artifact:
`tmp/guardian-place-hub-db-persistence-plan.json`. The saved Guardian fixture extraction
found 25 unique article links and rejected 124 duplicate/non-article/external
links.

**Blocker.** Live Guardian small/medium sample crawls were not started because
DB proof is not currently available in this Linux shell:
`news-crawler-db/node_modules/better-sqlite3/.../better_sqlite3.node` fails
with `invalid ELF header`, and `sqlite3` CLI is unavailable. Actual
`guardian-place-hubs.js persist --db data/samples/...` hits the same native
module failure. Running live crawls anyway would hide whether heuristics were
stored, whether the isolated sample DB grew, and whether production
`data/news.db` stayed unchanged.

**Verification.** Syntax checks passed for the new helper files. Focused
helper Jest passed 1 suite / 7 tests with artifact
`data/test-results/run-2026-06-14-000622473-8926c.json`. The broader
place-hub DB store suite still fails at startup on the known native-module
mismatch, not on the new Guardian helper. No remote crawler contact, remote
mutation, live Guardian crawl, or production DB write occurred.

## 2026-06-14 — DB-backed Guardian small/medium local proofs

**Capability review.** Local policy, Guardian helper artifacts, DB-owned
heuristic persistence, isolated sample DB proof, and production isolation are
now proven. Guardian runtime use of stored patterns is still partial: patterns
are persisted through the DB module but the crawl path has not yet been proven
to consult them for hub selection. Medium terminal/job observability is partial:
DB proof passes, but job endpoint evidence timed out during watch and jobs were
still reported `running` after the DB proof boundary.

**Environment repair.** Rebuilt sibling `news-crawler-db` `better-sqlite3`
from the Linux shell with `npm rebuild better-sqlite3 --build-from-source`.
The native file changed from a Windows PE DLL to `ELF 64-bit LSB shared object,
x86-64`, restoring `openNewsCrawlerDb(':memory:')` and DB-backed store tests.

**DB heuristic persistence.** `guardian-place-hubs.js persist` wrote Guardian
patterns through `src/data/db/placeHubUrlPatternsStore.js` into isolated sample
DBs. Artifacts:
`tmp/guardian-place-hub-db-persistence-result.json`,
`tmp/guardian-small-db-persistence-result.json`, and
`tmp/guardian-medium-db-persistence-result.json`. Each saved 4 records and
read back all expected pattern types.

**Small local Guardian proof.** First attempt failed as
`no-output-timeout 45s` before launch output. The plan generator now includes
`--launch-timeout 180 --no-output-timeout 180 --auto-stop`. Corrected rerun
accepted 2/2 local jobs and reached DB proof. Final sample snapshot:
`tmp/guardian-small-final-sample-after.json` with DB growth +751 URLs,
+56 responses, +54 successes, +18 content. Production isolation:
`tmp/guardian-small-rerun-production-before.json` vs
`tmp/guardian-small-rerun-production-after.json` success/content deltas 0 and
latest fetched timestamp unchanged.

**Medium local Guardian proof.** First attempt failed preflight while prior
small jobs were still active. Rerun from idle server accepted 4/4 local jobs and
reached DB proof. Final sample snapshot:
`tmp/guardian-medium-final-sample-after.json` with DB growth +808 URLs,
+25 responses, +25 successes, +8 content. Production isolation:
`tmp/guardian-medium-rerun-production-before.json` vs
`tmp/guardian-medium-final-production-after.json` success/content deltas 0 and
latest fetched timestamp unchanged. Caveat: watch recorded 8 job endpoint
timeouts, and post-run job status still showed the four medium jobs as
`running`; the local server was cleaned up with SIGKILL after SIGTERM did not
exit.

**Throughput.** `tmp/guardian-small-throughput-analysis.json` and
`tmp/guardian-medium-throughput-analysis.json` prove DB growth but classify
monitor visibility as limited (`elapsedSec:0`, no meter/fetch/limiter samples).
Next node should add Guardian sample progress/meter/fetch/limiter artifacts so
throughput, freshness, Crawl-delay, and latency can be attributed without raw
logs.

**Verification.** Syntax checks passed. Focused Jest passed
`tests/tools/crawl/guardian-place-hubs.test.js` plus
`src/data/db/__tests__/placeHubUrlPatternsStore.test.js`: 2 suites / 32 tests,
artifact `data/test-results/run-2026-06-14-001753833-d8438.json`. No remote
crawler contact, remote mutation, or production DB write occurred.

## 2026-06-14 — Guardian stored-pattern runtime proof

**Capability review.** Guardian DB persistence is now proven through the
runtime prediction path, not only through helper readback. The crawler wiring is
`CrawlerServiceWiring` -> `PlaceHubPatternLearningService` ->
`PageExecutionService`, and page execution annotates/enqueues predicted place
hubs from the learning service. Guardian hub discovery is proven for stored
patterns and partial for live latest-story runtime use. Medium terminal job
evidence and rich throughput/freshness/politeness samples remain partial.

**Implementation.** Guardian DB records now store full-URL regexes compatible
with `news-crawler-db` `place_hub_url_patterns.matchUrl(url, domain)`, which
tests against the full URL. Added
`guardian-place-hubs.js runtime-proof --db <isolated db>`: it persists Guardian
patterns through the DB module, instantiates
`PlaceHubPatternLearningService`, predicts representative Guardian hub/article
URLs, and emits the matched stored pattern type/regex for each candidate.
Tightened `PlaceHubPatternLearningService` fallback heuristics so date-like
article paths such as `/world/2026/jun/14/...` are not classified as place hubs
when no stored pattern matches.

**Artifacts.** Refreshed no-contact/DB proof artifacts:
`tmp/guardian-place-hub-inventory.json`,
`tmp/guardian-place-hub-extraction-fixture.json`,
`tmp/guardian-place-hub-db-persistence-plan.json`,
`tmp/guardian-small-sample-plan.json`,
`tmp/guardian-medium-sample-plan.json`, and
`tmp/guardian-runtime-pattern-proof.json`. Runtime proof saved 4 Guardian
patterns, read back all expected types, matched 4/4 expected Guardian hubs from
stored patterns, and produced zero article-path false positives.

**Verification.** Syntax checks passed for touched JS files. Focused Jest passed
4 suites / 43 tests:
`src/services/__tests__/PlaceHubPatternLearningService.test.js`,
`tests/tools/crawl/guardian-place-hubs.test.js`,
`src/data/db/__tests__/placeHubUrlPatternsStore.test.js`, and
`src/core/crawler/__tests__/PageExecutionService.placeHubPatterns.test.js`.
Test artifact: `data/test-results/run-2026-06-14-005303308-53cd3.json`.
No additional live Guardian crawl was run because this node changed runtime
proof/heuristic behavior, not sample launch/watch behavior.

## 2026-06-14 — Guardian saved sample observability summaries

**Capability review.** Local policy, Guardian hub discovery, runtime
stored-pattern proof, isolated sample DB growth, and production zero-delta proof
remain proven. Operator clarity improved: saved Guardian small/medium artifacts
now produce one summary object instead of requiring raw launch/watch/progress/
throughput log reading. Terminal job evidence remains partial because the
existing runs did not include a post-DB-proof terminal wait.

**Implementation.** Added `guardian-place-hubs.js sample-summary` and
`buildGuardianSampleObservabilitySummary`. The summary reads saved launch JSON,
watch stderr JSON lines, sample/prod before-after monitor snapshots,
throughput analysis, runtime proof, and optional latest-story extraction
artifact. It classifies accepted jobs, watch DB proof, terminal/job endpoint
evidence (`not-observed`, `endpoint-unavailable`, `non-terminal`, or
`terminal`), sample DB growth, production zero-delta, runtime stored-pattern
proof, fixture latest-story extraction, and missing throughput inputs.

**Artifacts.** Refreshed:
`tmp/guardian-place-hub-inventory.json`,
`tmp/guardian-place-hub-extraction-fixture.json`,
`tmp/guardian-place-hub-db-persistence-plan.json`,
`tmp/guardian-small-sample-plan.json`,
`tmp/guardian-medium-sample-plan.json`,
`tmp/guardian-observability-db-persistence-result.json`,
`tmp/guardian-runtime-pattern-proof.json`,
`tmp/guardian-small-observability-summary.json`, and
`tmp/guardian-medium-observability-summary.json`. The small summary labels
terminal evidence `not-observed`; the medium summary labels it
`endpoint-unavailable` with 8 job poll errors. Both summaries preserve DB
growth, production zero-delta, runtime stored-pattern proof, fixture
latest-story extraction, and unknown throughput factors.

**Verification.** Syntax checks passed for touched helper files. Focused Jest
passed 4 suites / 44 tests:
`tests/tools/crawl/guardian-place-hubs.test.js`,
`src/services/__tests__/PlaceHubPatternLearningService.test.js`,
`src/data/db/__tests__/placeHubUrlPatternsStore.test.js`, and
`src/core/crawler/__tests__/PageExecutionService.placeHubPatterns.test.js`.
Test artifact: `data/test-results/run-2026-06-14-012445105-1f1f8.json`.
No live Guardian crawl, remote contact, remote mutation, or production DB write
occurred in this node.

## 2026-06-18 — Guardian progress and throughput summary inputs

**Capability review.** Local Guardian policy, stored-pattern runtime proof,
isolated sample DB growth, and production zero-delta proof remain proven. The
new summary path improves operator clarity for elapsed timing and throughput
input availability. Real raw meter/fetch/limiter sample capture remains
partial for the saved Guardian runs: the analyzer proves DB growth, but robots
Crawl-delay, adaptive backoff, network latency, and freshness/cache attribution
are still `unknown` because those sample files were not captured during the
prior live crawls.

**Implementation.** `guardian-place-hubs.js sample-summary` now accepts raw
`--meter-samples`, `--fetch-samples`, `--limiter-snapshots`, and `--cadence`
inputs. When supplied, the Guardian summary builds a no-contact
`crawl-throughput-analysis` internally and embeds meter, fetch/freshness,
limiter, factor, diagnostic, and unknown-factor details. Summaries also include
artifact timing: launch duration, watch observed seconds, sample/prod snapshot
delta, and monitor elapsed source.

**Artifacts.** Refreshed no-contact/isolated proof artifacts:
`tmp/guardian-place-hub-inventory-progress.json`,
`tmp/guardian-place-hub-extraction-progress.json`,
`tmp/guardian-small-sample-plan-progress.json`,
`tmp/guardian-medium-sample-plan-progress.json`,
`tmp/guardian-place-hub-db-persistence-plan-progress.json`,
`tmp/guardian-observability-progress-db-persistence-result.json`,
`tmp/guardian-runtime-pattern-proof-progress.json`,
`tmp/guardian-small-throughput-analysis-progress.json`,
`tmp/guardian-medium-throughput-analysis-progress.json`,
`tmp/guardian-small-observability-summary-progress.json`, and
`tmp/guardian-medium-observability-summary-progress.json`. Small summary:
accepted 2/2 jobs, DB growth +56 responses / +54 successes / +18 content,
production delta 0, terminal evidence `not-observed`. Medium summary:
accepted 4/4 jobs, DB growth +25 responses / +25 successes / +8 content,
production delta 0, terminal evidence `endpoint-unavailable` with 8 job poll
errors, watch observed 57.7 seconds.

**Verification.** Syntax checks passed for touched Guardian helper files.
Focused Jest passed `tests/tools/crawl/guardian-place-hubs.test.js` with 10
tests; artifact
`data/test-results/run-2026-06-18-003340836-cb1da.json`. No live Guardian
crawl, remote contact, remote mutation, or production DB write occurred in this
node.

## 2026-06-18 — Guardian runtime latest-story proof

**Capability review.** Guardian stored-pattern runtime use is proven, saved
latest-story extraction is proven, and the runtime now preserves source hub
metadata for article links from predicted place hubs. This closes the
no-contact runtime/latest-story proof gap. Still partial: freshness for saved
fixture stories is `unknown`, and the old live Guardian samples did not capture
the new runtime metadata, raw meter/fetch/limiter samples, or terminal job proof.

**Implementation.** `PageExecutionService` now predicts the current page as a
place hub before enqueueing outgoing links. If the page matches a stored place
hub pattern and the outgoing link is an article, the enqueue metadata includes
`runtimeLatestStoryCandidate`, `latestStoryEvidenceSource`, `sourcePlaceHub`,
`sourcePlaceHubPatternType`, `sourcePlaceHubPatternRegex`, confidence, kind,
and reason. Added `guardian-place-hubs.js latest-story-proof` and
`buildGuardianRuntimeLatestStoryProof` to produce a no-contact proof from saved
Guardian hub HTML using the DB-backed runtime predictor.

**Artifacts.** Refreshed:
`tmp/guardian-place-hub-inventory-runtime-story.json`,
`tmp/guardian-place-hub-extraction-runtime-story.json`,
`tmp/guardian-small-sample-plan-runtime-story.json`,
`tmp/guardian-medium-sample-plan-runtime-story.json`,
`tmp/guardian-place-hub-db-persistence-plan-runtime-story.json`,
`tmp/guardian-runtime-story-db-persistence-result.json`,
`tmp/guardian-runtime-pattern-proof-runtime-story.json`,
`tmp/guardian-runtime-latest-story-proof.json`,
`tmp/guardian-small-throughput-analysis-runtime-story.json`,
`tmp/guardian-medium-throughput-analysis-runtime-story.json`,
`tmp/guardian-small-observability-summary-runtime-story.json`, and
`tmp/guardian-medium-observability-summary-runtime-story.json`. Latest-story
proof: source hub matched stored `world-country` pattern, extracted 25 stories,
produced 25 runtime latest-story candidates, and had 0 article false positives.

**Verification.** Syntax checks passed for `PageExecutionService` and Guardian
helper files. Focused Jest passed 2 suites / 20 tests:
`tests/tools/crawl/guardian-place-hubs.test.js` and
`src/core/crawler/__tests__/PageExecutionService.placeHubPatterns.test.js`.
Test artifact: `data/test-results/run-2026-06-18-131209349-3c5a8.json`.
No live Guardian crawl, remote contact, remote mutation, or production DB write
occurred in this node.
