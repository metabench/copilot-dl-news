#!/usr/bin/env node
'use strict';

/**
 * config-fallbacks.check.js — fallbacks need probes, not console lines
 * (the cycle-188 lesson made structural; DEBT plan follow-through).
 *
 * WHY: CategoryClassifier's config path was one directory short, so its
 * ENOENT fallback (35 of 780 keywords, 0 of 49 phrases) served PRODUCTION
 * silently for months — it warned on every construction, into logs nobody
 * watches. A fallback that degrades quietly is a defect with a delay timer.
 *
 * This check CONSTRUCTS the components that carry file-config fallbacks and
 * asserts the REAL config loaded, so the degraded mode can never again pass
 * for healthy at orient time. Add an entry per fallback-carrying component.
 *
 * Exit 0 = every component loaded its real config. Exit 1 = something is
 * running degraded RIGHT NOW.
 */

const path = require('path');

const CHECKS = [
  {
    name: 'CategoryClassifier keyword base',
    run: () => {
      const { CategoryClassifier } = require(path.join(__dirname, '..', '..', '..', 'src', 'intelligence', 'analysis', 'tagging', 'CategoryClassifier.js'));
      const c = new CategoryClassifier();
      const stats = c.getStats();
      // Real base measured c188: 780 single keywords, 49 phrases. The ENOENT
      // fallback carries 35/0. Thresholds sit far above fallback, safely
      // below real, so config edits do not flap the probe.
      if (stats.phrases < 10) return `phrases=${stats.phrases} — the ENOENT fallback is serving again`;
      if (stats.singleKeywords < 100) return `singleKeywords=${stats.singleKeywords} — fallback base detected`;
      return null;
    }
  }
];

function main() {
  const failures = [];
  for (const check of CHECKS) {
    let problem = null;
    try {
      problem = check.run();
    } catch (error) {
      problem = `threw: ${error.message}`;
    }
    if (problem) failures.push(`${check.name}: ${problem}`);
  }
  console.log(`config-fallbacks: ${CHECKS.length - failures.length}/${CHECKS.length} components loaded their REAL config`);
  if (failures.length) {
    console.error('FAIL: running in degraded fallback mode RIGHT NOW:');
    for (const f of failures) console.error('  ' + f);
    return 1;
  }
  return 0;
}

process.exit(main());
