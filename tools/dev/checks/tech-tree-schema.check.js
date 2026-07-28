#!/usr/bin/env node
'use strict';

/**
 * tech-tree-schema.check.js — the tech-tree spec builds cleanly (cycle 147; shipped
 * by the FIRST owner-signalled TECH-APPREVIEW run, automation category).
 *
 * buildTechTree already THROWS on a broken record — a phantom edge, a third prereq,
 * an unknown branch, a curated tech claiming completion — but that throw fires at
 * PAGE RENDER time, so a spec broken by an edit would surface only when somebody
 * loads a tech page (as an error line on the page). This probe runs the same build
 * at ORIENT, the same promotion the stanza-schema check made for ledger records:
 * a growing hand-edited JSON file deserves a machine check before anyone reads it.
 */

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const { buildTechTree } = require(path.join(ROOT, 'src', 'ui', 'server', 'projectStatus', 'statusData.js'));
const { parseBacklog } = require(path.join(ROOT, 'tools', 'agi', 'next-prompt.js'));

function main() {
  let tree;
  try {
    const rows = parseBacklog(fs.readFileSync(path.join(ROOT, 'docs', 'agi', 'RESEARCH_BACKLOG.md'), 'utf8'));
    const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'tech-tree.json'), 'utf8'));
    let roadmap = null;
    try { roadmap = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'roadmap.json'), 'utf8')); } catch (_) {}
    tree = buildTechTree(rows, roadmap, spec);
  } catch (e) {
    console.log(`❌ tech-tree spec broken: ${e.message}`);
    console.log('   fix config/tech-tree.json (or the backlog row it references) — the builder refuses to render around a broken record.');
    process.exit(1);
  }
  const counts = tree.branches.map((b) => `${b.key}:${b.roots.length}r/${b.available.length}a`).join(' · ');
  console.log(`✅ tech-tree spec builds: ${tree.branches.length} branches (${counts}), ${tree.absorbed} absorbed.`);
}

if (require.main === module) main();
