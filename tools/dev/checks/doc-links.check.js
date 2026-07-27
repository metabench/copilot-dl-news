#!/usr/bin/env node
'use strict';

/**
 * doc-links.check.js — every markdown link in the LIVING doc corpus resolves (RB-003).
 *
 * WHY ONLY /docs/agi. RB-003 asked which documentation-diffing strategy keeps
 * /docs/agi aligned with the legacy workflow docs. Measuring first (cycle 133's rule)
 * answered it: **no diffing strategy is needed, and one would be actively wrong.**
 *
 *   · 154 legacy docs vs 18 agi docs, and 145/154 (94%) were last touched in 2025.
 *     Most are point-in-time analyses — dated architecture reviews, investigation
 *     write-ups. "Aligning" a record of what was believed in October with today's
 *     code would destroy exactly the thing that makes it worth keeping.
 *   · Actual measured contradiction, once the measurement was fixed: 13 broken links
 *     across 172 documents. 2 of those were in /docs/agi and are now repaired.
 *
 * So the durable claim is "the living corpus resolves", and this is its runnable
 * re-verification. The legacy corpus is deliberately OUT of scope: it is frozen
 * history, and gating on it would generate permanent noise for no benefit.
 *
 * CAUTION EARNED THE HARD WAY (cycle 134): the first version of this measurement
 * counted every backticked token that looked like a filename and reported 982 broken
 * references — a 98.7% false-positive rate, because a bare `cycle-metrics.js` in prose
 * is a mention, not a link assertion, and sibling-repo paths do not resolve here. Only
 * markdown links `[text](path)` assert that a path exists, so only those are checked.
 *
 *   node tools/dev/checks/doc-links.check.js [--json]
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const LIVING_DIR = path.join(ROOT, 'docs', 'agi');

/** Markdown links only, minus anchors/externals — the links that assert a path. */
function extractLinks(markdown) {
  const out = [];
  for (const m of String(markdown).matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = m[1].split('#')[0];
    if (!target || /^https?:|^mailto:|^data:/.test(target)) continue;
    out.push(target);
  }
  return out;
}

function auditDir(dir) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  const broken = [];
  let total = 0;
  for (const f of files) {
    for (const target of extractLinks(fs.readFileSync(path.join(dir, f), 'utf8'))) {
      total++;
      if (!fs.existsSync(path.resolve(dir, target))) broken.push({ doc: f, target });
    }
  }
  return { docs: files.length, links: total, broken };
}

function main() {
  const r = auditDir(LIVING_DIR);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    console.log(`docs/agi: ${r.docs} docs, ${r.links} markdown links, ${r.broken.length} broken`);
    for (const b of r.broken) console.log(`  ❌ ${b.doc} -> ${b.target}`);
  }
  if (r.broken.length) {
    console.log('\n❌ broken link(s) in the living doc corpus — repoint at what exists, or drop the entry.');
    console.log('   (The legacy docs/ corpus is deliberately NOT checked: 94% is frozen point-in-time record.)');
    process.exit(1);
  }
  console.log('\n✅ every markdown link in the living corpus resolves.');
}

module.exports = { extractLinks, auditDir, LIVING_DIR };
if (require.main === module) main();
