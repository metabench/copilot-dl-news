#!/usr/bin/env node
'use strict';

/**
 * stanza-schema.check.js — every `<!-- cycle:{...} -->` stanza in the ledger parses
 * AND carries well-typed fields (RB-015). The stanza is the loop's only act of
 * record-keeping — the SVG, the status page and the next-prompt generator are all
 * projections of it — so a silently malformed or mistyped stanza corrupts every
 * downstream view at once.
 *
 * Context: "2 malformed stanzas" were reported for several cycles; they turned out
 * to be the PARSER matching documentation placeholders (`cycle:{...}` named in row
 * prose), not broken records. The parser now skips placeholders; this check makes
 * "everything else parses and validates" a probe instead of an assumption.
 *
 * Lenient by design: only `id` and `date` are required (early stanzas predate later
 * fields); every OPTIONAL field is type-checked when present.
 */

const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const { parseCycleStanzas, DEFAULT_LEDGER } = require(path.join(ROOT, 'tools', 'agi', 'progress-svg.js'));

const isStrArray = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');

/** @returns string[] violations (empty = valid) */
function validateStanza(c) {
  const bad = [];
  if (!Number.isFinite(c.id)) bad.push('id must be a number');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(c.date || ''))) bad.push('date must be YYYY-MM-DD');
  if (c.verified_improvements !== undefined && !Number.isFinite(c.verified_improvements)) bad.push('verified_improvements must be a number');
  if (c.cost_turns !== undefined && !Number.isFinite(c.cost_turns)) bad.push('cost_turns must be a number');
  if (c.ncdb_debt !== undefined && !Number.isFinite(c.ncdb_debt)) bad.push('ncdb_debt must be a number');
  if (c.pages_crawled !== undefined && !Number.isFinite(c.pages_crawled)) bad.push('pages_crawled must be a number');
  if (c.defects !== undefined) {
    if (!Array.isArray(c.defects)) bad.push('defects must be an array');
    else for (const d of c.defects) {
      if (!d || typeof d !== 'object') { bad.push('defects entries must be objects'); break; }
      if (d.preship !== undefined && typeof d.preship !== 'boolean') { bad.push('defects[].preship must be boolean'); break; }
    }
  }
  for (const k of ['second_order', 'scaffold_added', 'scaffold_retired', 'verification', 'tracks', 'owed', 'owed_closed', 'reused']) {
    if (c[k] !== undefined && !isStrArray(c[k])) bad.push(`${k} must be an array of strings`);
  }
  // `headline` is the cycle's own sentence for its PROGRESS line (next-prompt v2
  // prefers it over humanizing the result slug); `result`/`id_note` are prose too.
  for (const k of ['headline', 'result', 'id_note', 'model']) {
    if (c[k] !== undefined && typeof c[k] !== 'string') bad.push(`${k} must be a string`);
  }
  return bad;
}

function main() {
  const text = fs.readFileSync(DEFAULT_LEDGER, 'utf8');
  const { cycles, skipped } = parseCycleStanzas(text);
  let failures = 0;
  if (skipped > 0) {
    failures += skipped;
    console.log(`❌ ${skipped} stanza(s) fail to PARSE (placeholders are already excluded — these are real breakage).`);
  }
  const ids = new Set();
  for (const c of cycles) {
    const bad = validateStanza(c);
    if (Number.isFinite(c.id)) {
      if (ids.has(c.id)) bad.push('duplicate cycle id');
      ids.add(c.id);
    }
    if (bad.length) {
      failures++;
      console.log(`❌ stanza id=${c.id ?? '?'} (${c.date ?? 'no date'}): ${bad.join(' · ')}`);
    }
  }
  if (failures) {
    console.log(`\n❌ stanza schema: ${failures} problem(s) across ${cycles.length} stanzas — fix the ledger record, not the consumers.`);
    process.exit(1);
  }
  console.log(`✅ stanza schema: ${cycles.length} stanzas parse and validate (placeholders excluded by the parser).`);
}

module.exports = { validateStanza };
if (require.main === module) main();
