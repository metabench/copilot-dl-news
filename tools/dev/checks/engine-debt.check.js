#!/usr/bin/env node
'use strict';

/**
 * engine-debt.check.js — the ratchet for the crawler-engine extraction into
 * news-crawler-itself (owner picked this instrument, cycle 174, 2026-08-04).
 *
 * WHY: the 2026-08-03 module-ecosystem audit's causal split, twice confirmed
 * since — extractions with a probe-enforced monotonic number advance (ncdb-debt
 * 269→241; ui-debt 643→488 in three days), extractions that exist as prose
 * freeze (six repos, zero commits since 2026-05-19). The owner's "most
 * important" module — news-crawler-itself, THE crawler engine — had no
 * instrument until this file. The remote gen2 worker runtime moved there in
 * cycle 73; the LOCAL engine (NewsCrawler, fetch pipeline, politeness,
 * signals, planners) is the remaining mass this number counts.
 *
 * THE NUMBER: git-tracked files under src/core/crawler — tests included, they
 * move with their modules. Deliberately NOT counted (widening scope later is a
 * ceiling-affecting decision, not a drive-by): src/core/{orchestration,
 * pipelines,queue}, src/services, the crawl-api layer.
 *
 * Both legal ways DOWN:
 *   - a module DELEGATES to news-crawler-itself and the monorepo copy is
 *     deleted (module-ecosystem rule 3: moves are delegations, not copies —
 *     diff return shapes first; the thin call-through stays here), or
 *   - dead engine code is retired in place, reference-scanned first — and the
 *     scan MUST match the require form (`../X`, `./X`), not just path-style
 *     tokens: cycle 171's grep missed relative requires and cycle 173's first
 *     boot paid for it.
 *
 * The politeness-gate constraint was DISCHARGED in cycle 179: the pair moved
 * to news-crawler-itself/src/politeness under the protocol (gate config
 * repointed in the same commit, requiredPatterns unchanged, escalation
 * byte-intact, ritual-compliance reading across the repo boundary).
 *
 * Exit 0 = at or under ceiling. Exit 1 = over. --ceiling <n> for bite tests.
 */

const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');

