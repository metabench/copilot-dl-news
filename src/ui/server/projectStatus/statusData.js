'use strict';

/**
 * statusData.js — assemble the project-status "game state" from data the loop
 * already emits. SERVER-ONLY (fs + git via execSync): never require this from
 * controls.js, or the browser bundle breaks.
 *
 * Sources, all pre-existing substrate (nothing new to maintain):
 *   - IMPROVEMENT_LEDGER.md cycle stanzas  (via tools/agi/progress-svg.js exports)
 *   - config/repo-scope.json + check-repo-scope's checkEntry (party roster + condition)
 *   - docs/agi/progress/annotations.json   (milestones -> achievement badges)
 *
 * Game-UI mapping (visual conventions only; plain engineering vocabulary per owner):
 *   improvements -> XP/level · modules -> party members · latest cycle -> main quest ·
 *   owed items -> side quests · owner decisions -> "PLAYER INPUT REQUIRED" ·
 *   totals + annotations -> achievements. The unversioned engine renders as the
 *   genre's classic hazard: progress with no save file.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const { parseCycleStanzas, computeSeries } = require(path.join(ROOT, 'tools', 'agi', 'progress-svg.js'));
const { checkEntry } = require(path.join(ROOT, 'tools', 'dev', 'check-repo-scope.js'));
// Safe to require at module level: next-prompt only lazy-requires THIS file inside
// its main(), so there is no circular-require at load time. Reusing its parser keeps
// the tech tree and the ▶ candidate list projections of the SAME backlog read.
const { parseBacklog, remainderOf } = require(path.join(ROOT, 'tools', 'agi', 'next-prompt.js'));

const XP_PER_LEVEL = 10; // improvement-count milestone size for the header progress bar

// v1: the standing owner decisions live in prose (fix-queue doc §3 / module-ecosystem doc).
// Hardcoded here with that provenance; RB-015 v2 can move them to a manifest.
// Decisions only the owner can make. Two of the original three were settled in
// cycle 132 and removed; the survivor stays because an agent must not change a
// system security setting even with approval — the owner runs it themselves.
const PLAYER_INPUT_REQUIRED = [
  'Defender exclusion for the repo tree (~64 s cold-boot lever) — needs an elevated PowerShell run by the owner; agents must not modify security settings'
];

let cache = { at: 0, data: null };

function humanize(s) {
  return String(s || '').replace(/[-_+]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Node title: the question up to its "?" (or a hard cap) — tree cards, not prose. */
function shortTitle(question, cap = 72) {
  const q = String(question || '').trim();
  const cut = q.indexOf('?');
  const t = cut > 0 && cut < cap ? q.slice(0, cut) : q.slice(0, cap);
  return t === q ? t : `${t}…`;
}

/**
 * SMAC-style tech tree, derived from the backlog's state column + curated roadmap.
 * PURE (rows + roadmap in, tree out) so it is testable without the filesystem.
 *
 *   done/superseded -> RESEARCHED        (✓ dimmed — the past)
 *   open/partial    -> RESEARCH AVAILABLE (💡 — exactly the ▶ candidates the
 *                      next-prompt generator offers; same rows, same read)
 *   blocked         -> GATED             (🔒 waiting on the owner, NOT available)
 *   beyond that     -> FUTURE TECHNOLOGY (❓ fog-of-war placeholders: the tree is
 *                      deliberately not fully visible — items not yet conceptualised)
 */
function buildTechTree(backlogRows, roadmap) {
  const prereqs = (roadmap && roadmap.prereqs) || {};
  const doneIds = new Set(backlogRows.filter((r) => r.state === 'done' || r.state === 'superseded').map((r) => r.id));
  const node = (r) => ({ id: r.id, title: shortTitle(r.question), state: r.state });

  // Roots vs grown (owner, 2026-07-27): tech completed at/before the cutoff is the
  // ROOTS — real but NOT displayed, and not worth the effort of pigeonholing into
  // tree positions. Only research completed AFTER the tree existed grows on it.
  // Strictly-after compare on YYYY-MM-DD strings; a row with no usable date stays a
  // root (never promoted by a parsing accident). No cutoff configured = no roots split.
  const cutoff = roadmap && roadmap.rootsCutoff && roadmap.rootsCutoff.date;
  const doneRows = backlogRows.filter((r) => doneIds.has(r.id));
  const isGrown = (r) => Boolean(cutoff) && /^\d{4}-\d{2}-\d{2}$/.test(String(r.lastUpdate || '')) && r.lastUpdate > cutoff;

  const roots = { count: doneRows.filter((r) => !isGrown(r)).length };
  const grown = doneRows
    .filter(isGrown)
    .map((r) => ({
      ...node(r),
      researchedOn: r.lastUpdate,
      buildsOn: (prereqs[r.id] || []).filter((p) => doneIds.has(p))
    }));

  const available = backlogRows
    .filter((r) => r.state === 'open' || r.state === 'partial')
    .map((r) => {
      const remainder = r.state === 'partial' ? remainderOf(r.status) : null;
      return {
        ...node(r),
        // a partial row is offered by its REMAINDER — researching it means the remainder
        research: remainder ? shortTitle(remainder, 90) : shortTitle(r.question, 90),
        buildsOn: (prereqs[r.id] || []).filter((p) => doneIds.has(p))
      };
    });

  const gated = backlogRows
    .filter((r) => r.state === 'blocked')
    .map((r) => ({ ...node(r), note: shortTitle(remainderOf(r.status) || r.status, 90) }));

  const future = Array.from({ length: (roadmap && roadmap.futureSlots) || 3 }, (_, i) => ({
    id: `future-${i + 1}`, title: 'Future Technology'
  }));

  return { roots, grown, available, gated, future };
}

