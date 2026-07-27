#!/usr/bin/env node
'use strict';

/**
 * next-prompt.js — generate the next cycle's recursive prompt from the loop's own
 * substrate (RB-014; owner development goal 2026-07-27: "generate prompts to give
 * it for the next turn").
 *
 * The grammar is the one distilled in CAPABILITY_RESEARCH_2026-07-27.md §3 from 30+
 * hand-regenerated cycles. What is DERIVED vs CURATED is explicit:
 *
 *   DERIVED from data (cannot drift from the page/SVG — same sources):
 *     PROGRESS ✅ lines        <- last K cycle stanzas (id + humanized result)
 *     FOLLOW-UPS OWED          <- statusData.buildStatus() (owed minus owed_closed)
 *     OWNER DECISIONS STANDING <- statusData.buildStatus().playerInput
 *     METHOD (earned)          <- second_order[] slugs from recent stanzas, deduped,
 *                                 newest-first, capped (rules exist only where a real
 *                                 mistake produced them — the slugs ARE those records)
 *     ▶ candidate options      <- RESEARCH_BACKLOG.md rows whose status is open-ish
 *
 *   CURATED (judgment, marked in the output):
 *     which option to actually pick next, and any workstream-specific REFERENCE lines.
 *
 * The output is a STARTING POINT that is honest about that split — the ▶ section is
 * labelled as requiring selection, not pretending the tool chose.
 *
 *   node tools/agi/next-prompt.js                # print to stdout
 *   node tools/agi/next-prompt.js --out docs/agi/NEXT_PROMPT.md
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const { parseCycleStanzas } = require(path.join(ROOT, 'tools', 'agi', 'progress-svg.js'));

const METHOD_CAP = 10;   // research doc §3: cap, then consolidate into LESSONS/memory
const DONE_LINES = 4;
const METHOD_WINDOW = 8; // cycles to harvest second_order from

// Stable ritual/config lines. Curated here deliberately (v1): they change rarely and
// only by owner/agent decision, not by data.
const STATIC = {
  workstream: 'AGI-WORKFLOW — copilot-dl-news ecosystem',
  reference: 'CAPABILITY_RESEARCH_2026-07-27.md · repo-scope.json · progress-svg.js · projectStatus page v2 (launch: project-status, :3184 — /api/status, /progress.svg)',
  orient: 'node tools/dev/run-probes.js — expect green except bridge-health (environmental) · frontier-api skips when :3170 down.',
  gated: 'live news.db writes · backups · Defender · politeness · concurrency >3 · hooks.',
  onCompletion: 'ledger row + stanza (owed/owed_closed as applicable) · node tools/agi/progress-svg.js · commit + push · regenerate this prompt (node tools/agi/next-prompt.js, then curate the ▶ selection).'
};

const humanize = (s) => String(s || '').replace(/[-_+]/g, ' ').replace(/\s+/g, ' ').trim();

/** RESEARCH_BACKLOG.md table rows whose status is not delivered/superseded. */
function parseOpenBacklog(markdown) {
  const open = [];
  for (const line of String(markdown).split('\n')) {
    const m = /^\|\s*(RB-\d+)\s*\|\s*([^|]+)\|[^|]*\|\s*([^|]+)\|/.exec(line);
    if (!m) continue;
    const [, id, question, status] = m;
    if (/delivered|superseded/i.test(status) && !/v2 items open|remaining/i.test(status)) continue;
    open.push({ id, question: question.trim().slice(0, 110), status: status.trim().slice(0, 60) });
  }
  return open;
}

/** Newest-first, deduped, capped METHOD lines from recent stanzas' second_order[]. */
function collectMethod(cycles, windowN = METHOD_WINDOW, cap = METHOD_CAP) {
  const seen = new Set();
  const out = [];
  for (const c of cycles.slice(-windowN).reverse()) {
    for (const slug of (Array.isArray(c.second_order) ? c.second_order : [])) {
      const line = humanize(slug);
      const key = line.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(line);
      if (out.length >= cap) return out;
    }
  }
  return out;
}

function buildPromptModel({ cycles, status, backlogText }) {
  const latest = cycles[cycles.length - 1] || {};
  return {
    nextAfter: latest.id || 0,
    dataThrough: latest.date || '',
    done: cycles.slice(-DONE_LINES).map((c) => ({ id: c.id, label: humanize(c.result || 'cycle logged') })),
    owed: (status && status.sideQuests) || [],
    decisions: (status && status.playerInput) || [],
    method: collectMethod(cycles),
    options: parseOpenBacklog(backlogText)
  };
}

function render(m) {
  const L = [];
  L.push(`${STATIC.workstream} · next cycle (after ledger c${m.nextAfter}, data through ${m.dataThrough})`);
  L.push('');
  L.push(`REFERENCE  ${STATIC.reference}`);
  L.push(`ORIENT  ${STATIC.orient}`);
  L.push('PROGRESS');
  for (const d of m.done) L.push(`  ✅ c${d.id} ${d.label}`);
  if (m.owed.length) {
    L.push('  OWED (from stanzas, closures applied):');
    for (const o of m.owed) L.push(`  ⚠ ${o.label} (from cycle ${o.cycle})`);
  }
  L.push('  ▶ Pick ONE — [CURATE: selection is judgment; candidates from the open backlog]');
  for (const o of m.options) L.push(`     ${o.id}: ${o.question} [${o.status}]`);
  L.push(`OWNER DECISIONS STANDING  ${m.decisions.join(' · ') || 'none recorded'}`);
  L.push('METHOD (earned — from recent cycle stanzas, newest first)');
  for (const line of m.method) L.push(`  • ${line}`);
  L.push(`GATED  ${STATIC.gated}`);
  L.push(`ON COMPLETION  ${STATIC.onCompletion}`);
  return L.join('\n');
}

function main() {
  // Reuse the SAME assembled state the status page serves — one source of truth for
  // owed/decisions (buildStatus applies owed_closed), per the no-drift rule.
  const { buildStatus } = require(path.join(ROOT, 'src', 'ui', 'server', 'projectStatus', 'statusData.js'));
  const ledger = fs.readFileSync(path.join(ROOT, 'docs', 'agi', 'IMPROVEMENT_LEDGER.md'), 'utf8');
  const backlogText = fs.readFileSync(path.join(ROOT, 'docs', 'agi', 'RESEARCH_BACKLOG.md'), 'utf8');
  const { cycles } = parseCycleStanzas(ledger);
  const model = buildPromptModel({ cycles, status: buildStatus(), backlogText });
  const text = render(model);

  const i = process.argv.indexOf('--out');
  if (i >= 0 && process.argv[i + 1]) {
    const out = path.resolve(process.argv[i + 1]);
    fs.writeFileSync(out, text + '\n');
    console.log(`wrote ${path.relative(ROOT, out)}`);
  } else {
    console.log(text);
  }
}

module.exports = { parseOpenBacklog, collectMethod, buildPromptModel, render };
if (require.main === module) main();
