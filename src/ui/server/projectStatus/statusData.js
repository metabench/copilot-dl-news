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
    achievements
  };
  cache = { at: Date.now(), data };
  return data;
}

module.exports = { buildStatus };
