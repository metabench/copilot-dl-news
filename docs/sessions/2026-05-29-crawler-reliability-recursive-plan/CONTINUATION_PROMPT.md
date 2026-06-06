# Recursive Continuation Prompt: News Crawler Reliability

Continue in `c:\Users\james\Documents\repos\copilot-dl-news` (the active
execution environment is Windows + PowerShell; prior WSL runs used
`/mnt/c/Users/james/Documents/repos/copilot-dl-news`).

## Recursive Operating Model

You are one node in a multi-turn recursive crawler reliability loop. This prompt
plus the session files are the authoritative state; the facts and execution-state
block below are current, so act on them directly rather than re-deriving them. If
something here disagrees with the code, trust the code and correct the prompt.

Each turn must:
1. Execute a substantial bounded implementation/validation bundle.
2. Run real local crawls where safe.
3. Preserve evidence in artifacts and docs.
4. Update the recursive session docs.
5. Rewrite the next full recursive continuation prompt into
   `CONTINUATION_PROMPT.md`, then give a concise pointer to that file in the
   assistant's final chat output (do NOT paste the full prompt into chat).

Do not stop at planning if bounded local crawling can be run safely.

## Crawl Quality North Star (Operator Priority 2026-05-31)

This loop's TOP PRIORITY is now CRAWL QUALITY, not just reliability plumbing.
Every node must advance one or more of these, without over-optimizing any single
one at the expense of overall quality:

1. POLITENESS FIRST. Obey `robots.txt` (allow/deny + `Crawl-delay`), keep a
   per-host minimum interval, and back off on 429/403. Politeness is a hard
   floor; throughput gains may never breach it.
2. ROBOTS CACHING + REFERRAL. Fetch `robots.txt` once per host, CACHE it (TTL +
   conditional revalidation), persist the parsed rules / `Crawl-delay` /
   declared sitemaps to the DB, and REFER to that cache on every subsequent URL
   decision instead of re-fetching.
3. FRESHNESS DETECTION. Know whether a document is NEW or UPDATED before paying
   for a full GET — combine sitemap `<lastmod>`, `robots`/sitemap declarations,
   HEAD requests, and conditional GET (`If-Modified-Since` / `ETag` → 304).
   Avoid re-downloading unchanged content; prioritize genuinely new/updated docs.
4. ENCAPSULATION + MODULAR QUALITY. Keep robots, sitemap, freshness,
   politeness, and throughput concerns in small, single-responsibility,
   dependency-injected modules whose boundaries make the code EASIER to
   understand. Refactor toward clarity; do not bolt logic onto unrelated classes.
5. THROUGHPUT ANALYSIS incl. BANDWIDTH + LATENCY. Measure real throughput
   (docs/sec, bytes/sec) AND decompose what limits it: politeness waits,
   network bandwidth, and round-trip latency. Reason explicitly about how the
   crawler SHOULD behave under different bandwidth/latency regimes (e.g. raise
   concurrency when latency-bound and bandwidth is spare; throttle when
   bandwidth-saturated) and surface adaptive-pacing recommendations.

Reuse and extend the EXISTING modules (`src/core/crawler/robots.js`,
`sitemap.js`, `RobotsAndSitemapCoordinator.js`, `RateLimitTracker.js`) and the
existing DB columns (`robotsTxt`, `crawlDelaySeconds`, `sitemapUrls`,
`lastModified`, `getArticleHeaders`) before inventing new ones. Internet
downloading is APPROVED+ENCOURAGED; production `data/news.db` writes stay GATED
on small AND medium sample-DB quality proofs.

## Full Recursive Prompt Contract

All future returned continuation prompts must be fully recursive and
self-contained, and must be written into `CONTINUATION_PROMPT.md`. That file is
the canonical handoff location. The full prompt text MUST NOT be pasted into the
assistant's final chat output, because long prompts render poorly in the chat
UI. Instead, the chat output gives a short, concise pointer to the saved file
(its path) plus a one or two line description of what changed in the state.

The next node reads the prompt by opening `CONTINUATION_PROMPT.md`, not by
copying it from chat. Do not return a delta-only file, "continue from above"
file, summary-only file, or a file that relies on unstated chat memory: the
saved file must always be the whole, self-contained recursive prompt.

Every future continuation prompt written into `CONTINUATION_PROMPT.md` must
include:
- Repository path and recursive operating model.
- Read-first file list.
- Source-of-truth and ownership boundaries.
- Complete execution state JSON with track, phase, active node, completed
  nodes, and pending nodes.
- Current facts drawn from docs, code, artifacts, and recent local
  validation.
- Goal and substantial connected workload of 10-16 items.
- Safety constraints, including local-only default and remote contact/mutation
  approval boundaries.
- Verification ladder, including no-contact checks, bounded local crawls where
  safe, artifact comparison, tests, cleanup, and `git diff --check`.
- Final response requirements, including scorecard, artifacts, a concise
  pointer to the saved next-prompt file, last-state items, backlog, and horizon
  estimate.

If a future turn updates only part of the state, it must still rewrite the whole
recursive prompt into `CONTINUATION_PROMPT.md` with the updated state embedded.
The file itself is the serialized program state for the next node, and the next
node must be able to read the prompt directly by opening that file.

## Read First

- `AGENTS.md`
- `tools/crawl/AGENT.md`
- `docs/cli/crawl.md`
- `docs/RUNBOOK.md`
- `docs/sessions/SESSIONS_HUB.md`
- `docs/sessions/long-term/lt-001-advanced-crawler-ui/PLAN.md`
- `docs/sessions/long-term/lt-001-advanced-crawler-ui/WORKING_NOTES.md`
- `docs/sessions/2026-05-26-crawler-graph-feedback-loop/NEXT_FEW_DAYS_PLAN.md`
- `docs/sessions/2026-05-29-crawler-reliability-recursive-plan/PLAN.md`
- `docs/sessions/2026-05-29-crawler-reliability-recursive-plan/WORKING_NOTES.md`
- `docs/sessions/2026-05-29-crawler-reliability-recursive-plan/CRAWLER_RELIABILITY_RECURSIVE_PLAN.md`
- `docs/sessions/2026-05-29-crawler-reliability-recursive-plan/CONTINUATION_PROMPT.md`

## Source Of Truth

Treat the 2026-05-29 crawler reliability session, LT-001 notes, the
2026-05-26 graph-feedback next-days plan, crawler docs, current code, and saved
local artifacts as source of truth.

Do not move crawler work into `jsgui3-ecosystem`.

Ownership boundaries:
- `copilot-dl-news`: operator workflow, CLI harnesses, local proofs, packet
  scorecards, docs/session state.
- `news-crawler-backend-core`: reusable crawler runtime behavior after proof.
- `news-crawler-db`: schema, persistence, DB-owned evidence APIs.
- `news-db-analysis`: graph and analysis read models.

## Execution State

