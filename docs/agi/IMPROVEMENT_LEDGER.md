# Improvement Ledger

Falsifiable record of whether the compounding-improvement loop
(`.claude/skills/singularity/SKILL.md`) actually compounds. Two signals, per the skill:
**cost-per-verified-improvement should fall**, and **second-order tools should appear**
(instructions/tools that improve instruction/tool production — recursion, not accumulation).
If cost rises across comparable rows, the scaffold is bloating: say so and prune.

Method note: "cost" is a rough per-improvement share of an agent working turn (wall-clock +
tool-calls burden), judged by the agent that did the work — coarse, but comparable across rows
of the same kind. Bugs = defects found in the NEW work during its own verification (finding a
*pre-existing* bug counts as a discovery, not a cost).

## Delegations (copilot → ncdb, semantics-preserving)

| # | Date | Surface | Cost | Bugs in new work | Verification stack | Notes |
| - | ---- | ------- | ---- | ---------------- | ------------------ | ----- |
| 1 | 2026-07-19 | crawl_milestones INSERT (milestones.js) | ~1.0 turn | 1 (eager-prepare group crash — caught by real-fixture e2e, fixed in 63ad5d8) | round-trip + real-NewsDatabase e2e + live-schema probe + 4-lens adversarial workflow | First of its kind; recipe established here |
| 2 | 2026-07-19 | sync-site-geo full 8-statement surface | ~0.5 turn | 0 | differential e2e (9/9) + live dry-run before/after identical | Recipe applied up front; own-cache-key + real-fixture lessons pre-empted the #1 bug class |
| 3 | 2026-07-19 | article-read canonical join, detect-articles + find-place-hubs (4 statements, −91 lines) | ~0.5 turn | 0 | differential e2e (10/10, trap fixtures) + built-SQL **string equality** + repointed-CLI smoke + sql:check-ui 0 | No adversarial workflow: string-equal SQL is a proof, not a heuristic — verification right-sized to risk. Side discovery: ArticlePlaceMatcher wrong-row join bug (92% live mismatch), filed as its own task |
| 4 | 2026-07-19 | background_tasks DELETE (route -> ncdb deleteBackgroundTask; src/api now raw-SQL-free) | ~0.3 turn | 0 | differential e2e (4/4) + jest 4/4 via test:by-path + LIVE api e2e (delete completed task, 404 after, readonly COUNT 0; terminal-state policy preserved incl. the abandoned-not-deletable quirk) | Smallest delegation yet; recipe now 4-for-4. Ran interleaved with 6 background eval agents (shared concurrency respected: no workflow fan-out) |

Trend: cost halved after row 1 and held; defects in new work went 1 → 0 → 0 while verification
got *cheaper* (proof-style checks replacing fan-outs where applicable). Compounding: **yes so
far** — driven by codified lessons (own cache key, real fixtures) and the reusable
differential-e2e harness pattern.

## Repair + capability cycles

