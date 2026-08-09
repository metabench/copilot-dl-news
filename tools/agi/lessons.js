#!/usr/bin/env node
'use strict';

/**
 * lessons.js — surface the judgement the loop accumulated.
 *
 *   node tools/agi/lessons.js                 # every lesson, newest first
 *   node tools/agi/lessons.js --search sample # only those matching
 *   node tools/agi/lessons.js --repeats       # lessons learned MORE THAN ONCE
 *   node tools/agi/lessons.js --json
 *
 * WHY. Each cycle stanza carries a `second_order` list — the lesson that cycle
 * paid for. There are hundreds of them in IMPROVEMENT_LEDGER.md, schema-validated
 * and completely invisible: the status board renders counts, the SVG renders
 * lines, and the most durable output of the whole exercise is readable only by
 * grepping a 200-row markdown table.
 *
 * TWO FIELDS, TWO MEANINGS — and the first version of this tool used the wrong
 * one. `second_order` is the lesson a cycle LEARNED; `reused` is a lesson it
 * APPLIED again. Grouping second_order by exact text reported 639 lessons, 639
 * distinct, zero repeats — a suspiciously perfect answer, and wrong, because
 * every cycle phrases its new lesson slightly differently. The repetition
 * signal was designed in from the start and lives in `reused`: measure-dont-infer
 * has been re-applied 32 times, park-with-diagnosis 14.
 *
 * So `--applied` answers the question the loop's own audit skill asks — which
 * judgement actually carries forward, versus which was written down once and
 * never used again. A lesson learned and never reused is a lesson that did not
 * stick.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const LEDGER = path.join(ROOT, 'docs', 'agi', 'IMPROVEMENT_LEDGER.md');

// --- pure core ---------------------------------------------------------------

/**
 * [{ id, date, lesson }] — one entry per lesson per cycle, newest first.
 * `field` selects which list: 'second_order' (learned) or 'reused' (applied).
 */
function extractLessons(ledgerText, field = 'second_order') {
  const out = [];
  for (const m of String(ledgerText || '').matchAll(/<!-- cycle:(\{[\s\S]*?\}) -->/g)) {
    let s;
    // Reviewed swallow: a stanza that will not parse is already reported by the
    // stanza-schema probe, which is the instrument for that. Throwing here
    // would make one bad record hide every lesson in the ledger.
    try { s = JSON.parse(m[1]); } catch (_) { continue; }
    for (const lesson of s[field] || []) {
      if (typeof lesson === 'string' && lesson.trim()) {
        out.push({ id: s.id, date: s.date || '', lesson: lesson.trim() });
      }
    }
  }
  return out.sort((a, b) => (b.id || 0) - (a.id || 0));
}

/**
 * Group by lesson text. A lesson appearing in more than one cycle is one the
 * system had to relearn — which is the finding, not the noise.
 */
function groupLessons(entries) {
  const by = new Map();
  for (const e of entries) {
    if (!by.has(e.lesson)) by.set(e.lesson, []);
    by.get(e.lesson).push(e);
  }
  return [...by.entries()]
    .map(([lesson, cycles]) => ({ lesson, count: cycles.length, cycles: cycles.map((c) => c.id) }))
    .sort((a, b) => (b.count - a.count) || (b.cycles[0] - a.cycles[0]));
}

function humanize(slug) {
  return String(slug).replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
}

// --- I/O ---------------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);
  const entries = extractLessons(fs.readFileSync(LEDGER, 'utf8'));
  const grouped = groupLessons(entries);

  if (argv.includes('--json')) {
    console.log(JSON.stringify({ total: entries.length, distinct: grouped.length, lessons: grouped }, null, 2));
    return;
  }

  const si = argv.indexOf('--search');
  if (si >= 0) {
    const q = String(argv[si + 1] || '').toLowerCase();
    const hits = grouped.filter((g) => g.lesson.toLowerCase().includes(q));
    console.log(`\n${hits.length} lesson(s) matching ${JSON.stringify(q)}:\n`);
    for (const g of hits) console.log(`  [c${g.cycles.join(', c')}]  ${humanize(g.lesson)}`);
    return;
  }

  if (argv.includes('--applied') || argv.includes('--repeats')) {
    // `reused`, not `second_order` — see the header. This is the judgement that
    // actually carried forward.
    const applied = groupLessons(extractLessons(fs.readFileSync(LEDGER, 'utf8'), 'reused'));
    const carried = applied.filter((g) => g.count > 1);
    console.log(`\n== judgement that carried forward ==`);
    console.log(`${applied.length} distinct lessons re-applied; ${carried.length} in more than one cycle.\n`);
    for (const g of carried.slice(0, 40)) {
      console.log(`  ${String(g.count).padStart(3)}x  ${humanize(g.lesson)}`);
    }
    const once = applied.length - carried.length;
    if (once) console.log(`\n  ${once} more were re-applied exactly once.`);
    console.log(`\n  ${grouped.length} lessons were LEARNED (second_order). A lesson learned but`);
    console.log('  never re-applied is one that did not stick — compare the two lists.');
    return;
  }

  console.log(`\n== accumulated lessons ==`);
  console.log(`${entries.length} recorded across the ledger · ${grouped.length} distinct\n`);
  for (const g of grouped.slice(0, 60)) {
    const tag = g.count > 1 ? ` (${g.count}x)` : '';
    console.log(`  c${g.cycles[0]}${tag}  ${humanize(g.lesson)}`);
  }
  if (grouped.length > 60) console.log(`\n  … and ${grouped.length - 60} more — use --search or --json`);
}

if (require.main === module) main();

module.exports = { extractLessons, groupLessons };