```json
{
  "track": "news-crawler-reliability",
  "phase": "crawl-quality-politeness-robots-cache-freshness-throughput",
  "active_node": "implement_robots_txt_cache_with_ttl_revalidation_and_db_persistence",
  "blocked_on": null,
  "completed_nodes": [
    "inspect_local_job_registry_and_watch_jobs_null",
    "add_bounded_local_job_poll_evidence",
    "add_target_freshness_preflight",
    "select_fresh_reuters_one_host_small_target",
    "add_launch_jobs_watch_fallback",
    "classify_accepted_job_unobservable",
    "add_loopback_packet_safety_policy",
    "rerun_no_contact_policy_and_packets",
    "rerun_small_local_live_proof_with_fresh_target",
    "classify_reuters_small_timeout_packet",
    "select_deterministic_loopback_small_fixture",
    "run_small_loopback_live_proof",
    "run_medium_loopback_live_proof",
    "create_checked_in_fixture_server_helper",
    "add_fixture_crawl_commands_or_profile",
    "add_fixture_target_token_strategy",
    "tighten_medium_content_quality_scoring",
    "add_host_level_packet_summary",
    "compare_fixture_packets_to_tiny_cadence",
    "rerun_small_fixture_via_helper",
    "rerun_medium_fixture_via_helper",
    "add_local_watch_min_hosts_gate",
    "add_packet_host_coverage_blocker",
    "run_no_contact_host_watch_packets",
    "run_small_host_watch_fixture_proof",
    "run_medium_host_watch_fixture_proof_blocked",
    "inspect_medium_extra_operation_jobs",
    "add_job_snapshot_fast_path_or_status_index",
    "add_non_retrying_fixture_launch_policy",
    "run_no_contact_jobid_packets",
    "run_small_jobid_fixture_proof",
    "run_medium_jobid_fixture_proof_blocked",
    "add_partial_launch_min_host_adjustment",
    "rerun_medium_jobid_after_partial_launch_adjustment",
    "add_sequential_medium_fixture_strategy",
    "add_packet_compare_command",
    "run_sequential_medium_fixture_proof",
    "compare_concurrent_vs_sequential_medium_packets",
    "refresh_no_contact_sequential_ladder",
    "promote_sequential_summary_composer_or_helper",
    "add_sequential_fixture_proof_command",
    "add_sequential_helper_packet_commands",
    "run_sequential_helper_medium_fixture_proof",
    "compare_helper_sequential_against_concurrent",
    "refresh_no_contact_helper_ladder",
    "add_per_target_terminal_assertion",
    "classify_job_still_running_after_db_proof",
    "refresh_no_contact_terminal_ladder",
    "run_terminal_state_sequential_helper_proof",
    "decide_wait_for_terminal_after_db_proof_policy",
    "add_optional_terminal_wait_after_db_proof",
    "fix_terminal_wait_timeout_boundary",
    "run_terminal_wait_no_contact_ladder",
    "run_terminal_wait_sequential_helper_proof",
    "classify_terminal_wait_incomplete_warning",
    "run_checks",
    "update_docs_and_next_prompt",
    "improve_job_endpoint_poll_responsiveness_after_terminal_wait",
    "add_terminal_wait_job_poll_timeout_flag",
    "add_three_state_terminal_wait_classifier",
    "add_terminal_wait_subtaxonomy_packet",
    "run_terminal_wait_responsiveness_focused_tests",
    "update_docs_and_next_prompt_2",
    "remove_reconstruct_state_language_from_continuation_prompt",
    "diagnose_better_sqlite3_elf_vs_win32_root_cause",
    "inspect_concurrent_launch_econnreset_under_batch_concurrency",
    "rebuild_better_sqlite3_for_windows_in_news_crawler_db_on_approval",
    "run_terminal_wait_sequential_medium_proof_after_rebuild",
    "derive_composed_terminal_wait_subtaxonomy_from_counts",
    "cap_terminal_wait_total_poll_time_at_budget",
    "run_terminal_wait_poll_budget_cap_focused_tests",
    "run_terminal_wait_sequential_medium_proof_after_poll_budget_cap",
    "harden_job_endpoint_responsiveness_during_active_crawl",
    "promote_serverside_accept_before_boot_fix_to_owner_repo",
    "add_continuation_state_validator",
    "reconcile_duplicate_continuation_prompt_file",
    "inspect_basic_article_crawl_parallel_local_runner_scheduling",
    "inspect_accepted_job_no_db_rows_for_127_0_0_2",
    "add_packet_cadence_compare_for_small_medium",
    "rerun_small_fixture_cadence",
    "add_dashboard_packet_comparison_card",
    "research_internet_crawl_and_production_db_promotion_ladder",
    "run_internet_small_crawl_to_sample_db",
    "fix_crawl_writer_db_isolation_plumbing",
    "rerun_internet_small_crawl_to_sample_db_after_isolation_fix",
    "design_agentic_crawl_progress_monitor_for_scaled_runs",
    "run_internet_1000_download_crawl_to_sample_db_with_agentic_monitoring",
    "harden_agentic_monitor_self_clocking_and_boot_preflight_for_next_scaled_run",
    "audit_and_encapsulate_politeness_robots_cache_freshness_modules"
  ],
  "pending_nodes": [
    "implement_robots_txt_cache_with_ttl_revalidation_and_db_persistence",
    "honor_robots_crawl_delay_and_adaptive_per_host_politeness",
    "implement_freshness_detection_sitemap_lastmod_head_and_conditional_get",
    "build_throughput_analyzer_with_bandwidth_and_latency_decomposition",
    "run_internet_crawl_to_sample_db_measuring_politeness_and_throughput",
    "define_adaptive_pacing_policy_for_bandwidth_and_latency_regimes",
    "gate_internet_medium_and_production_promotion_on_quality_proofs",
    "promote_proven_runtime_changes_to_owner_repos_if_needed",
    "split_execution_state_to_standalone_file_if_growth_warrants",
    "update_docs_and_next_prompt_5"
  ]
}
```

## Current Facts

- OPERATOR PRIORITY REPIVOT 2026-05-31 (source: operator message): the loop's
  focus shifts from scaled-crawl plumbing to CRAWL QUALITY — politeness,
  `robots.txt` caching+referral, freshness detection (sitemap `<lastmod>` +
  HEAD + conditional GET), strong encapsulation/modular quality, and throughput
  analysis that accounts for bandwidth + latency limits and adapts to them. See
  the `## Crawl Quality North Star` section. The scaled 1000-download run is
  retained but REFRAMED as an instrument for measuring politeness compliance and
  throughput/bandwidth/latency, not as an end in itself.
- EXISTING CRAWL-QUALITY MODULE INVENTORY (verified by code-read 2026-05-31,
  starting point for the audit node — do NOT reinvent these):
  - `src/core/crawler/robots.js`: `loadRobots(baseUrl)` fetches `/robots.txt`
    (15s timeout via `CRAWLER_ROBOTS_FETCH_TIMEOUT_MS`), parses with
    `robots-parser`, extracts declared sitemaps. GAP: no TTL cache, no DB
    persistence, no surfaced `Crawl-delay`, re-fetches per run.
  - `src/core/crawler/sitemap.js`: `loadSitemaps(baseUrl, domain, sitemapUrls,
    opts)` fetches+parses sitemap XML (`fast-xml-parser`, regex fallback),
    caps at `sitemapMaxUrls` (default 5000). GAP: `<lastmod>` not surfaced for
    freshness; no conditional revalidation.
  - `src/core/crawler/RobotsAndSitemapCoordinator.js`: DI coordinator wiring
    robots+sitemap into the crawl; exposes `getRobotsInfo()` / `getSitemapInfo()`.
  - `src/core/crawler/RateLimitTracker.js`: adaptive per-host interval learner
    (429/403 backoff, success-streak recovery, DB persistence; events
    success/rateLimit/failure/intervalAdjusted). GAP: not obviously fed by
    robots `Crawl-delay` as a politeness floor.
  - DB (news-crawler-db) ALREADY has columns to back caching+freshness:
    coverage `robotsTxt`, `crawlDelaySeconds`, `sitemapUrls`, `lastModified`,
    and `getArticleHeaders(url)` returning `{etag, lastModified}` for
    conditional GET. Prefer wiring these over adding schema.
- AUDIT COMPLETE 2026-05-31 (node
  `audit_and_encapsulate_politeness_robots_cache_freshness_modules` COMPLETE,
  READ-ONLY). HEADLINE CORRECTION: robots DB caching, conditional GET, 304
  not-modified skip, and sitemap `<lastmod>` surfacing are ALREADY implemented
  and live-wired — the prior prompt OVERSTATED these gaps. Evidence:
  (1) `RobotsAndSitemapCoordinator.loadRobotsTxt()` (L100-167) DB-caches
  robots.txt with a 24h TTL freshness check (L107-127) and write-back via
  `db.upsertArticle` (L130-160); `isAllowed()` (L89-97) honors allow/deny. This
  coordinator is the LIVE path (`CrawlerServiceWiring.js` L334), NOT bare
  `robots.js loadRobots` (which has no cache). (2) `FetchPipeline`
  `_buildConditionalHeaders()` (L1357) reads `dbAdapter.getArticleHeaders(url)`
  → sets `If-None-Match`/`If-Modified-Since`; the `status===304` path (L915-965)
  returns `source:'not-modified'`, `body:null` (NO re-download), records
  conditional headers. (3) `sitemap.js` (L83-101) surfaces `meta.lastmod`,
  `changefreq`, `news:news` to `opts.push`. (4) `RateLimitTracker`
  `recordRateLimit` (L129-176) honors `Retry-After` + exponential backoff;
  `setInterval` (L249) exists as a floor-injection seam. GENUINE remaining gaps
  (the real downstream work): (a) robots `Crawl-delay` is NEVER parsed,
  persisted, or enforced as a per-host floor (the interval floor is
  `minIntervalMs` 100ms); (b) robots cache is a generic article row with a
  hardcoded 24h TTL and no conditional revalidation, not a typed cache using the
  `crawlDelaySeconds`/`sitemapUrls` columns; (c) sitemap `<lastmod>` rides in
  meta but is NOT used to prioritize new-vs-updated before fetch; (d) per-fetch
  `ttfbMs` (latency) + `transferKbps` (bandwidth) are captured but never
  decomposed into politeness-/bandwidth-/latency-bound regimes for adaptive
  pacing. ENCAPSULATION PLAN (reuse-first): extract `RobotsCache` (typed persist
  + TTL + revalidate + `getCrawlDelay`), add thin `PolitenessGovernor`
  (floor = max(Crawl-delay, configured, learned) via
  `RateLimitTracker.setInterval`), surface `FreshnessProbe` (lastmod + stored
  etag/LM + optional HEAD; enforcement reuses the 304 path), extend
  `ThroughputAnalyzer` (regime classifier + adaptive-pacing rec; read-only).
  INVARIANT: adaptive pacing may only RAISE concurrency or add hosts; it may
  NEVER lower a per-host politeness floor. Artifacts:
  `tmp/crawl-quality-audit.json`, session `crawl-quality-module-boundaries.svg`
  + `.md`. Baseline GREEN: 5 focused crawler suites, 139 tests passed. NO engine
  edits, NO crawl, NO network, NO DB write this node.