// Baseline measured 2026-08-04 (cycle 174): 365 tracked files (252 source +
// 113 tests). Lower as delegations/retirements land; raise deliberate-only.
// 365 → 360 (cycle 175, first slice): ArticleSignalsService + schemaSignals +
// their three test files DELEGATED to news-crawler-itself/signals — 200,000
// live-URL differential showed 0 disagreements before deletion, 13 consumers
// repointed with match-checked edits, sibling suite 76/76 with the tests
// travelling. The engine's URL-signal brain now lives in the engine's repo.
// 360 → 358 (cycle 176, slice 2): ArticleProcessor + its test delegated to
// news-crawler-itself/processing, taking its FULL closure with it — jsdomUtils,
// textMetrics and domFactory (found by chasing the tendril's tendril) moved to
// the engine's src/lib with stable root subpaths, 11 coordinator consumers
// repointed downward. Differential before deletion: 120 stored documents
// through EACH side's own dependency tree (jsdom+readability+cheerio+counts),
// 120/120 deep-equal. One portability bug caught pre-ship: internal code must
// never require its own package by name (jest resolves it; raw Node does not).
// 358 → 349 (cycle 177, slice 3 — the small-leaf batch): utils (13 engine
// consumers; its test travelled FIXED — the 'pre-existing utils.safeCall
// failure' was a wrong import path, broken since it was written),
// LinkExtractor+links (120/120 stored-doc differential), WorkerTaskProcessor,
// CrawlPlaybookService (its coordinator-global getDb() fallback REMOVED — an
// upward dependency the engine must not have; every real site passes db).
// 23 repoints match-checked; a jest.mock on the deleted path retargeted; the
// linkExtractor container entry had the same new-on-module silent-shim bug
// as c176's articleProcessor — fixed loud.
// 349 → 329 (cycle 178, slice 4 — the fetch cluster): FetchPipeline + seven
// satellites (retry policy, host retry budgets, freshness, puppeteer domain
// manager + fetcher, global bandwidth limiter, the pure shouldUseCache
// predicate) + ContentValidationService + ResilienceService, with eleven test
// suites travelling (sibling 202/202). ArticleCache stayed — DB-coupled, with
// a coordinator-global fallback the engine must not inherit. 15 repoints
// match-checked; one more jest.mock retargeted off a deleted path. The GATED
// pair (DomainThrottleManager + limiter) is now the LAST politeness holdout,
// by design.
// 329 → 322 (cycle 179 — the GATED slice): DomainThrottleManager + limiter
// moved under the full protocol (gate config repointed same-commit, both
// err429Streak patterns verified in the moved file, escalation byte-intact),
// with ErrorTracker, HubFreshnessController and CrawlerState riding as clean
// leaves. The coordinator-owned concurrency-default gate test was excised
// from the travelling suite and re-homed (it file-reads NewsCrawler.js).
// QueueManager deliberately did NOT ride: its priorityConfig edge is
// coordinator config with observatory consumers — it waits for the
// NewsCrawler-internals batch.
// 322 → 312 (cycle 180, batch 6 — queue/telemetry/priority): QueueManager
// (its priorityConfig upward arrow DISCHARGED — the coordinator now injects
// isTotalPrioritisationEnabled at construction; engine default false),
// CrawlerTelemetry, PriorityCalculator, and the e2e collaborators the
// per-file-at-join-time rule surfaced one hop at a time (NavigationDiscovery,
// ContentAcquisition — both dependency-clean). PriorityScorer (ConfigManager
// tendril), CrawlerEvents (CliFormatter tendril) and MilestoneTracker
// (planner tendril) each wait for their own slice with an injection design.
// 312 → 297 (cycle 181, batch 7 — the planner family): orchestrator,
// bootstrap, telemetry bridge, adaptive seeding, CountryHubPlanner (its
// getDb() fallback DISCHARGED to injected-db-or-null — _getDbInstance already
// guards null), pattern inference, blueprints, navigation runner,
// CompletionReporter, milestones and MilestoneTracker — whose test suite RAN
// FOR THE FIRST TIME IN ITS EXISTENCE after the move (its jest.mock targeted
// '../intelligence/planner/CompletionReporter', a path that never existed —
// the utils.safeCall pattern's second instance). HubSeeder, StructureMiner
// and TargetedAnalysisRunner stayed: place-hub data-layer and intelligence
// tendrils wait for their own slices.
// 297 → 296 (cycle 181 close): NavigationDiscoveryRunner.test travelled AFTER
// the first bank — the post-delete scan caught it dangling and it counted too.
// 296 → 292 (cycle 182, batch 8 — the injection pair): PriorityScorer (its
// `new ConfigManager()` fallback DISCHARGED to an inert empty-config source —
// coordinator injects the real one at wiring) and CrawlerEvents (CliFormatter
// tendril DISCHARGED: icons/colors injected at wiring, plain-ASCII defaults;
// the old `new CliFormatter()` was dead weight — only the constants were used),
// plus both test suites. outputVerbosity moved DOWN as a pure engine subpath
// (it is the vocabulary of engine log lines; PageExecutionService and the
// NewsCrawler shell keep consuming it downward). Third phantom-path suite
// RESURRECTED: src/__tests__/enhanced-features.test.js had never run
// ('../../src/crawler/PriorityScorer' never existed); 13/13 on first run —
// its null-config expectation only holds BECAUSE of the inert-default
// discharge. Two dead organ-imports deleted from NewsCrawler in passing.
// 292 → 281 (cycle 183, batch 9 — url services + page execution): UrlPolicy,
// UrlEligibilityService (its news-crawler-db edge travels verbatim — the
// engine already declares that module), UrlDecisionService (require-free) and
// PageExecutionService with SEVEN test suites (41 tests, all green
// pre-transit under the new pave-the-road step). PES discharges: the
// priorityConfig disk-read became an injected predicate (default false, the
// c180 QueueManager pattern), near-dead chalk went plain (one debug line),
// and its output-verbosity require went relative. FOUR dead organ-imports
// pruned from NewsCrawler (all four were constructed only in wiring).
// Mixed-line-ending lesson: one file can be CRLF in the head and LF in the
// tail — measure bytes with node before building match needles.
// 281 → 271 (cycle 184, batch 10 — data-layer/intelligence): HubSeeder
// (priority predicate INJECTED — third instance of the c180 pattern; its
// test's PHANTOM jest.mock dissolved with it), TargetedAnalysisRunner,
// placeHubs + hubIdentifier + slugLexicon (whole pure/db-module closure,
// with continents and deep-analyzer riding from outside the count), and
// StructureMiner RETIRED IN PLACE — zero live requires, an old commit-plan
// already called it "long-ghosted"; dead code needs no extraction. En
// route: the placeHubs REAL DEFECT fixed (legacy adapter INSERT hit a
// nonexistent url column and the delegation preferred it; dedup was
// unenforced — no unique index — so an app-level guard now dedups, and the
// schema migration is owner-gated). placeHubs.data.test re-homed to
// src/__tests__ as a cross-boundary integration test after months in the
// known set. hubIdentifier's own test was found ONLY by the post-delete
// scan (relative require, the c171 blind spot) and travelled green 10/10.
// 271 → 258 (cycle 185, batch 11 — infra cluster): BrowserPoolManager (dead),
// ProxyManager, RateLimitTracker, RedownloadCooldownGuard and the rest of the
// 13-file cluster. BANKED LATE, on 2026-08-09 by TECH-ARCHREVIEW-CRAWLER.
// The extraction was real and its own commit message said "engine-debt 258";
// cycle 185's stanza records "258 files" too. Only this constant was left at
// 271, so for five days the ledger and the guard disagreed about the same fact
// and the engine could have grown back by 13 files without the ratchet making
// a sound. A ratchet with slack is not a ratchet. Nothing moved to earn this
// lowering today — it is a bookkeeping correction, not progress.
// 258 → 244 (2026-08-11, first slice after the five-day stall): the whole
// operations/schemas closure — OperationSchemaRegistry, 11 operation schemas,
// common.schema and its check — to news-crawler-itself/operation-schemas.
// Chosen because tools/dev/extraction-endpoint.js measured it as the largest
// fully self-contained unit: 14 files, ZERO out-of-scope requires, and exactly
// one real consumer (src/server/crawl-api/core/crawlService.js). Proven a
// DELEGATION and not a drifted copy by fingerprint diff — every export, every
// per-operation schema/defaults/basic-options hash and every validator result
// identical across the boundary.
// 244 → 226 (2026-08-11, second slice): four leaf closures — healing (5),
// learning (5), coordinator (4), profiler (4) — to news-crawler-itself as
// self-healing, domain-learning, crawl-coordinator and crawl-profiler. All four
// measured fully movable by tools/dev/extraction-endpoint.js, and their ONLY
// consumers were their own tests, which are re-pointed at the package and pass
// 237/237 against the new location.
//
// Worth recording: nothing in production requires any of the four. The single
// non-test mention is JSDoc in metrics/CrawlerMetricsService.js documenting a
// WorkerRegistry/DomainLockManager it accepts by injection — and nothing
// constructs those, so the injection points are unfed. These are built but
// unwired features. That does not change whether they should live in the engine
// package; it is a separate question, recorded rather than acted on.
// 226 → 213 (2026-08-11, third slice): pipeline (4), remote (5, incl. its
// AGENT.md), scheduler (4) — to news-crawler-itself as crawl-pipeline,
// peer-crawl and crawl-scheduler. Unlike the earlier slices these had PRODUCTION
// consumers, re-pointed here: domainProcessingPipeline, IntelligentCrawlServer
// and tools/crawl/peer-server.
//
// Two hazards worth recording. IntelligentCrawlServer's scheduler require sits
// inside a try/catch that only WARNS, so a broken re-point would have left the
// scheduler silently uninitialised — the c188 quiet-fallback class, which a
// green suite cannot see. Proven separately by resolving the specifier from that
// exact file and constructing CrawlScheduler against a real sqlite handle.
// And the scheduler submodules export their class DIRECTLY while the entry
// exports a named bag; re-pointing without destructuring turned 51 tests red.
// The shapes differ per module — check the SUBMODULE, not just the index.
// 213 → 194 (2026-08-11, fourth slice — the first PARTIAL directory): 16 of
// operations, plus sequence (2) and telemetry/CrawlTelemetrySchema.js dragged
// along because the operations needed them. Layout preserved on the far side
// (src/operations, src/sequence, src/telemetry) so the moved files' own
// `../sequence/…` and `../telemetry/…` requires keep resolving untouched.
//
// operations/index.js STAYS and became a call-through: GuessPlaceHubsOperation
// reaches adapters/remoteFetch → fleet-host-resolver and cannot leave, and
// createDefaultOperations() composes it. The parts move; the composition stays
// with the application that composes them — which is DEC-ENGINE-BOUNDARY's
// recommendation applied in miniature. The facade's exported shape is
// byte-for-byte what it was, so no consumer of it changed at all.
//
// EXCLUDED LATE: sequenceContext.js. `movableSet` called it movable because it
// is classed `soft` — its out-of-scope require is on src/db, a target an
// earlier extraction survived. But `soft` only means the dependency CLASS was
// resolvable, never that the require works unchanged after a move, and this one
// wants getDb/openNewsCrawlerDb from the monorepo's own db layer. Pulled back
// rather than forced. A moving set must be checked for `soft` members.
// 194 → 164 (2026-08-11, fifth slice): thirteen small control-primitive
// directories — budget, checkpoint, concurrency, context, retry, progress,
// decisions, plan, strategies, metrics, orchestration, integration, utils — as
// ONE entry, news-crawler-itself/crawl-control, plus puppeteer-detection.
// Twelve of them export 23 names with ZERO collisions (measured before
// merging), so one shim beat thirteen root files; same shape as crawl-infra.js.
// Nothing dragged, nothing soft, nothing HARD in the set.
//
// The slice's real lesson is in tools/dev/checks/delegation-bindings.check.js.
// Re-pointing carried nine UNWRAPPED bindings across — `const X = require(pkg)`
// where pkg exports `{ X, ... }` — and three were production files. That shape
// does not throw at require time, only at first USE, and one of the three sat a
// line above a catch that only warns. Proven the suite cannot see it: the
// binding was re-broken deliberately and both the wiring test and entry-loads
// still passed. The new check found a REAL pre-existing instance from cycle
// 178's own fetch-cluster slice, seven days cold. (Scope correction, same day:
// that instance sits in src/core/crawler/services, which has ZERO non-test
// consumers — the defect class is real, its blast radius was not.)
const CEILING = 164;

function main() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--ceiling');
  const ceiling = i >= 0 ? Number(argv[i + 1]) : CEILING;

  const out = execFileSync('git', ['ls-files', 'src/core/crawler'], { cwd: ROOT, encoding: 'utf8' });
  const files = out.split('\n').filter(Boolean);

  console.log(`engine-debt: ${files.length} crawler-engine files in the monorepo (ceiling ${ceiling})`);
  console.log('             scope: src/core/crawler only — widening is a deliberate ceiling edit');

  if (files.length > ceiling) {
    console.error(`FAIL: engine-debt ${files.length} exceeds ceiling ${ceiling}.`);
    console.error('New engine code belongs in ../news-crawler-itself (module-ecosystem');
    console.error('directive rule 1). If this rise is deliberate, raise CEILING in this');
    console.error('file in the same commit and say why in the ledger row.');
    return 1;
  }
  if (files.length < ceiling) {
    console.log(`NOTE: ${ceiling - files.length} under ceiling — lower CEILING to ${files.length} to bank the progress (the ratchet only ratchets if you turn it).`);
  }
  return 0;
}

process.exit(main());