function buildStatus() {
  if (cache.data && Date.now() - cache.at < 30000) return cache.data;

  const ledger = fs.readFileSync(path.join(ROOT, 'docs', 'agi', 'IMPROVEMENT_LEDGER.md'), 'utf8');
  const { cycles } = parseCycleStanzas(ledger);
  const { rows, totals } = computeSeries(cycles);

  const player = {
    xpInLevel: totals.improvements % XP_PER_LEVEL,
    xpPerLevel: XP_PER_LEVEL,
    xpTotal: totals.improvements,
    dataThrough: totals.maxDate
  };

  // party — from the scope manifest, condition from disk (same checker the probe runs)
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'repo-scope.json'), 'utf8'));
  const reposRoot = path.resolve(ROOT, manifest.root || '..');
  const party = manifest.entries
    .filter((e) => e.status === 'in' || e.status === 'consume-only')
    .map((e) => {
      const r = checkEntry(reposRoot, e);
      let condition = 'ready';
      let danger = false;
      if (!r.exists) { condition = 'MISSING'; danger = true; }
      else if (e.requireGit && !r.hasGit) { condition = 'NOT UNDER VERSION CONTROL'; danger = true; }
      else if (r.dirty > 0) condition = `${r.dirty} unsaved change${r.dirty === 1 ? '' : 's'}`;
      return {
        name: e.name,
        role: String(e.role || '').split('.')[0].slice(0, 64),
        status: e.status === 'in' ? 'ACTIVE' : 'CONSUME-ONLY',
        condition, danger,
        lastCommit: r.lastCommit || null
      };
    });

  // quests — main = latest cycle result; side = owed[] fields from recent stanzas
  const latest = rows[rows.length - 1] || {};
  const latestCycle = cycles[cycles.length - 1] || {};
  // owed[] entries accumulate from recent stanzas; a later stanza's owed_closed[]
  // retires them (otherwise a paid debt would keep showing as outstanding).
  const closed = new Set();
  for (const c of cycles.slice(-10)) {
    for (const o of (Array.isArray(c.owed_closed) ? c.owed_closed : [])) closed.add(humanize(o));
  }
  const owed = [];
  for (const c of cycles.slice(-10).reverse()) {
    for (const o of (Array.isArray(c.owed) ? c.owed : [])) {
      const label = humanize(o);
      if (closed.has(label)) continue;
      if (!owed.some((x) => x.label === label)) owed.push({ label, cycle: c.id });
    }
  }
  const recent = rows.slice(-6).reverse().map((r, i) => ({
    cycle: r.id,
    label: humanize((cycles.find((c) => c.id === r.id) || {}).result || 'cycle logged'),
    correction: r.correction
  }));

  // achievements — every value recountable from the same stanzas the SVG uses
  const achievements = [];
  if (totals.improvements >= 100) achievements.push({ icon: '★', label: '100+ IMPROVEMENTS', detail: `${totals.improvements} verified to date` });
  if (totals.defectsPre >= 100) achievements.push({ icon: '⚙', label: 'DEFECT CATCHES', detail: `${totals.defectsPre} caught before landing` });
  if (totals.corrections >= 1) achievements.push({ icon: '↺', label: 'CORRECTIONS', detail: `${totals.corrections} issued publicly` });
  if (totals.pages >= 10000) achievements.push({ icon: '◉', label: 'ARCHIVE', detail: `${(totals.pages / 1000).toFixed(1)}k pages crawled during cycles` });
  try {
    const ann = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'agi', 'progress', 'annotations.json'), 'utf8'));
    for (const a of (Array.isArray(ann) ? ann : []).slice(-3)) {
      achievements.push({ icon: '⚑', label: 'MILESTONE', detail: `${a.label} (cycle ${a.cycle})` });
    }
  } catch (_) { /* no annotations yet */ }

  // tech tree + path ahead — states live in the backlog, the curated path in roadmap.json
  let techTree = { roots: { count: 0 }, grown: [], available: [], gated: [], future: [] };
  let roadmapOut = { block: null, steps: [] };
  try {
    const backlogRows = parseBacklog(fs.readFileSync(path.join(ROOT, 'docs', 'agi', 'RESEARCH_BACKLOG.md'), 'utf8'));
    let roadmap = null;
    try { roadmap = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'roadmap.json'), 'utf8')); } catch (_) {}
    techTree = buildTechTree(backlogRows, roadmap);
    if (roadmap) roadmapOut = { block: roadmap.block || null, steps: Array.isArray(roadmap.steps) ? roadmap.steps : [] };
  } catch (e) {
    // parseBacklog THROWS on an unknown state (by design) — surface it, don't blank the page
    techTree.error = e.message;
  }

  const data = {
    player,
    stats: {
      cycles: totals.cycles,
      preShipPct: totals.defectsPre + totals.defectsPost
        ? Math.round((totals.defectsPre / (totals.defectsPre + totals.defectsPost)) * 100) : 0,
      defectsPre: totals.defectsPre,
      corrections: totals.corrections,
      pages: totals.pages
    },
    mainQuest: {
      cycle: latest.id || null,
      label: humanize(latestCycle.result || 'no cycles recorded'),
      date: latest.date || ''
    },
    sideQuests: owed,
    playerInput: PLAYER_INPUT_REQUIRED,
    recent,
    party,
    achievements,
    techTree,
    roadmap: roadmapOut
  };
  cache = { at: Date.now(), data };
  return data;
}

module.exports = { buildStatus, buildTechTree, shortTitle };