- AGENTIC CRAWL-PROGRESS MONITOR BUILT + PROVEN 2026-05-31 (node
  `design_agentic_crawl_progress_monitor_for_scaled_runs`): the writer-DB-aware
  monitor `tools/crawl/crawl-progress-monitor.js` (lib
  `tools/crawl/lib/crawl-progress-monitor.js`) closes the `--crawl-db`
  `fetched=0` false-negative leak by reading the WRITER (sample) DB directly
  instead of the default production meter DB. READ-ONLY: opens the writer DB
  readonly, emits a compact progress packet, and NEVER starts a crawler,
  contacts a remote host, writes DB rows, or mutates a queue. Packet
  (`mode: crawl-progress-monitor`, `schemaVersion: 1`):
  `actionPolicy`, `writerDb{path,exists}`, `target{downloads}`, `elapsedSec`,
  `downloads`(=successResponses), `contentDownloads`, `successResponses`,
  `failedResponses`, `progress{fraction,percent,remaining,reached}`,
  `dbGrowth{...}|null`, `throughput{docsPerSec,bytesPerSec}`, `latestFetchedAt`,
  `msSinceLastDownload`, `stalled`, `anomalies[]`
  (`db-shrank-vs-baseline`/`no-downloads-yet`/`high-failure-ratio`/`exceeded-target`/`writer-db-missing`),
  `projectedCompletion{etaSec,etaIso,basis}|null`, `verdict`
  (`idle`|`in-progress`|`stalled`|`target-reached`). Exit codes: 0
  normal/in-progress/reached, 3 stalled or writer-DB missing, 2 error/bad args.
  PROVED read-only against the populated `data/samples/internet-small-sample.db`
  (downloads 16, dbGrowth content +6, verdict stalled→exit 3 since crawl ended
  ~13min prior) AND against a missing DB (`writer-db-missing` anomaly, exit 3).
  Unit+CLI tests: `tests/tools/crawl/crawl-progress-monitor.test.js` (16 tests).
  Focused suite now 131 green (was 115). Docs: `tools/crawl/AGENT.md` new
  "Writer-DB Isolation — Proven, and the Closed `fetched=0` Leak" section +
  gated 1k→5k→25k ladder.
- OPERATOR APPROVAL 2026-05-31 (source: operator message): internet downloading
  is APPROVED AND ENCOURAGED. Production-DB writes (`data/news.db`) are APPROVED
  BUT GATED: small AND medium internet crawls must first prove they work well
  saving to smaller SAMPLE DBs before any promotion to production. Remote
  crawler contact and remote queue mutation remain out of scope unless
  separately approved.
- SAMPLE-DB CONVENTION (node `research_internet_crawl_and_production_db_promotion_ladder`):
  internet proofs write to `data/samples/<rung>-sample.db` (gitignored,
  auto-created on first crawl). Rungs: `data/samples/internet-small-sample.db`,
  `data/samples/internet-medium-sample.db`. Promotion ladder: rung1
  internet-small -> sample, rung2 internet-medium -> sample (sequential,
  one-host-at-a-time), rung3 re-run the SAME bounded crawl with
  `DB_PATH=data/news.db` (crawler upsert/dedup handles re-fetch) GATED on both
  rungs green + `npm run schema:check`. Full research artifact:
  `tmp/internet-and-production-promotion-research.json`.
- ISOLATION DISPROVEN — WRITER DB IS NOT REDIRECTABLE 2026-05-31 (CORRECTS the
  prior "ISOLATION MECHANISM PROVEN" fact, which was a FALSE POSITIVE): the
  in-process crawl WRITER ignores BOTH `run.js --db` AND `process.env.DB_PATH`.
  `run.js --db` only points the local WATCH METER (`tools/crawl/run.js` L235).
  `process.env.DB_PATH` only points the dashboard READ path
  (`src/ui/server/unifiedApp/server.js` L1937 `mountDashboardModules`). The
  actual writer resolves `dbPath = opts.dbPath || path.join(opts.dataDir,
  'news.db')` (`src/core/crawler/config/CrawlerConfigNormalizer.js` L208), where
  `dataDir` defaults to `<cwd>/data` (L95) and is fed by NOTHING in the
  auto-spawn path: `crawlServiceOptions` (server.js L1177) carries only
  `telemetryIntegration`, and `run.js` never forwards `dbPath` as a crawl
  override. So the writer ALWAYS writes `<cwd>/data/news.db`. PROOF: the
  monitored harness with `DB_PATH` set downloaded BBC (backend log PAGE
  status:success httpStatus:200 bytesDownloaded:315431, MILESTONE
  crawl-exit:max-downloads-reached, PROGRESS saved:1) but the row landed in
  PRODUCTION (`data/news.db` new ids 302112-302114) while the sample-DB verify
  delta stayed 0/0/0. Last turn's "PROVEN" was an illusion because that
  `DB_PATH` run ALSO `fetched=0`, so nothing was written ANYWHERE and the
  unchanged production count proved nothing.
- INTERNET DOWNLOADING WORKS; `fetched=0` RECLASSIFIED 2026-05-31: BBC is
  reachable and downloads fine from this harness (200, ~315 KB, saved:1, ~450ms).
  The `fetched=0` watch verdict is a meter accounting/timing artifact of the
  SAME isolation gap (the meter reads the sample DB; the writer writes
  production), NOT a crawl failure.
- LEAK LEDGER 2026-05-31: benign public BBC news rows leaked to production
  across probes: 302104-302111 (turn 1) and 302112-302114 (this turn). Operator
  pre-approved internet downloading and deemed the first leak benign. Still, ALL
  further gated internet/local proof crawls are BLOCKED until writer isolation
  is fixed, because every crawl currently pollutes `data/news.db`.
- ISOLATION FIX LANDED 2026-05-31 (node `fix_crawl_writer_db_isolation_plumbing`
  COMPLETE — CORRECTS the prior "WRITER NOT REDIRECTABLE" framing): code-read of
  the override chain proved the WRITER IS ALREADY redirectable via
  `overrides.dbPath` — `CrawlOperation.buildOptions(defaults, overrides)`
  (`src/core/crawler/operations/CrawlOperation.js` L67) merges `overrides.dbPath`
  into crawler options, then `NewsCrawler` L301 honors `opts.dbPath ||
  path.join(dataDir, 'news.db')`. The only missing link was that `run.js` never
  forwarded a writer dbPath into the crawl request body. NO whitelist strips it:
  `crawl-batch.js --override dbPath=<p>` -> POST `{startUrl, overrides}` ->
  `operations.js` `ensurePlainObject(overrides)` ->
  `crawlService.runOperation({overrides})` -> `runner(startUrl, overrides)` ->
  `operation.run({overrides})` -> `buildOptions` -> `NewsCrawler.dbPath`. FIX
  (minimal, no engine edits): added `--crawl-db <path>` to `tools/crawl/run.js`
  (arg parser + `buildPlan` injects `finalOverrides.dbPath`, which flows through
  the existing `--override k=v` loop). Default with no flag is unchanged
  (`<cwd>/data/news.db`); the meter `--db` semantics are untouched. REGRESSION
  GUARDS (all green, 115 focused tests pass): `tests/tools/crawl/run.test.js`
  asserts no `dbPath` override without the flag and `--override dbPath=<abs>`
  with it; `tests/core/crawler/config/writer-db-isolation.test.js` asserts
  `createCrawlerConfig` honors an explicit `dbPath` and defaults to
  `<cwd>/data/news.db` otherwise. The prompt's earlier assumption that
  `CrawlerConfigNormalizer`/`CRAWL_DB_PATH` env needed editing was UNNECESSARY.
  FOLLOW-UP unchanged: `tools/dev/db-downloads.js` hardcodes `data/news.db`
  (ignores `--db`); use `crawl-packet.js plan --db` /
  `monitored-small-crawl.js verify --db` to inspect sample DBs.