| Date | What | Cost | Verified how | Notes |
| ---- | ---- | ---- | ------------ | ----- |
| 2026-07-19 | Wrong-headline taint verified + purged; redo-place-matching pathway (AnalysisTask redoPlaceMatching/redoArticleIds + PERSISTENCE fix), task→SSE+task_events wiring, redo CLI with terminal progress bar, Background Tasks UI panel with live jsgui3 progress bar (copilot 2 commits ending 7319b2f0; ncdb 50aa2a5) | ~1.0 turn | Taint demonstrated in stored evidence verbatim; live redo (task 73) purged 1,032 rows, independent read-only COUNT; analysis tasks now visible in task-events.js (first ever); panel screenshot live; sql:check-ui green | Recon workflow found place matching was TRIPLY dead (wrong-row join [other session], results never persisted, place source 404s on a wrong port). Two of three fixed; third filed (place-source chip). "0 relations" was honestly reported as expected-but-unproven-positive — the positive-persistence proof is gated on the place source. Coordinated with a concurrent fix session by never touching its uncommitted files. |
| 2026-07-19 | Place source landed — the third kill fixed: ncdb listPlacesWithNamesForMatching (8cdaacc) + GET /api/gazetteer/places route + AnalysisTask baseUrl wiring (copilot 35480724). Scaffold: crawl-status no longer lists the app shell/itself as active crawls (db28e19c). | ~0.5 turn | ACCEPTANCE PASSED: redo --articles 308082 ("London violence") → 73 relations persisted, read-only-verified, "London"×4 at real positions in the article's own text — first working in-app place matching ever. Route: 22MB/~1s; shape-tested on live gazetteer (14,544 places). sql:check-ui green. crawl-status: "(none detected)" with app running. | Coordination: a concurrent session began delegating the matcher's article-text SQL to ncdb (untracked legacy-articlePlaceMatcher.ts) — inspected before building, zero overlap; index.ts diff checked for purity before staging. Known quality debt (pre-existing, logged): rule-level-1 matching relates every place named "London" → 73 relations/article; precision = rule levels 2–4. |
| 2026-07-19 | Crawl Rate panel — new ncdb getCrawlThroughputWindows (50dff3b) + /api/v1/crawl-throughput route + jsgui3 CrawlThroughputPanelControl showing pages/docs/MB-down/MB-stored over 1h/6h/24h with a derived pages/hr (copilot fe63aae4) | ~1.0 turn | Probe-first: caught the mixed fetched_at format trap (209k ISO + 99k space; datetime() normalizes) and the 2-per-response content_storage dupe (dedup). e2e 14/14 real-NewsDatabase; live route 24h=344p/152d/67.6MB/5.06MB; screenshot-verified; sql:check-ui green | New read (not a delegation) but built to the same bar: ncdb-owned SQL, differential-grade e2e with trap fixtures, single ~180ms correlated scan. Ease-of-use: one sidebar click, auto-refresh 15s. |
| 2026-07-19 | Standalone mini crawl dashboard /crawl-mini (~600x240): last-24h totals + live JRPG "+N" heal-number float as pages download; poll-diff of measured windows, no estimates (copilot fe63aae4..HEAD) | ~1.0 turn | Verified in-browser at exact 600x240 (real + demo modes screenshot-confirmed); WLILO-styled; hit + recovered the electron transient-restart gotcha (server proven healthy standalone on 3172 first) | Ease-of-use deliverable per owner; poll-diff batch-per-tick matches the "+10 if many/sec" spec |
| 2026-07-19 | Real-time crawl telemetry pub/sub: lean CrawlDownloadTicker publishes compact crawl:download deltas on the bridge (only on change); mini dashboard subscribes via SSE for instant +N (replacing 2s poll-diff); loopback test-emit hook (copilot e6be05ee) | ~1.0 turn | Ticker unit-tested 8/8; curl-confirmed crawl:download broadcasts to SSE; browser EventSource received frames; live burst produced the green +N heal floats at 600x240 (screenshot). Debugged the silent-drop: bridge validates events, bare {type,ts} rejected -> createTelemetryEvent | Honors the owner ask (small specific data published when needed); latency ~= crawler progress batch interval. Memory: crawl-telemetry-bridge-gotcha |

## Second-order tools (the recursion signal)

| Date | Artifact | Why second-order |
| ---- | -------- | ---------------- |
| 2026-07-19 | docs/agi/BOOT.md + reconciliation method (probe-readers → verdicts) | Improves how all future knowledge is found, trusted, and filed; the sweep method is repeatable |
| 2026-07-19 | Differential-e2e harness pattern (two identical real NewsDatabases, original SQL vs export, trap fixtures) | Reused 3× already; makes every future delegation cheaper and safer — a tool that produces verified tools |
| 2026-07-19 | Probe-stamped-claim convention (RB-011) | Makes staleness machine-detectable; improves the quality of all future written knowledge |
| 2026-07-19 | Model-lineage table + swap calibration (SELF_MODEL.md) | Preserves scaffold value across model generations — the cross-model ratchet, operationalized |

## Tool health observed in passing (fix-or-file, per the tools directive)

- 2026-07-19: `tools/dev/crawl-status.js` + `task-events.js` probe-verified working. Nit:
  crawl-status lists the Electron shell process (cli.js) as an "ACTIVE CRAWL" — process-detection
  false-positive; cosmetic, unfixed.
- 2026-07-19: `sql:check-ui` repaired externally (comment-aware matcher, honest 0 baseline,
  src/ui scope) — now a real regression tripwire; does NOT cover src/tools / src/intelligence.
- 2026-07-19: detect-articles candidate query is slow-by-construction on the live 1.68M-url DB
  (COALESCE in ORDER BY + LOWER(host) defeat indexes — the documented sharp edge). Pre-existing;
  a perf variant would be a behavior change — candidate for a deliberate, tested follow-up.

## Ledger discipline

Append a row per completed improvement cycle (or per major artifact). Keep judgments honest —
a "no measurable delta" cycle gets recorded as such. Subtraction (retiring stale
skills/memories/tools) is improvement too: log it here.
