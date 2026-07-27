#!/usr/bin/env node
'use strict';

/**
 * ack-signal.js — acknowledge an owner research signal (the big lightbulb).
 *
 * Run by the AGENT when it takes up (or has finished taking up) the requested
 * research. Appends a superseding 'done' record — the queue is append-only, so
 * the click and its answer both stay on file until the OS file rotates.
 *
 *   node tools/agi/ack-signal.js                       # list pending
 *   node tools/agi/ack-signal.js <id> "<what was done>"
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { pending, ack } = require(path.join(ROOT, 'src', 'ui', 'server', 'projectStatus', 'signals.js'));

function main() {
  const [id, ...noteParts] = process.argv.slice(2);
  if (!id) {
    const open = pending();
    if (!open.length) { console.log('no pending signals.'); return; }
    for (const s of open) console.log(`${s.id}  tech=${s.tech}  clicked=${s.at}`);
    return;
  }
  const note = noteParts.join(' ').trim();
  if (!note) { console.error('an acknowledgement needs a note: what was actually done?'); process.exit(2); }
  const rec = ack(id, note);
  console.log(`acknowledged ${id} at ${rec.ackAt}: ${note}`);
}

main();