- ISOLATION PROVEN END-TO-END 2026-05-31 (node
  `rerun_internet_small_crawl_to_sample_db_after_isolation_fix` COMPLETE): a
  bounded BBC internet crawl (`run.js --local --profile gentle --max-pages 5
  --max-depth 1 --concurrency 1 --crawl-db data/samples/internet-small-sample.db
  ... https://www.bbc.com/news`) downloaded REAL content into the SAMPLE DB
  while production `data/news.db` stayed EXACTLY unchanged. Production
  before==after: urls 1645541, responses 302113, success 286009, content 189974,
  latestFetchedAt `2026-05-30T23:43:13.069Z` (delta 0/0/0/0). Sample DB
  before all-zero -> after urls 5150, responses 16, success 16, content 6,
  latestFetchedAt `2026-05-31T01:02:55.842Z` (delta +5150/+16/+16/+6). The job
  reached terminal `completed`; the watch verdict `fetched=0` / run-exit 2 is a
  CONFIRMED meter artifact (the watch meter polls production `data/news.db`,
  which the writer no longer touches), NOT a crawl failure. NO production leak
  this turn — the leak ledger is now CLOSED for the small rung. Proof artifact:
  `tmp/iso-small-proof.json`; baselines `tmp/iso-prod-before.json`,
  `tmp/iso-sample-before.json`; logs `tmp/iso-small-launch.stdout.json`,
  `tmp/iso-small-watch.stderr.log`. KNOWN ERGONOMIC GAP (now the top monitoring
  driver): when `--crawl-db` redirects the writer, the live throughput meter and
  the `--watch-min-fetches` gate read the WRONG DB, so a successful isolated
  crawl looks like a `fetched=0` failure and exits 2. Scaled agentic monitoring
  must read the WRITER DB (sample) for progress, not the meter default.
- AGENTIC SCALED-CRAWL MONITORING DIRECTIVE 2026-05-31 (operator message): the
  operator wants incremental improvements in AGENTIC monitoring of crawl
  progress so agents (like this one) can methodically run progressively larger
  internet crawls — first 1000 downloads, then ever-increasing sizes as agent
  and tool technology improves — each saved to a SAMPLE DB and isolation-proven
  before any production promotion. Design principle: a machine-readable
  crawl-progress packet an agent can POLL on a cadence (elapsed, downloads so
  far vs target, success/fail split, distinct hosts, DB growth read from the
  WRITER/sample DB, throughput docs/sec + bytes/sec, stall/anomaly flags,
  projected completion), plus bounded checkpoints and a clean terminal verdict.
  Scaling ladder is GATED: rung N (e.g. 1k) must prove well-monitored success to
  a sample DB before rung N+1 (5k, 25k, ...) is attempted, and production writes
  stay GATED on small AND medium sample proofs. Build the monitoring tooling
  FIRST (read-only/bounded), then run the 1000-download rung under it.
- `tools/crawl/crawl-packet.js` has a read-only `cadence` (alias
  `cadence-compare`) mode: `node tools/crawl/crawl-packet.js cadence --small
  <packet> --medium <packet> --json [--out <path>]`. It reads two saved
  reliability packets only (no crawl, no network, no DB write) via
  `buildPacketCadenceComparison` / `renderPacketCadenceComparisonText` in
  `tools/crawl/lib/crawl-packet.js`, emitting
  `mode: crawl-packet-cadence-comparison` with per-rung summaries (`score`,
  `db{downloads,success,content}`, `hostCoverage`, `label`, `taxonomy`,
  `blockers`), medium-minus-small `deltas`, a taxonomy diff
  (`shared`/`onlySmall`/`onlyMedium`), and a `cadenceConsistent` boolean. CLI
  exit is 0 when consistent, 2 otherwise. Latest artifact
  `tmp/small-vs-medium-cadence-comparison.json` now reflects a FRESH small rung
  (fresh small-local 96% / saved medium-local 93%, `poll-error` only in medium,
  deltas db +6/+6, hosts +2, `cadenceConsistent: false` — see fresh-small fact
  below).
- FRESH SMALL RUNG CADENCE REFRESH 2026-05-30 (node `rerun_small_fixture_cadence`,
  loopback only, no internet/remote contact): produced a fresh bounded SMALL
  loopback packet and re-fed the cadence comparison so the artifact reflects a
  current small rung. Procedure: `local-fixture-server.js --preset small --port
  41901 --target-token small-cadence-20260530-224344` (detached) -> pre-run
  `monitored-small-crawl.js baseline` -> watched `run.js ... --watch
  --watch-min-fetches 1 --watch-min-hosts 1` against the single loopback URL
  (`watchFinal.stoppedReason=min-fetches-and-hosts-met`, fetched 3,
  `jobPollErrors=0`, run-exit 0) -> `monitored-small-crawl.js verify` over the
  launch window (`verified-new-data`, no blockers/warnings, delta urls 1 /
  responses 3 / success 3 / content 1) -> `crawl-packet.js plan --fixture-preset
  small ...` -> `tmp/crawl-packet-small-cadence-live.json`: `ready-for-small-local`
  96% (27/28), db 3/3, taxonomy `[target-already-processed]` only. The fresh
  small rung scores HIGHER than the saved 26/28 (93%) because a warm UI gave
  `jobPollErrors=0`, so it carries NO `poll-error`. Cadence vs
  `tmp/medium-sequential-terminalcap-packet.json` now reports
  `cadenceConsistent:false` (small 96% vs medium 93%; `poll-error` only in
  medium) — a benign, expected divergence (medium's `poll-error` is the known
  synchronous-boot job-registry timeout in `SERVERSIDE_ACCEPT_BEFORE_BOOT_SPEC.md`,
  not a small regression; refreshing the small rung surfaced it honestly).
  GOTCHA: PowerShell `2>` redirect of long `run.js` stderr lines inserts spurious
  mid-token newlines (console-width wrapping); the `watch-log` JSON had to be
  repaired (join physical lines, re-split into brace-balanced objects) before
  `crawl-packet.js plan` could parse `watchFinal`. `verify` is the DB-evidence
  source of truth regardless. Fixture process stopped after the proof.
- `tools/crawl/run.js` supports local host-watch gates with
  `--watch-min-hosts`; JSON watch ticks include `hostCoverage`, and
  `watchFinal` includes `minHosts`, `minHostsMet`, `coveredHosts`, and
  `missingLocalTargets`.
- `tools/crawl/run.js` supports dispatcher-level batch launch controls:
  `--batch-concurrency`, `--batch-retries`, `--batch-retry-delay-ms`, and
  `--batch-request-timeout-ms`.
- Packet-generated fixture launches and tiny local smoke commands use
  `--batch-retries 0 --batch-request-timeout-ms 60000`, preserving
  operation-start uncertainty instead of retrying POST starts into duplicate
  local operation jobs.
- Local watch passes accepted launch job IDs to `LocalBackend.jobs()`, which
  polls `/api/v1/crawl/jobs/:jobId` before falling back to broad `/jobs`
  evidence.
- Partial local launch watch follows accepted jobs and lowers the runtime
  `minHosts` gate to accepted-job count while preserving the original nonzero
  launch exit. A partial launch remains a packet blocker.
- `tools/crawl/local-fixture-server.js` provides checked-in tokenized loopback
  small and medium fixture targets.
- `tools/crawl/sequential-fixture-proof.js` provides no-contact `plan` and
  bounded local `execute` modes for medium loopback fixtures. Execute starts
  loopback fixture servers, launches one host at a time, writes per-host
  launch/watch/verify artifacts, composes medium launch/watch/verify artifacts,
  emits a reliability packet, and can compare that packet to a prior blocked
  packet.
- Sequential helper summaries and packets preserve per-target job terminal
  evidence: job ID, job status, status source, observed/terminal flags,
  terminal state, DB proof state, and per-target warnings.
