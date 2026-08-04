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
const CEILING = 297;

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
