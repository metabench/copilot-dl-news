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
  onCompletion: 'ledger row + stanza (owed/owed_closed as applicable) · node tools/agi/repo-activity.js && node tools/agi/progress-svg.js · commit + push · regenerate this prompt (node tools/agi/next-prompt.js, then curate the ▶ selection).'
};

/**
 * Slug -> prose. Kebab/snake slugs are the loop's own words, so the job is mostly
 * separator swapping — but identifiers must survive it: `RB_008` reads as a broken
 * word once the underscore becomes a space, and an all-caps token (NO-GO, SSR) is
 * meaning, not shouting. v1 flattened both.
 */
function humanize(s) {
  const raw = String(s || '').trim();
  if (!raw) return '';
  const words = raw.split(/[-_+\s]+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i], next = words[i + 1];
    if (/^RB$/i.test(w) && /^\d{2,3}$/.test(next || '')) { out.push(`RB-${next}`); i++; continue; }
    if (/^c$/i.test(w) && /^\d{1,4}$/.test(next || '')) { out.push(`c${next}`); i++; continue; }
    out.push(w);
  }
  return out.join(' ');
}

/** Backlog states an agent may still pick up, vs states that are finished/parked. */
const ACTIONABLE_STATES = new Set(['open', 'partial']);
const KNOWN_STATES = new Set([...ACTIONABLE_STATES, 'blocked', 'done', 'superseded']);

/**
 * RESEARCH_BACKLOG.md rows, read from the `state` COLUMN rather than sniffed from
 * status prose. v1 tested the status text for /delivered|superseded/ with a
 * `remaining` escape hatch, so any answered row that honestly named its remainder
 * (RB-008, RB-011, RB-015) was re-offered as if untouched. A row's state is a fact
 * about the row; it belongs in a field.
 *
 * An unrecognised or missing state THROWS rather than defaulting to open — a filter
 * that silently treats unknown input as actionable is the same false-green class as
 * the c128 porcelain bug.
 */
function parseBacklog(markdown) {
  const rows = [];
  for (const line of String(markdown).split('\n')) {
    const m = /^\|\s*(RB-\d+)\s*\|\s*([^|]*)\|\s*([^|]+)\|[^|]*\|\s*([^|]+)\|\s*[^|]*\|\s*([^|]*)\|/.exec(line);
    if (!m) continue;
    const [, id, stateRaw, question, status, lastUpdate] = m;
    const state = stateRaw.trim().toLowerCase();
    if (!KNOWN_STATES.has(state)) {
      throw new Error(`${id}: unknown backlog state ${JSON.stringify(stateRaw.trim())} — expected one of ${[...KNOWN_STATES].join('/')}`);
    }
    // lastUpdate feeds the tech tree's roots-vs-grown split (cycle 137): rows
    // completed before the tree existed are roots and are not displayed.
    rows.push({ id, state, question: question.trim(), status: status.trim(), lastUpdate: lastUpdate.trim() });
  }
  return rows;
}

/** The `Remaining: ...` clause a partial row must carry, so the ▶ line names real work. */
function remainderOf(status) {
  const m = /Remaining:\s*([^|]+?)\s*$/.exec(String(status || ''));
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

/**
 * Candidates for the ▶ list: actionable rows only. A `partial` row is offered by its
 * REMAINDER, not its original question — "can we implement compliance tests?" is
 * answered and re-reading it wastes the reader's attention; "session-init and
 * per-turn directives are still unchecked" is the actual next step.
 */
function backlogCandidates(markdown) {
  return parseBacklog(markdown)
    .filter((r) => ACTIONABLE_STATES.has(r.state))
    .map((r) => {
      const remainder = r.state === 'partial' ? remainderOf(r.status) : null;
      return {
        id: r.id,
        state: r.state,
        text: remainder || r.question,
        isRemainder: Boolean(remainder),
        // A partial row with no Remaining: clause cannot say what is left — flag it
        // rather than quietly offering the answered question again.
        needsRemainder: r.state === 'partial' && !remainder
      };
    });
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
    // `headline` is the cycle's own sentence; the slug is a fallback. A generator
    // that can only echo slugs makes the loop write slugs that read like prose.
    done: cycles.slice(-DONE_LINES).map((c) => ({
      id: c.id,
      label: (typeof c.headline === 'string' && c.headline.trim()) || humanize(c.result || 'cycle logged')
    })),
    owed: (status && status.sideQuests) || [],
    decisions: (status && status.playerInput) || [],
    method: collectMethod(cycles),
    options: backlogCandidates(backlogText)
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
  L.push('  ▶ Pick ONE — [CURATE: selection is judgment; candidates = backlog rows in state open/partial]');
  for (const o of m.options) {
    const flag = o.needsRemainder ? ' [PARTIAL row with no "Remaining:" clause — say what is left]' : '';
    L.push(`     ${o.id} (${o.state})${o.isRemainder ? ' remaining' : ''}: ${o.text}${flag}`);
  }
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

module.exports = {
  humanize, parseBacklog, remainderOf, backlogCandidates, collectMethod, buildPromptModel, render,
  ACTIONABLE_STATES, KNOWN_STATES
};
if (require.main === module) main();
