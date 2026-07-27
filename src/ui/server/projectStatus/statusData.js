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
 * SMAC-style tech tree v3 (owner directive 2026-07-27, researched against Alpha
 * Centauri): BRANCHES are the game's research categories — an intertwining tree,
 * every tech capped at TWO prerequisites, blind-research fog beyond the frontier.
 *
 * Sources of truth stay split on the one-fact-one-field rule:
 *   config/tech-tree.json  — STRUCTURE: branches, the finite curated roots
 *                            (capability-level, deliberately not a per-RB retrofit),
 *                            tech nodes + their <=2 prereq edges, fog size.
 *   RESEARCH_BACKLOG.md    — STATE for every RB-* tech (read live; ref entries in the
 *                            spec carry no state of their own, so they cannot disagree).
 *   roadmap.json           — the rootsCutoff date: RB rows completed at/before it are
 *                            ABSORBED into the curated roots (counted, never re-listed);
 *                            later completions surface as grown nodes on the tree.
 *
 * Violations THROW (the c129 rule): an unknown state, a phantom edge, a third prereq
 * or a curated tech claiming completion is a broken record to fix, not render around.
 */
function buildTechTree(backlogRows, roadmap, spec) {
  if (!spec || !spec.branches || !Array.isArray(spec.roots) || !Array.isArray(spec.techs)) {
    throw new Error('tech-tree.json missing or malformed — branches/roots/techs are required');
  }
  const cutoff = roadmap && roadmap.rootsCutoff && roadmap.rootsCutoff.date;
  const byId = new Map(backlogRows.map((r) => [r.id, r]));
  const knownIds = new Set([...spec.roots.map((r) => r.id), ...spec.techs.map((t) => t.ref || t.id)]);
  const branchOf = new Map(spec.roots.map((r) => [r.id, r.branch]));
  for (const t of spec.techs) branchOf.set(t.ref || t.id, t.branch);

  const resolvePrereqs = (t, owner) => {
    const list = Array.isArray(t.prereqs) ? t.prereqs : [];
    if (list.length > 2) throw new Error(`${owner}: ${list.length} prereqs — SMAC caps at two; split the tech instead`);
    return list.map((p) => {
      if (!knownIds.has(p)) throw new Error(`${owner}: prereq ${p} names no root or tech — edges must be real`);
      return { id: p, branch: branchOf.get(p) };
    });
  };

  const branches = Object.entries(spec.branches).map(([key, b]) => ({
    key, label: b.label, color: b.color, icon: b.icon, tagline: b.tagline || '',
    roots: spec.roots.filter((r) => r.branch === key).map((r) => ({ id: r.id, title: r.title, note: r.note || '' })),
    grown: [], available: [], gated: [],
    future: Array.from({ length: spec.fogPerBranch || 2 }, (_, i) => ({ id: `${key}-future-${i + 1}`, title: 'Future Technology' }))
  }));
  const branch = (key) => branches.find((b) => b.key === key);
  let absorbed = 0;

  for (const t of spec.techs) {
    const owner = t.ref || t.id;
    const dest = branch(t.branch);
    if (!dest) throw new Error(`${owner}: unknown branch ${JSON.stringify(t.branch)}`);
    const prereqs = resolvePrereqs(t, owner);

    if (t.ref) {
      const row = byId.get(t.ref);
      if (!row) throw new Error(`${owner}: no such backlog row — a ref must point at a real RB id`);
      const node = { id: row.id, title: shortTitle(row.question), prereqs };
      if (Array.isArray(t.prelim) && t.prelim.length) node.prelim = t.prelim;
      if (row.state === 'done' || row.state === 'superseded') {
        const grownDate = /^\d{4}-\d{2}-\d{2}$/.test(String(row.lastUpdate || '')) && cutoff && row.lastUpdate > cutoff;
        if (grownDate) dest.grown.push({ ...node, researchedOn: row.lastUpdate });
        else absorbed++; // completed pre-tree: embodied in the curated roots, never re-listed
      } else if (row.state === 'blocked') {
        dest.gated.push({ ...node, note: shortTitle(remainderOf(row.status) || row.status, 90) });
      } else {
        const remainder = row.state === 'partial' ? remainderOf(row.status) : null;
        // a partial row is offered by its REMAINDER — researching it means the remainder
        dest.available.push({ ...node, research: remainder ? shortTitle(remainder, 90) : shortTitle(row.question, 90) });
      }
    } else {
      if (t.state !== 'available') {
        throw new Error(`${owner}: curated techs may only be "available" — completion belongs in the ledger/backlog, then the node is promoted`);
      }
      const extra = {};
      // 'Preliminary Data' (owner 2026-07-27): a tech may carry extensive ideation
      // about accomplishing it — rendered as a collapsible block on its branch page.
      if (Array.isArray(t.prelim) && t.prelim.length) extra.prelim = t.prelim;
      // A signal-bearing tech renders the big lightbulb REQUEST button; the click
      // lands in data/agi-signals.jsonl and reaches the agent via orient + prompt.
      if (t.signal) extra.signal = t.signal;
      dest.available.push({ id: t.id, title: t.title, research: t.research || '', prereqs, ...extra });
    }
  }

  // Completed RB rows the spec does not reference are also pre-tree history: absorbed.
  const referenced = new Set(spec.techs.filter((t) => t.ref).map((t) => t.ref));
  absorbed += backlogRows.filter((r) => (r.state === 'done' || r.state === 'superseded') && !referenced.has(r.id)).length;

  return { branches, absorbed };
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

  // tech tree + path ahead — structure in tech-tree.json, states in the backlog,
  // the curated path in roadmap.json (one fact, one field, three files)
  let techTree = { branches: [], absorbed: 0 };
  let roadmapOut = { block: null, steps: [] };
  try {
    const backlogRows = parseBacklog(fs.readFileSync(path.join(ROOT, 'docs', 'agi', 'RESEARCH_BACKLOG.md'), 'utf8'));
    const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'tech-tree.json'), 'utf8'));
    let roadmap = null;
    try { roadmap = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'roadmap.json'), 'utf8')); } catch (_) {}
    techTree = buildTechTree(backlogRows, roadmap, spec);
    if (roadmap) roadmapOut = { block: roadmap.block || null, steps: Array.isArray(roadmap.steps) ? roadmap.steps : [] };
  } catch (e) {
    // the builder THROWS on a broken record (unknown state / phantom edge / >2 prereqs)
    // by design — surface it on the page rather than blanking or guessing
    techTree.error = e.message;
  }

  // owner signals — the big-lightbulb queue; pending ones surface here, at orient
  // (agi-signal probe) and in the generated next-prompt, so a click cannot be missed
  let pendingSignals = [];
  try { pendingSignals = require('./signals').pending(); } catch (_) {}

  // live tool inventory for the TOOL FACTORY coordination point — counted from
  // disk each rebuild so the listing cannot drift from reality (603 as of 2026-07-28)
  let toolInventory = { total: 0, dirs: 0 };
  try {
    const toolsRoot = path.join(ROOT, 'tools');
    const walk = (dir, depth) => {
      let n = 0;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules') continue;
        if (e.isDirectory() && depth < 4) n += walk(path.join(dir, e.name), depth + 1);
        else if (e.isFile() && e.name.endsWith('.js')) n += 1;
      }
      return n;
    };
    const dirs = fs.readdirSync(toolsRoot, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== 'node_modules');
    toolInventory = { total: walk(toolsRoot, 0), dirs: dirs.length };
  } catch (_) {}

  const data = {
    player,
    pendingSignals,
    toolInventory,
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
