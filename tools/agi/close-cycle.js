#!/usr/bin/env node
'use strict';

/**
 * close-cycle.js — WRITE a cycle record, then regenerate everything derived
 * from it.
 *
 *   node tools/agi/close-cycle.js --input tmp/cycle.json
 *   node tools/agi/close-cycle.js --input tmp/cycle.json --dry-run
 *
 * WHY THIS EXISTS. Every tool in tools/agi READS the ledger — cycle-metrics,
 * next-prompt, progress-svg. Until now NOTHING wrote it. All 192 stanzas were
 * produced by an agent hand-writing a throwaway script, re-deriving the same
 * boundary checks each time. Cycle 128's audit measured the cost of that: 77 of
 * 84 stanzas landed a day or more after their ledger date, because the closing
 * steps were remembered rather than mechanical, and the drift stayed invisible
 * for seventy-five cycles until the owner noticed.
 *
 * `ritual-compliance` was built to DETECT that. This exists to prevent it.
 *
 * WHAT IT DOES NOT DO: commit. The commit message is judgement — what was
 * verified, what was refused, what turned out wrong — and a tool that wrote it
 * would write something plausible instead of something true. It prints the
 * remaining steps and stops.
 *
 * INPUT: a JSON file with { "row": "| 2026-08-07 | … |", "stanza": { … } }.
 * The row is the human record; the stanza is the machine record every
 * projection reads.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const LEDGER = path.join(ROOT, 'docs', 'agi', 'IMPROVEMENT_LEDGER.md');

// --- pure core ---------------------------------------------------------------

/**
 * Every boundary check the hand-written scripts re-derived each cycle, in one
 * place. Throws with a specific reason rather than returning false: a refusal
 * the author has to read is the point.
 */
function assertAppendable(ledgerText, stanza) {
  if (!stanza || typeof stanza !== 'object') throw new Error('stanza must be an object');
  const id = Number(stanza.id);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`stanza.id must be a positive integer, got ${JSON.stringify(stanza.id)}`);
  if (!stanza.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(stanza.date))) {
    throw new Error(`stanza.date must be YYYY-MM-DD, got ${JSON.stringify(stanza.date)}`);
  }
  if (ledgerText.includes(`"id":${id}`)) {
    throw new Error(`stanza id ${id} is already in the ledger — refusing to write a duplicate`);
  }
  // The previous id must exist, so a cycle cannot be appended into a gap or
  // onto the wrong tail (both happened while doing this by hand).
  if (!ledgerText.includes(`"id":${id - 1}`)) {
    throw new Error(`stanza id ${id - 1} is not in the ledger — refusing to append ${id} into a gap`);
  }
  return true;
}

/** Append row + stanza, preserving the file's existing line endings. */
function appendRecord(ledgerText, row, stanza) {
  const EOL = ledgerText.includes('\r\n') ? '\r\n' : '\n';
  const rowLine = String(row).trim();
  if (!rowLine.startsWith('|') || !rowLine.endsWith('|')) {
    throw new Error('row must be a markdown table row: start and end with "|"');
  }
  const stanzaLine = `<!-- cycle:${JSON.stringify(stanza)} -->`;
  let out = ledgerText;
  if (!out.endsWith(EOL)) out += EOL;
  out += rowLine + EOL + stanzaLine + EOL;
  const grew = out.length - ledgerText.length;
  if (grew < 200) throw new Error(`append grew the ledger by only ${grew} chars — that is not a cycle record`);
  return { text: out, grew };
}

// --- I/O ---------------------------------------------------------------------

function run(label, args) {
  try {
    const out = execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
    const last = out.trim().split(/\r?\n/).pop();
    console.log(`  ✓ ${label}: ${last}`);
    return true;
  } catch (e) {
    console.error(`  ✗ ${label} FAILED: ${String(e.stdout || e.message).trim().split(/\r?\n/).pop()}`);
    return false;
  }
}

function main() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--input');
  if (i < 0) {
    console.error('usage: node tools/agi/close-cycle.js --input <file.json> [--dry-run]');
    process.exit(2);
  }
  const dryRun = argv.includes('--dry-run');
  const input = JSON.parse(fs.readFileSync(path.resolve(ROOT, argv[i + 1]), 'utf8'));
  const { row, stanza } = input;
  if (!row || !stanza) throw new Error('input needs both "row" and "stanza"');

  const before = fs.readFileSync(LEDGER, 'utf8');
  assertAppendable(before, stanza);
  const { text, grew } = appendRecord(before, row, stanza);

  console.log(`\n== closing cycle ${stanza.id} (${stanza.date}) ==`);
  if (dryRun) {
    console.log(`  would append ${grew} chars to docs/agi/IMPROVEMENT_LEDGER.md — dry run, nothing written`);
    return;
  }

  fs.writeFileSync(LEDGER, text);
  console.log(`  ✓ ledger: appended ${grew} chars`);

  const ok = [
    run('stanza-schema', [path.join(ROOT, 'tools', 'dev', 'checks', 'stanza-schema.check.js')]),
    run('repo-activity', [path.join(ROOT, 'tools', 'agi', 'repo-activity.js')]),
    run('progress-svg', [path.join(ROOT, 'tools', 'agi', 'progress-svg.js')])
  ].every(Boolean);

  console.log('\n  remaining, and deliberately NOT automated:');
  console.log('    git add -A && git commit   — the message is judgement, not a template');
  console.log('    git push');
  if (!ok) {
    console.error('\n  a regeneration step failed — fix it BEFORE committing, or the');
    console.error('  progress-svg-staleness probe will be red at the next orient.');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { assertAppendable, appendRecord };