- Packets classify `job-still-running-after-db-proof` when DB proof succeeds
  while accepted operation jobs still report non-terminal states. This is a
  warning taxonomy, not a blocker, because DB persistence and host coverage
  are already proven.
- `tools/crawl/run.js` now supports optional post-DB-proof terminal wait with
  `--watch-wait-terminal-after-db-proof` and `--watch-terminal-timeout`.
  Terminal wait is disabled by default.
- `tools/crawl/sequential-fixture-proof.js execute` exposes the same policy as
  `--wait-for-terminal --terminal-wait-timeout <seconds>`. When enabled, the
  helper records terminal-wait evidence in per-host and composed artifacts.
- Once DB/host proof has started terminal wait, the local watch timeout no
  longer overwrites the terminal wait outcome. This fixed a false hard timeout
  exposed by the first terminal-wait proof.
- Packets preserve `watchFinal.terminalWait` and classify incomplete terminal
  wait as `job-terminal-wait-after-db-proof-incomplete`, a warning when DB
  proof and host coverage pass.
- Tiny BBC local smoke from `2026-05-29T15:05:08.265Z` remains the current
  internet-target tiny proof in `tmp/local-smoke-report.json`. File-only
  comparison/cadence artifacts remain clean:
  `tmp/local-smoke-comparison-terminal-wait.json` and
  `tmp/local-smoke-cadence-terminal-wait.json`.
- Small job-ID fixture proof used token `small-jobid-live-1956` on
  `127.0.0.1:41941`; it passed with DB delta 1 URL, 3 responses, 3 successes,
  and 1 content row. Packet `tmp/crawl-packet-small-jobid-live.json` scored
  26/28 (93%).
- Concurrent medium rerun after partial-launch min-host adjustment used token
  `medium-jobid-rerun-20260529-1` on port `41952`. It exited 2: `127.0.0.3`
  failed launch with `read ECONNRESET`, `127.0.0.2` accepted but produced no
  recent DB rows, and only `127.0.0.1` had DB evidence. Packet:
  `tmp/crawl-packet-medium-jobid-rerun.json`, score 20/28 (71%), label
  `blocked`, primary `partial-launch`, blockers `partial-launch` and
  `watch-host-coverage-not-met`.
- Helper sequential medium proof used token `medium-seq-helper-live-20260529-1`
  on port `41966`; it passed with exit 0, DB delta 3 URLs, 9 responses,
  9 successes, 0 failed responses, and 3 content rows. Packet:
  `tmp/medium-sequential-helper-live-packet.json`, score 26/28 (93%), label
  `ready-for-medium-local`.
- Terminal-state sequential medium proof used token
  `medium-terminal-live-20260529-1` on port `41972`; it passed with exit 0,
  DB delta 3 URLs, 9 responses, 9 successes, 0 failed responses, and 3 content
  rows. Packet: `tmp/medium-sequential-terminal-live-packet.json`, score 26/28
  (93%), label `ready-for-medium-local`, blockers `[]`, taxonomy `poll-error`,
  `job-still-running-after-db-proof`, and `target-already-processed`.
- The first terminal-wait proof used token
  `medium-terminal-wait-live-20260530-1` on port `41985`. DB proof passed, but
  the helper exited 2 because the global watch timeout overrode an already
  active terminal wait. The code now fixes that timeout-boundary bug.
- Corrected terminal-wait sequential medium proof used token
  `medium-terminal-wait-fixed-20260530-1` on port `41986` with
  `--wait-for-terminal --terminal-wait-timeout 15`. It exited 0, produced DB
  delta 3 URLs, 9 responses, 9 successes, 0 failed responses, and 3 content
  rows, with recent DB evidence for all three hosts. Packet:
  `tmp/medium-sequential-terminal-wait-fixed-packet.json`, score 26/28 (93%),
  label `ready-for-medium-local`, blockers `[]`, taxonomy `poll-error`,
  `job-still-running-after-db-proof`,
  `job-terminal-wait-after-db-proof-incomplete`, and
  `target-already-processed`.
- Corrected terminal-wait comparison
  `tmp/medium-sequential-terminal-wait-fixed-comparison.json` selected the
  terminal-wait packet over blocked concurrent
  `tmp/crawl-packet-medium-jobid-rerun.json`: score delta +22 and DB host
  coverage delta +2.
- Terminal-wait evidence shows all three accepted loopback operation jobs had
  `job-evidence-unavailable` after the 15s terminal wait despite successful DB
  and host proof. The next reliability gap is job endpoint responsiveness during
  active crawls, not DB persistence.
- Refreshed no-contact artifacts include:
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
- Reuters one-host internet-target proof remains blocked: accepted job, watch
  timeout, fetched=0, many job poll timeouts, and no DB rows.
- 2026-05-30 implementation (code complete, validated by syntax + 99 focused
  tests + no-contact command-shape checks): `tools/crawl/run.js` now exposes
  `--watch-terminal-job-poll-timeout <ms>` (default 5000, clamped 1500-5000)
  that raises the per-poll `/jobs/:jobId` budget ONLY during the terminal-wait
  phase, so the in-process CPU-bound crawl can no longer starve the cheap job
  route. `terminalWait` now records `jobPolls`, `jobPollErrors`,
  `endpointResponded`, and `jobPollTimeoutMs`. New exported pure function
  `classifyTerminalWaitOutcome` returns exactly `terminal` /
  `timed-out` / `endpoint-unavailable`. `tools/crawl/lib/crawl-packet.js`
  serializes the four new fields and emits sub-taxonomy
  `job-terminal-wait-timed-out` vs `job-terminal-wait-endpoint-unavailable`
  under the umbrella `job-terminal-wait-after-db-proof-incomplete`.
  `tools/crawl/lib/sequential-fixture-proof.js` plumbs the flag into per-step
  launch commands when `--wait-for-terminal` is set.
- Focused tests passing (101 across 3 suites): `tests/tools/crawl/run.test.js`,
  `tests/tools/crawl/crawl-packet.test.js`,
  `tests/tools/crawl/sequential-fixture-proof.test.js` (classifier 4-case test,
  endpoint-unavailable packet test, flag default/override test, sequential
  launch-shape assertion, plus two composed-incomplete sub-taxonomy tests added
  2026-05-30).
- BLOCKER RESOLVED 2026-05-30 (rebuild approved + run): `npm rebuild
  better-sqlite3` in `news-crawler-db` under Windows node
  `C:\nvm4w\nodejs\node.exe` (v25.2.1 x64) exited 0. The rebuilt
  `news-crawler-db/...better_sqlite3.node` is now PE/Windows (`4D 5A 90 00`), and
  a spawned-Windows-node `new Database(':memory:')` round-trip returns
  `db-ok 42`. The Linux-ELF dlopen failure is gone. (Root cause for history: the
  sibling addon had been a Linux ELF binary built under WSL; the proof spawns
  Windows node via `process.execPath`, which cannot dlopen an ELF `.node`. The
  addon loads lazily on first `new Database(...)`, so plain `require` masked it.)
- LIVE TERMINAL-WAIT SEQUENTIAL MEDIUM PROOF PASSED 2026-05-30 (token
  `medium-terminal-wait-rebuilt-20260530-1`, port 41990): exit 0, all three
  hosts `verified-new-data`, DB delta 3 URLs / 9 responses / 9 successes /
  0 failed / 3 content rows (1/3/1 per host). Packet
  `tmp/medium-sequential-terminal-wait-rebuilt-packet.json` scored 26/28 (93%)
  `ready-for-medium-local`, blockers `[]`. Comparison vs baseline
  `tmp/medium-sequential-terminal-wait-fixed-packet.json`: both pass, blocked 0,
  score delta 0, DB-host delta 0. Per-host terminalWait now populated:
  `127.0.0.1` and `127.0.0.2` outcome `endpoint-unavailable` (jobPolls 4,
  jobPollErrors 4, endpointResponded false); `127.0.0.3` outcome `terminal`
  (jobPolls 1, jobPollErrors 0, endpointResponded true). The three-state
  classifier works per host. REMAINING GAP: the in-process `/jobs/:jobId`
  endpoint is starved during the active CPU-bound crawl for the earlier hosts
  even with the 5s per-poll budget; only the last (wound-down) host responded.
  Also the 4 polls x 5s overshoot the 15s terminal-wait window (~21s elapsed) —
  candidate next-pass tweak: cap total poll time at the terminal-wait budget.
