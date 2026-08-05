#!/usr/bin/env node
'use strict';

/**
 * ui-debt.check.js — the ratchet for the UI extraction into news-crawler-ui
 * (owner directive 2026-08-03, founding cycle 168).
 *
 * WHY THIS EXISTS: the 2026-08-03 audit of the module-ecosystem directive found
 * a clean causal split — the one extraction with a probe-enforced monotonic
 * number (news-crawler-db / ncdb-debt) advanced 269→241 and stayed alive, while
 * every extraction that existed only as prose froze within days of scaffolding
 * (six repos, zero commits since 2026-05-19; news-dev-tools: 817 files, zero
 * consumers). A rule without an instrument decays; this file is the instrument.
 *
 * THE NUMBER: git-tracked files under src/ui/ EXCLUDING src/ui/server/projectStatus
 * (the tech-tree board stays in copilot-dl-news — it is the improvement loop's
 * own instrument, coupled to this repo's ledger and probes).
 *
 * Both legal ways DOWN are wins, and both count:
 *   - a UI moves to news-crawler-ui and the monorepo copy is DELETED
 *     (a migration is done when the old thing is gone — cycle 161), or
 *   - a stale UI dir is RETIRED in place (the ~40 dirs untouched since
 *     Jan–May 2026 are retire-not-move by owner scope).
 *
 * Raising the ceiling is deliberate-only (like ncdb-debt): new operational UI
 * belongs in news-crawler-ui, so growth here is a regression by default.
 *
 * Exit 0 = at or under ceiling. Exit 1 = over ceiling (the gate message says
 * which files are new). --ceiling <n> overrides for bite-testing the check.
 */

const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');

// Baseline measured 2026-08-03 (cycle 168): 680 tracked files under src/ui,
// minus 37 in projectStatus. Lower this as extractions/retirements land.
// 643 → 519 (cycle 171): first retirement batch — 21 dead UI surfaces (the
// opsHub cluster, four stale electron apps, orphaned checks/builders), every
// deletion reference-verified against live code first; docsViewer deliberately
// kept (staged by scripts/deploy-remote.js — needs a deploy-aware pass).
// 519 → 497 (cycle 172): owner-scoped second batch — the UNAMBIGUOUS dead only
// (adminDashboard, wysiwyg-demo, roadmapServer, the dangling geoImport
// check/control/client/css). The hand-launchable standalone servers
// (dataExplorer family, templateTeacher, gazetteerInfoServer, factsServer)
// were explicitly KEPT by owner choice for the supervised session — static
// analysis cannot see hand-launches. homeCardData.js was proposed dead and
// RESTORED pre-commit when the dangling scan showed the kept dataExplorer
// family requires it: the scan is part of the deletion, not an afterthought.
// 497 → 488 (cycle 173, the supervised session): crawlStatus + crawlerMonitor
// deleted at PROVEN parity — the console's launcher POST, live ACTIVE flip and
// jobs line were verified in a real browser against a real crawl started
// through the console itself before the old pages died (the c161 rule, done
// with runtime evidence). Their checks and the crawl-status-ssr probe went
// with them; crawl-console-live is the successor tripwire. The same session
// RESTORED hubGuessing (+4): it was a shared library for the floor-protected
// topic/place pages, misclassified as a page by c171's grep (which missed
// relative requires) — the supervised boot was what exposed it. 497 +4 −1
// (colorSelector orphan check) −12 (parity deletions) = 488.
// c208 (owner ruling, ratchet RESUMED after ~40 stalled cycles): 488 → 361.
// The jsgui3 research lab (src/ui/lab, 131 files — a quarter of the whole
// number) moved out to the new sibling repo ../jsgui3-experiments. It was
// never operational UI bound for news-crawler-ui; it is library research,
// and it is the cited evidence base for four SKILL.md files and a dozen
// pattern guides, so deleting it was never an option either. Living docs
// were repointed at the new repo; dated session records were deliberately
// left as historical record. See ../jsgui3-experiments/ORIGIN.md.
const CEILING = 361;

function trackedFiles(prefix) {
  const out = execFileSync('git', ['ls-files', prefix], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}

function main() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--ceiling');
  const ceiling = i >= 0 ? Number(argv[i + 1]) : CEILING;

  const all = trackedFiles('src/ui');
  const stays = new Set(trackedFiles('src/ui/server/projectStatus'));
  const debt = all.filter((f) => !stays.has(f));

  console.log(`ui-debt: ${debt.length} operational-UI files in the monorepo (ceiling ${ceiling})`);
  console.log('         projectStatus excluded (stays by design: the loop\'s own instrument)');

  if (debt.length > ceiling) {
    console.error(`FAIL: ui-debt ${debt.length} exceeds ceiling ${ceiling}.`);
    console.error('New operational UI belongs in ../news-crawler-ui (see its AGENTS.md).');
    console.error('If this rise is deliberate, raise CEILING in this file in the same');
    console.error('commit and say why in the ledger row.');
    return 1;
  }
  if (debt.length < ceiling) {
    console.log(`NOTE: ${ceiling - debt.length} under ceiling — lower CEILING to ${debt.length} to bank the progress (the ratchet only ratchets if you turn it).`);
  }
  return 0;
}

process.exit(main());
