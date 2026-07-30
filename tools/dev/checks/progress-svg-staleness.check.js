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
  parseCycleStanzas, computeSeries, renderSvg, loadAnnotations, loadRepoActivity, loadTechFrontier,
  DEFAULT_LEDGER, DEFAULT_OUT, DEFAULT_ANNOTATIONS, DEFAULT_ACTIVITY,
  DEFAULT_TECH_SPEC, DEFAULT_BACKLOG, DEFAULT_ROADMAP
} = require(path.join(ROOT, 'tools', 'agi', 'progress-svg.js'));

function main() {
  if (!fs.existsSync(DEFAULT_OUT)) {
    console.log('❌ progress.svg missing — run: node tools/agi/progress-svg.js');
    process.exit(1);
  }
  const { cycles } = parseCycleStanzas(fs.readFileSync(DEFAULT_LEDGER, 'utf8'));
  // CRLF-normalize both sides: git autocrlf may rewrite the working-copy SVG's
  // line endings on checkout, which is not staleness. Any content change still differs.
  const norm = (s) => s.replace(/\r\n/g, '\n');
  // every input is a COMMITTED file — the repo-activity snapshot keeps live git
  // state out of the render (see tools/agi/repo-activity.js), preserving determinism.
  // This call must pass EVERY render input the CLI passes: cycle 156 added the
  // frontier band and omitting it here made the probe fail against a correct
  // picture (the probe's own render, not the artifact, was stale).
  const expected = norm(renderSvg(
    computeSeries(cycles),
    loadAnnotations(DEFAULT_ANNOTATIONS),
    loadRepoActivity(DEFAULT_ACTIVITY),
    loadTechFrontier(DEFAULT_TECH_SPEC, DEFAULT_BACKLOG, DEFAULT_ROADMAP)
  ));
  const committed = norm(fs.readFileSync(DEFAULT_OUT, 'utf8'));
  if (committed === expected) {
    console.log(`✅ progress.svg is current (${cycles.length} cycles, byte-identical to a fresh render).`);
    return;
  }
  console.log('❌ progress.svg is STALE — the ledger/annotations changed after the last render.');
  console.log(`   committed ${committed.length} bytes vs expected ${expected.length} bytes.`);
  console.log('   Fix: node tools/agi/repo-activity.js && node tools/agi/progress-svg.js   (the close-the-cycle ritual includes this)');
  process.exit(1);
}

if (require.main === module) main();
