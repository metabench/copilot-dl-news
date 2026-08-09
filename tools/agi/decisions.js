#!/usr/bin/env node
'use strict';

/**
 * decisions.js — read the owner-decision docs as DATA.
 *
 *   node tools/agi/decisions.js            # human summary
 *   node tools/agi/decisions.js --json
 *
 * WHY THIS EXISTS. `docs/decisions/` held twelve write-only documents: cited in
 * code comments, parsed by nothing. Meanwhile the project-status board showed
 * exactly ONE thing under "PLAYER INPUT REQUIRED" — a hardcoded array with a
 * comment saying a manifest should replace it — while five real decisions sat
 * invisible. The improvement loop then stalled for FOUR CONSECUTIVE CYCLES
 * waiting on decisions the board never displayed. That is the measured cost
 * this closes.
 *
 * DECLARED, NOT INFERRED. Each doc carries front-matter. It would have been
 * cheaper to scrape the existing `**Status:**` prose line, and that is exactly
 * what cycle 154 proved wrong for gates: RB-007 and RB-015 carried the same
 * real gate, one rendered clickable and one rendered locked, purely because of
 * which word the author happened to type. Gatedness had to become a DECLARATION
 * before the tree could be trusted. A decision's openness is the same kind of
 * fact, so it is declared in a typed field and never guessed from prose.
 *
 * The document remains the source of truth — this is a projection of it, in the
 * same shape as RESEARCH_BACKLOG.md → tech state. One fact, one field.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DIR = path.join(ROOT, 'docs', 'decisions');

const STATES = new Set(['open', 'answered', 'closed']);

// --- pure core ---------------------------------------------------------------

/**
 * Minimal front-matter reader: a leading `---` block of `key: value` lines,
 * with `[a, b]` inline lists. Deliberately not a YAML engine — a decision
 * record needs five scalar fields and one list, and a real parser would be a
 * dependency plus a surface for surprises.
 *
 * Returns null when the text has no front-matter block at all, so a prose-only
 * document is IGNORED rather than half-read.
 */
function parseFrontMatter(text) {
  const src = String(text || '');
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---\s*(\r?\n|$)/.exec(src);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^\s*([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1];
    let value = kv[2].trim();
    if (/^\[.*\]$/.test(value)) {
      value = value.slice(1, -1).split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    } else {
      value = value.replace(/^['"]|['"]$/g, '');
    }
    out[key] = value;
  }
  return out;
}

/**
 * Validate + normalise one record. Throws on a malformed declaration rather
 * than dropping it: a decision that silently fails to parse is a decision the
 * owner never sees, which is the failure this file exists to end.
 */
function normaliseDecision(fm, file) {
  const id = fm.decision || fm.id;
  if (!id) throw new Error(`${file}: front-matter needs a 'decision' id`);
  const status = String(fm.status || '').toLowerCase();
  if (!STATES.has(status)) {
    throw new Error(`${file}: status must be one of ${[...STATES].join(' | ')}, got ${JSON.stringify(fm.status)}`);
  }
  if (!fm.question) throw new Error(`${file}: front-matter needs a 'question'`);
  return {
    id,
    status,
    question: String(fm.question),
    options: Array.isArray(fm.options) ? fm.options : (fm.options ? [fm.options] : []),
    blocks: Array.isArray(fm.blocks) ? fm.blocks : (fm.blocks ? [fm.blocks] : []),
    answered: fm.answered ? String(fm.answered) : null,
    doc: file
  };
}

/** Only the decisions the owner still has to make. */
function openDecisions(list) {
  return (list || []).filter((d) => d.status === 'open');
}

/** Map of techId -> the open decisions blocking it. */
function blockedTechs(list) {
  const out = new Map();
  for (const d of openDecisions(list)) {
    for (const tech of d.blocks) {
      if (!out.has(tech)) out.set(tech, []);
      out.get(tech).push(d);
    }
  }
  return out;
}

// --- I/O ---------------------------------------------------------------------

function readDecisions(dir = DIR) {
  let files;
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')); } catch (_) { return []; }
  const out = [];
  for (const f of files.sort()) {
    const fm = parseFrontMatter(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (!fm) continue; // prose-only record, not a decision
    out.push(normaliseDecision(fm, `docs/decisions/${f}`));
  }
  return out;
}

function main() {
  const all = readDecisions();
  const open = openDecisions(all);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ total: all.length, open: open.length, decisions: all }, null, 2));
    return;
  }
  console.log(`\n== owner decisions ==`);
  console.log(`${all.length} declared · ${open.length} still OPEN\n`);
  for (const d of open) {
    console.log(`  ${d.id}`);
    console.log(`    ${d.question}`);
    if (d.options.length) console.log(`    options: ${d.options.join(' | ')}`);
    if (d.blocks.length) console.log(`    blocks:  ${d.blocks.join(', ')}`);
    console.log(`    ${d.doc}`);
    console.log('');
  }
  const settled = all.filter((d) => d.status !== 'open');
  if (settled.length) {
    console.log(`  settled: ${settled.map((d) => d.id).join(', ')}`);
  }
  if (!all.length) {
    console.log('  none declared — a decision doc needs front-matter to be counted.');
  }
}

if (require.main === module) main();

module.exports = { parseFrontMatter, normaliseDecision, readDecisions, openDecisions, blockedTechs, DIR };
