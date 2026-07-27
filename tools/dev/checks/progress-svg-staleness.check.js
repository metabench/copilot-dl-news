#!/usr/bin/env node
'use strict';

/**
 * progress-svg-staleness.check.js — the committed progress.svg matches what the
 * current ledger + annotations would render (RB-015).
 *
 * progress-svg.js is DETERMINISTIC by design (no timestamps, no randomness; the
 * data-through date comes from the data), so "is the committed picture current?"
 * is an exact BYTE COMPARE against an in-memory re-render — no tolerance, no
 * heuristics. This is the same check a CI job would run; registering it as an
 * orient probe gives the guarantee locally without waiting for CI wiring.
 *
 * Expected red: mid-cycle, after appending a ledger row and before running
 * `node tools/agi/progress-svg.js`. The close-the-cycle ritual regenerates, so at
 * the NEXT orient this is green — a red here means the ritual was skipped.
 */

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const {
  parseCycleStanzas, computeSeries, renderSvg, loadAnnotations,
  DEFAULT_LEDGER, DEFAULT_OUT, DEFAULT_ANNOTATIONS
} = require(path.join(ROOT, 'tools', 'agi', 'progress-svg.js'));

function main() {
  if (!fs.existsSync(DEFAULT_OUT)) {
    console.log('❌ progress.svg missing — run: node tools/agi/progress-svg.js');
    process.exit(1);
  }
  const { cycles } = parseCycleStanzas(fs.readFileSync(DEFAULT_LEDGER, 'utf8'));
  const expected = renderSvg(computeSeries(cycles), loadAnnotations(DEFAULT_ANNOTATIONS));
  const committed = fs.readFileSync(DEFAULT_OUT, 'utf8');
  if (committed === expected) {
    console.log(`✅ progress.svg is current (${cycles.length} cycles, byte-identical to a fresh render).`);
    return;
  }
  console.log('❌ progress.svg is STALE — the ledger/annotations changed after the last render.');
  console.log(`   committed ${committed.length} bytes vs expected ${expected.length} bytes.`);
  console.log('   Fix: node tools/agi/progress-svg.js   (the close-the-cycle ritual includes this)');
  process.exit(1);
}

if (require.main === module) main();
