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
 * KNOWN CONSTRAINT for future slices: config/gated-surfaces.json's politeness
 * gate points INTO this tree (src/core/crawler/DomainThrottleManager.js
 * requiredPatterns). Any slice that moves that file must move the gate config
 * in the SAME commit, owner-visibly — the 429-backoff escalation is never
 * weakened, and never left unwatched.
 *
 * Exit 0 = at or under ceiling. Exit 1 = over. --ceiling <n> for bite tests.
 */

const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');

// Baseline measured 2026-08-04 (cycle 174): 365 tracked files (252 source +
// 113 tests). Lower as delegations/retirements land; raise deliberate-only.
const CEILING = 365;

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