- SUB-TAXONOMY PLUMBING FIX SHIPPED 2026-05-30: the sequential composer collapses
  mixed per-host terminalWait outcomes to `outcome: "incomplete"` but preserves
  the per-outcome breakdown in `counts` (`{endpoint-unavailable: 2,
  terminal: 1}`). `tools/crawl/lib/crawl-packet.js` now derives the sub-taxonomy
  from `counts` when `outcome === 'incomplete'`: a homogeneous non-terminal set
  yields the precise tag (`job-terminal-wait-endpoint-unavailable` /
  `job-terminal-wait-timed-out`), a mixed set stays umbrella-only. The real
  rebuilt packet now emits `job-terminal-wait-endpoint-unavailable`.
- CONCURRENT-LAUNCH ECONNRESET INSPECTED 2026-05-30 (read-only, node closed):
  the concurrent medium failure (`read ECONNRESET` on `127.0.0.3`, token
  `medium-jobid-rerun-20260529-1`, 20/28 `blocked`) is a fan-out contention
  artifact, not a harness bug. `crawl-batch.js runWithConcurrency()` fires
  `--batch-concurrency` simultaneous POST `/operations/<op>/start` requests; the
  in-process unified server's start path does synchronous, event-loop-blocking
  work (engine boot + the SYNCHRONOUS better-sqlite3 `new Database(...)` open),
  so concurrent sockets are reset before the server accepts them.
  `isRetryableStartFailure()` classifies `ECONNRESET` as retryable, but the
  deliberate non-retrying fixture policy (`--batch-retries 0`, chosen to avoid
  duplicate operation jobs) makes a single reset a permanent per-host launch
  failure. The SEQUENTIAL rung (one host at a time) never has a second in-flight
  POST, which is why it scores 26/28 while concurrent stalls at 20/28. DECISION:
  the sequential rung is the canonical local medium proof; do NOT add harness
  retries (duplicate-job risk). The proper concurrent fix is server-side
  (accept/enqueue before the blocking engine+DB boot) and belongs to the
  unified-server / `news-crawler-backend-core` boundary — recorded as a
  promotion candidate, not actioned because sequential already meets the goal.
- POLL-BUDGET CAP SHIPPED 2026-05-30: `tools/crawl/run.js` now exports a pure
  helper `clampTerminalWaitJobPollTimeout({ elapsedMs, totalTimeoutMs,
  maxPollTimeoutMs })` that caps each terminal-wait `/jobs/:jobId` poll budget to
  the time remaining in the terminal-wait window, returning 0 when the budget is
  exhausted (signal to finalize without another poll). This stops the observed
  4x5s ~= 21s overshoot of a 15s window: the final poll(s) shrink and the loop
  finalizes at the budget. Wired into the job-poll site under
  `inTerminalWaitPhase` (computes `terminalWaitElapsedMs` from
  `terminalWait.startedAt`); a 0 budget skips the poll and reuses
  `lastJobEvidence`. Unit-tested with 6 cases (elapsed 0/9000 -> 5000; 13000/total
  15000 -> 2000; 15000/16000 -> 0; missing elapsed -> 5000).
- Focused tests now 102 across the same 3 suites (added the
  `clampTerminalWaitJobPollTimeout` case).
- CAPPED TERMINAL-WAIT SEQUENTIAL MEDIUM PROOF PASSED 2026-05-30 (token
  `medium-terminalcap-20260530-173203-1`, port 39711): exit 0, all three hosts
  `verified-new-data`, DB delta 3 URLs / 9 responses / 9 successes / 0 failed /
  3 content rows (1/3/1 per host). Packet
  `tmp/medium-sequential-terminalcap-packet.json` scored 26/28 (93%)
  `ready-for-medium-local`, blockers `[]`, taxonomy `poll-error` +
  `target-already-processed`. Comparison vs rebuilt baseline: both pass,
  blocked 0, score delta 0, DB-host delta 0. This run the `/jobs/:jobId`
  endpoint actually responded for every host (the crawls finished fast enough):
  per-host terminalWait `elapsedMs` ~2.0s, `jobPolls` 2, `jobPollErrors` 1,
  `outcome` `terminal`, `endpointResponded` true. No overshoot of the 15s
  budget; the cap is in place and the overshoot-bounding logic is covered
  deterministically by the unit test even though this run did not need to clamp.
- REMAINING SERVER-SIDE FRONTIER (read-only, owner-routed): the in-process
  `/jobs/:jobId` route handler
  (`src/server/crawl-api/v1/express/routes/operations.js`) is itself trivial (a
  registry lookup) and `InProcessCrawlJobRegistry.startOperation` already
  registers + returns the job synchronously and defers `service.runOperation`
  via `Promise.resolve().then(...)`. The starvation is therefore NOT the start
  acceptance path but the `service.runOperation` body: the engine boot plus the
  SYNCHRONOUS better-sqlite3 `new Database(...)` open block the event loop while
  an active CPU-bound crawl is running, so subsequent job polls can be starved.
  The durable fix (move the synchronous DB open + heavy boot off the main thread
  / yield cooperatively during the active crawl) shares the same root as the
  concurrent-launch ECONNRESET and belongs to the crawl-service /
  `news-crawler-backend-core` ownership boundary. NOW CAPTURED as the read-only
  promotion spec [`SERVERSIDE_ACCEPT_BEFORE_BOOT_SPEC.md`] (options A yield, B
  open-DB-once-and-inject, C worker_thread; recommends A+B). NOT actioned
  locally because the harness-side cap + sequential rung already satisfy the
  local reliability goal.
- RECURSIVE-SYSTEM TOOLING: `tools/crawl/validate-continuation-state.js` parses
  the `## Execution State` JSON in this file and asserts invariants (active_node
  == pending_nodes[0]; no completed/pending overlap; no dups). It caught a real
  collision (`update_docs_and_next_prompt` in both lists) on first run, now
  fixed; recurring step-node names must be uniquely suffixed (`..._N`). The
  stale `NEXT_CONTINUATION_PROMPT.md` now carries a DEPRECATED/ARCHIVE banner
  pointing here; `CONTINUATION_PROMPT.md` is the single canonical prompt.
- PARALLEL LOCAL RUNNER SCHEDULING TRACED 2026-05-30 (read-only, spec-only): the
  basic article crawl fans out via `src/cli/crawl/runner.js` ->
  `runMultiModalCrawl()` -> `MultiModalCrawlManager` (when >1 domain), a
  worker-pool with default `maxParallel=30`. `start()` launches
  `min(limit, queue.length)` tail-recursive `runNext()` chains that `shift()`
  domains off `this.queue`, `await session.promise`, then recurse in `finally`;
  `Promise.all(starters)` joins them. CRITICAL FINDING: the better-sqlite3
  handle is opened ONCE in `runMultiModalCrawl` (`openNewsDb(dbPath)`) and
  captured in the `createOrchestrator` closure, so `_startDomain` ->
  `createOrchestrator(config)` injects the SAME shared `db` handle + single
  `CrawlOperations` facade into every parallel domain orchestrator. The local
  fan-out therefore already implements Option B of
  `SERVERSIDE_ACCEPT_BEFORE_BOOT_SPEC.md` (open-once-and-inject) and does NOT
  re-open the DB per runner, so it does NOT recur the server-side per-operation
  synchronous-boot starvation. Residual contention is bounded/benign: all N
  "parallel" orchestrators share one synchronous handle on one event loop, so
  heavy synchronous writes serialize briefly, but "parallel" here is I/O
  interleaving and the open cost is amortized once. No local change warranted;
  documented in WORKING_NOTES, PLAN, recursive plan, `tools/crawl/AGENT.md`,
  `docs/cli/crawl.md`, and `docs/RUNBOOK.md`.
- Remote contact and all remote mutation remain disallowed by this prompt.

