#!/usr/bin/env node
'use strict';

/**
 * agi-signal.check.js — surface a clicked big-lightbulb at orient (owner, 2026-07-27).
 *
 * The owner's REQUEST THIS RESEARCH button appends a pending record to
 * data/agi-signals.jsonl. There is no push channel into an agent session, so the
 * click reaches the agent through the two surfaces it provably reads every cycle:
 * this probe (RED while a signal is pending — orient cannot pass until the request
 * is acknowledged) and the generated next-prompt's ⚡ OWNER SIGNAL line.
 *
 * RED here is not breakage — it is the OWNER TALKING. The fix line says exactly
 * what to do: take up the requested research (after tying up loose ends), then
 * `node tools/agi/ack-signal.js <id> "<what was done>"`.
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const { pending } = require(path.join(ROOT, 'src', 'ui', 'server', 'projectStatus', 'signals.js'));

function main() {
  const open = pending();
  if (!open.length) {
    console.log('✅ no pending owner research signals (the big lightbulb has not been clicked).');
    return;
  }
  console.log(`⚡ OWNER RESEARCH SIGNAL${open.length === 1 ? '' : 'S'} PENDING — the big lightbulb was clicked:`);
  for (const s of open) {
    console.log(`   ${s.id}`);
    console.log(`     tech: ${s.tech} · clicked ${s.at}`);
    if (s.requested) console.log(`     requested: ${s.requested}`);
  }
  console.log('\n   → focus the next cycle on the requested research (tie up loose ends first),');
  console.log('     then acknowledge: node tools/agi/ack-signal.js <id> "<what was done>"');
  process.exit(1);
}

if (require.main === module) main();
