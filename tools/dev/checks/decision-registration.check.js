#!/usr/bin/env node
'use strict';

/**
 * decision-registration.check.js — every document in docs/decisions/ declares
 * itself, so none can be invisible to the owner.
 *
 *   node tools/dev/checks/decision-registration.check.js
 *
 * WHY. Decision documents are projected onto the project-status board under
 * PLAYER INPUT REQUIRED. A document without front-matter is not shown there —
 * and for months AGENTS.md described a prose-only ADR format that predates the
 * convention, so a diligent agent could write a decision the owner would never
 * see. Four consecutive improvement cycles once stalled waiting on decisions
 * the board was not displaying.
 *
 * A prose-only record is still legitimate for pure history — it just has to SAY
 * so, with `status: record`. The rule is not "everything is a decision", it is
 * "nothing is invisible by accident".
 *
 * Ceiling is 0 and should stay 0.
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const { unregisteredDocs, readDecisions, openDecisions } = require(path.join(ROOT, 'tools', 'agi', 'decisions.js'));

function main() {
  let decisions;
  try {
    decisions = readDecisions();
  } catch (e) {
    // A malformed declaration THROWS by design — surface it, never swallow it.
    console.error(`decision-registration: a decision doc is malformed — ${e.message}`);
    process.exit(1);
  }

  const orphans = unregisteredDocs();
  const open = openDecisions(decisions);

  console.log(`decision-registration: ${decisions.length} declared · ${open.length} open · ${orphans.length} unregistered`);
  if (open.length) {
    console.log('  OPEN (shown to the owner on the board):');
    for (const d of open) console.log(`    ${d.id} — ${d.question.slice(0, 76)}`);
  }

  if (orphans.length) {
    console.error(`\nFAIL: ${orphans.length} document(s) in docs/decisions/ carry no front-matter and`);
    console.error('are INVISIBLE to the owner. Add a front-matter block, or declare the file');
    console.error('deliberate history with `status: record`. See docs/decisions/README.md.');
    for (const f of orphans) console.error(`  docs/decisions/${f}`);
    process.exit(1);
  }
}

if (require.main === module) main();