- ACCEPTED-JOB-NO-DB-ROWS FOR 127.0.0.2 EXPLAINED 2026-05-30 (read-only,
  spec-only): forensics of the blocked concurrent medium rerun (token
  `medium-jobid-rerun-20260529-1`, port 41952, `--batch-concurrency 2
  --batch-retries 0`) prove `127.0.0.2`'s accepted-but-no-recent-DB-rows is a
  LATE START, not a crash or silent drop. Launch report
  (`tmp/medium-jobid-rerun-launch.stdout.json`): `127.0.0.1` job `createdAt
  20:14:59.087` (immediate); `127.0.0.2` job `createdAt 20:15:37.110`
  (~38s late); `127.0.0.3` `read ECONNRESET`. Watch log
  (`tmp/medium-jobid-rerun-watch.stderr.log`): both accepted jobs `running`,
  host1 rows land `20:15:45`, then `/jobs` returns `available:false,
  error:"timeout after 1500ms"` (the same job-route starvation); watch ends
  `local-host-coverage-not-met` at `~20:15:56`, coveredHosts `[127.0.0.1]`.
  Verify (`tmp/medium-jobid-rerun-verify.json`): window until `20:15:59.078`,
  `missingRecentEvidence:[127.0.0.2,127.0.0.3]`. ROOT: with `--batch-concurrency
  2`, host1 + host3 go in flight first; the in-process start path's synchronous
  engine+DB boot blocks the event loop, so host3's socket resets (ECONNRESET)
  and host2's queued `/start` is not accepted until host1's crawl frees the loop
  (~38s later), leaving only ~19-22s of the watch window -- too little to commit
  rows. ALL THREE symptoms share ONE root: the synchronous boot. One server-side
  accept-before-boot change (spec Option A yield + Option B open-DB-once-inject)
  fixes both the host3 ECONNRESET and the host2 late-start-no-rows. No local
  harness change warranted (sequential rung sidesteps all three; harness start
  retries forbidden -- duplicate-job risk). Documented in WORKING_NOTES, PLAN,
  recursive plan, `SERVERSIDE_ACCEPT_BEFORE_BOOT_SPEC.md` addendum,
  `tools/crawl/AGENT.md`, `docs/cli/crawl.md`, and `docs/RUNBOOK.md`.

- PACKET COMPARISON CARD SHIPPED 2026-05-30 (node
  `add_dashboard_packet_comparison_card`, read-only, no-contact): added a compact
  dashboard "card" renderer for the small-vs-medium cadence comparison. New lib
  functions in `tools/crawl/lib/crawl-packet.js`: `buildPacketComparisonCard`
  (accepts a `comparison` object, a saved `--cadence`
  `crawl-packet-cadence-comparison` artifact, or builds on the fly from
  `--small`/`--medium`), `renderPacketComparisonCardText`, and
  `renderPacketComparisonCardHtml` (read-only `<section>`, NO `<script>`, all
  values HTML-escaped) — all three exported. CLI `tools/crawl/crawl-packet.js`
  gained a `card` mode (alias `comparison-card`), a `--html` boolean flag, and a
  `--cadence <path>` option DISTINCT from plan mode's `--comparison` (saved
  local-smoke comparison) to avoid collision. Card shape:
  `mode: crawl-packet-comparison-card`, `actionPolicy` all read-only/false,
  `rungs[2]` (`scorePercent`, `db{downloads,success,content}`,
  `hostCoverage{requested,dbCovered,dbMissing}`, `taxonomy`, `blockers`), and
  `verdict{cadenceConsistent, diagnostics, nextSafestAction}`. Exit 0 when
  consistent, 2 otherwise. Rendered against the fresh artifacts
  (`tmp/crawl-packet-small-cadence-live.json` 96% vs
  `tmp/medium-sequential-terminalcap-packet.json` 93%): verdict DIVERGENT,
  diagnostics `score percent differs by -3` + `taxonomy only in medium:
  poll-error`. Saved `tmp/small-vs-medium-card.json` + `tmp/small-vs-medium-card.html`.
  Strictly read-only: no crawler start, no network, no DB write, no queue mutation.
- RECURSIVE-SYSTEM IMPROVEMENT APPLIED 2026-05-30 (brainstorm conclusion): added
  a non-fatal `--max-lines <n>` growth guard (default 800) to
  `tools/crawl/validate-continuation-state.js`. When this file exceeds that line
  count the validator prints a `WARN:` line pointing at the
  `split_execution_state_to_standalone_file_if_growth_warrants` node WITHOUT
  changing the exit code, so a green loop stays green while getting an objective,
  evidence-based trigger to split the serialized state. This file is currently
  ~640 lines (under 800, no warn yet); `--max-lines 100` fires the WARN as a
  smoke test. Chosen this turn over a full state-file split because it is
  read-only, low-risk, and operationalizes the pending split node rather than
  pre-empting it.
- 1000-DOWNLOAD ISOLATION PROVEN AT SCALE + MONITORED PARTIAL 2026-05-31 (node
  `run_internet_1000_download_crawl_to_sample_db_with_agentic_monitoring`
  COMPLETE): a real bounded BBC internet crawl (`run.js --local --profile gentle
  --max-pages 1500 --max-depth 4 --concurrency 3 --crawl-db
  data/samples/internet-small-sample.db ... https://www.bbc.com/news`) downloaded
  REAL content into the SAMPLE DB while production `data/news.db` stayed EXACTLY
  unchanged at the larger 1000-target scope. PROD delta 0/0/0/0,
  `latestFetchedAt` frozen `2026-05-30T23:43:13.069Z` (before AND after); SAMPLE
  delta responses +42 / content +13 / urls +208. The agentic monitor tracked
  live writer-DB growth (16→40→49→55→58; 3 saved packets, verdict in-progress,
  no anomalies) WHILE the legacy watch meter reported `fetched=0` (it polls the
  production meter DB) and the job endpoint timed out (`timeout after 1500ms`) —
  exactly the value proposition (writer-DB monitor = visible isolated crawl vs
  false `fetched=0`). HONEST CLASSIFICATION: the gentle single-host profile paces
  ~8 downloads/min, so 1000 was NOT reached in-turn — recorded as a MONITORED
  PARTIAL run, not faked completion. Artifacts: `tmp/iso-1000-proof.json`
  (consolidated), `tmp/iso-1000-before.json`/`tmp/iso-1000-after.json`
  (both-DB snapshots via `tmp/snapshot-both-dbs.js`),
  `tmp/iso-1000-progress-{a,b,final}.json`. Focused suite 100 green on the 3
  touched files; full focused crawler set remains 131.
- META-AGI LESSONS FROM THE 1000 RUN 2026-05-31 (drive the next node): (1)
  BOOT-TIMEOUT PREFLIGHT — the auto-spawned UI tripped the 30s readiness timeout
  on first launch (`auto-spawned unified UI did not become ready within 30s`);
  fix is to set `CRAWL_RUN_SERVER_READY_TIMEOUT_MS=120000` for any run ≥ small,
  which MUST be a required preflight, not a surprise. (2) SELF-CLOCKING MONITOR —
  my wall-clock `--elapsed-ms` computed NEGATIVE 3.5M ms (session-clock vs
  file-timestamp skew); the monitor must derive elapsed/throughput from DB
  `latestFetchedAt` deltas between two samples, NEVER from harness wall-clock.
  (3) BASELINE-SHAPE ADAPTER GAP — `tmp/snapshot-both-dbs.js` writes
  `sample.totals` but `loadBaselineSnapshot` in
  `tools/crawl/crawl-progress-monitor.js` reads `sample.before`, so packet
  `dbGrowth` showed absolute totals not delta; teach the adapter the
  `{sample:{totals}}` / `{production:{totals}}` shape. (4) PACING — gentle
  single-host is too slow for 1000; reaching it needs faster pacing, more hosts,
  or a long-running background watcher with periodic monitoring. (5) POWERSHELL
  FOOTGUN CONFIRMED AGAIN — inline `node -e` with backslash-escaped quotes and
  inline `(Get-Date)` wedged the shell at `>>` twice; prefer Node SCRIPT FILES
  (e.g. `tmp/snapshot-both-dbs.js`, `tmp/build-iso-1000-proof.js`,
  `tmp/append-iso-1000-notes.js`) over inline `node -e` for anything with quotes.

## Goal

The operator has REPIVOTED this loop toward CRAWL QUALITY (see the
`## Crawl Quality North Star` section). The READ-ONLY audit node is COMPLETE and
corrected the gap inventory: robots DB caching (24h TTL), conditional GET
(etag/last-modified), 304 not-modified skip, and sitemap `<lastmod>` surfacing
are ALREADY implemented and live-wired (see the AUDIT COMPLETE fact above for
file:line evidence). The encapsulation plan + module-boundary SVG/markdown live
in the session folder.

The active node is
`implement_robots_txt_cache_with_ttl_revalidation_and_db_persistence` — the
first IMPLEMENTATION node. Extract a single-responsibility `RobotsCache` from
`RobotsAndSitemapCoordinator.loadRobotsTxt()` that (1) persists robots.txt into
the TYPED coverage columns (`robotsTxt`, `crawlDelaySeconds`, `sitemapUrls`)
rather than a generic article row, (2) replaces the hardcoded 24h TTL with a
configurable TTL plus CONDITIONAL REVALIDATION (send `If-None-Match`/
`If-Modified-Since` on the robots.txt re-fetch; on 304 refresh the cache
timestamp without re-parsing), and (3) parses + persists `Crawl-delay` so the
downstream `PolitenessGovernor` node can read it via `getCrawlDelay(userAgent)`.
This node WRITES CODE + TESTS but stays bounded: extract behind the existing
coordinator seam, keep `isAllowed()`/sitemap harvesting behavior identical, add
focused unit tests, and do NOT yet enforce `Crawl-delay` as a rate floor (that
is the next node). Internet downloading stays APPROVED for downstream run nodes;
production `data/news.db` writes stay GATED.

The prompt is now > 800 lines (validator `--max-lines` WARN). STRONGLY CONSIDER
folding `split_execution_state_to_standalone_file_if_growth_warrants` into this
turn: move the `## Execution State` JSON to a standalone
`EXECUTION_STATE.json` and have the validator read it, shrinking the prompt.

## Required Workload

1. EXTRACT `RobotsCache`: pull the robots.txt fetch/cache/parse lifecycle out of
   `RobotsAndSitemapCoordinator.loadRobotsTxt()` into a single-responsibility,
   dependency-injected module (DB adapter + fetch fn injected). The coordinator
   keeps `isAllowed()` and sitemap harvesting; it delegates load/cache to
   `RobotsCache`. Preserve current observable behavior exactly.
2. TYPED PERSISTENCE: write robots.txt body, parsed `Crawl-delay` (seconds), and
   discovered sitemap URLs into the coverage columns `robotsTxt`,
   `crawlDelaySeconds`, `sitemapUrls` (use existing news-crawler-db methods;
   prefer wiring over schema changes). Keep a fallback read for the legacy
   article-row cache so existing data still loads.
3. CONFIGURABLE TTL + CONDITIONAL REVALIDATION: replace the hardcoded 86400s TTL
   with a configurable value; on TTL expiry, re-fetch robots.txt with
   `If-None-Match`/`If-Modified-Since` from the stored etag/last-modified; on a
   304, refresh the cache timestamp WITHOUT re-parsing; on 200, re-parse and
   re-persist. Reuse the existing conditional-header machinery where practical.
4. CRAWL-DELAY PARSE: parse `Crawl-delay` (per-user-agent, with `*` fallback)
   from robots.txt and expose `getCrawlDelay(userAgent)`. Do NOT yet enforce it
   as a rate floor (next node). Persist it for the governor to consume.
5. TESTS: add focused unit tests for `RobotsCache` — cache hit within TTL, miss
   triggers fetch, 304 revalidation refreshes timestamp without re-parse, 200
   re-parse, `Crawl-delay` parsing (numeric, per-agent, malformed → ignored),
   typed persistence round-trip, and legacy-row fallback read. Keep the existing
   coordinator tests green.
6. SPLIT EXECUTION STATE (fold in
   `split_execution_state_to_standalone_file_if_growth_warrants`): the prompt is
   > 800 lines. Move the `## Execution State` JSON into a standalone
   `EXECUTION_STATE.json` in the session folder and point
   `tools/crawl/validate-continuation-state.js` at it (keep a short pointer stub
   in the prompt). Confirm the validator still reports `OK` reading the new
   location.
7. OWNERSHIP: keep all extraction in `copilot-dl-news`; use existing
   `news-crawler-db` methods for the typed columns (do not fork schema). Do not
   move crawler work into `jsgui3-ecosystem`; do not edit
   `news-crawler-backend-core` or `InProcessCrawlJobRegistry.js`.
8. BASELINE GREEN: run the focused crawler suites (`run.test.js`,
   `crawl-packet.test.js`, `sequential-fixture-proof.test.js`,
   `writer-db-isolation.test.js`, `crawl-progress-monitor.test.js`) PLUS the new
   `RobotsCache` tests; confirm ≥ 139 still pass.
9. Run `node tools/crawl/validate-continuation-state.js` and confirm `OK`
   (`89 completed, 10 pending`, active
   `implement_robots_txt_cache_with_ttl_revalidation_and_db_persistence`),
   reading from `EXECUTION_STATE.json` if the split landed.
10. Do NOT write to production `data/news.db` (gated). Do not contact the remote
    crawler or mutate the remote queue. Internet contact only via the bounded
    revalidation unit tests' injected fetch stub (no live network this node).
11. Update `tools/crawl/AGENT.md`, `docs/RUNBOOK.md`, `PLAN.md`,
    `WORKING_NOTES.md`, and `CRAWLER_RELIABILITY_RECURSIVE_PLAN.md` with the
    `RobotsCache` extraction, the TTL/revalidation contract, and the persisted
    `Crawl-delay` handoff to the governor node.
12. Run whitespace scan + targeted `git diff --check`, ensure no stray
    processes, then rewrite the next full recursive continuation prompt into
    `CONTINUATION_PROMPT.md` (uniquely suffix any recurring step-node names so
    the validator stays green) and give a concise pointer to that file in the
    assistant's final chat output instead of pasting the full prompt.

## Safety Constraints

- The ACTIVE node WRITES CODE + TESTS (extract `RobotsCache`) but stays bounded:
  no live network (conditional-revalidation tests use an INJECTED fetch stub),
  no crawl, no production DB write. Internet downloading remains
  APPROVED+ENCOURAGED for the DOWNSTREAM run node (bounded BBC crawl into the
  SAMPLE DB, `--crawl-db data/samples/internet-small-sample.db`). Production-DB
  writes remain GATED (no write to `data/news.db`).
- PRESERVE OBSERVABLE BEHAVIOR: the extraction must keep `isAllowed()`, sitemap
  harvesting, and existing cache reads working; add a legacy-row fallback so
  current cached robots data still loads. Do NOT yet enforce `Crawl-delay` as a
  rate floor — only parse + persist it (enforcement is the next node).
- POLITENESS IS A HARD FLOOR: never let a change cause the crawler to ignore
  `robots.txt`, breach a `Crawl-delay`, or hammer a host.
- Do not over-optimize a single priority (e.g. throughput) at the expense of
  overall crawl quality, politeness, or code clarity.
- Do not contact the remote crawler or mutate the remote queue unless explicitly
  approved.
- Do not deploy, force deploy, prune, drain, clear, seed, start remote crawls,
  or run queue maintenance unless explicitly approved for that mutation class.
- Keep any crawl bounded; do not add harness-side start retries (duplicate-job
  risk).
- Keep crawl caps tight, artifacts bounded, and cleanup explicit.
- Do not hide real failures. Classify them and preserve evidence.
- Never revert unrelated local changes.

## Verification

- Syntax checks for any touched JS files.
- Focused Jest tests for crawler files + new `RobotsCache` tests (expect ≥ 139
  passing).
- Execution-state invariant check:
  `node tools/crawl/validate-continuation-state.js` must report `OK`
  (`89 completed, 10 pending`, active
  `implement_robots_txt_cache_with_ttl_revalidation_and_db_persistence`),
  reading from `EXECUTION_STATE.json` if the split landed. After the split the
  `--max-lines` growth `WARN` should clear or shrink.
- Implementation artifact: a single-responsibility `RobotsCache` module with
  typed persistence (`robotsTxt`/`crawlDelaySeconds`/`sitemapUrls`), configurable
  TTL + conditional revalidation (304 refreshes timestamp without re-parse), and
  `getCrawlDelay(userAgent)`; coordinator behavior preserved.
- Baseline-green check: focused crawler suites still pass and the new tests
  cover cache hit/miss, 304 revalidation, Crawl-delay parsing, typed round-trip,
  and legacy-row fallback.
- Process cleanup check for fixture, `run.js`, local UI, and `crawl-batch`
  processes.
- Targeted whitespace scan and targeted `git diff --check -- <touched files>`.

## Final Response Required

Return:

1. Concise summary.
2. Verification results and crawl artifacts produced.
3. Reliability scorecard: policy, preflight, launch, watch, DB proof,
   artifacts, comparison, safety, operator clarity.
4. The next full recursive continuation prompt rewritten into
   `CONTINUATION_PROMPT.md` (with active/completed/pending nodes and 10-16
   connected workload items), and a concise pointer to that file in the chat
   output instead of the full prompt text.
5. Last 5 turns: up to 5 dense single-line state items.
6. Predetermined next items: up to 10 backlog items from `PLAN.md`.
7. Horizon estimate: current horizon, scope, delta, discovery risk, and note
   whether this is a rolling crawler-reliability horizon.
