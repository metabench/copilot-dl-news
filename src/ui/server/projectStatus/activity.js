'use strict';

/**
 * activity.js — the agent's low-frequency progress channel (owner directive
 * 2026-07-30, cycle 155): "it would be great if progress during a task or turn
 * were shown, but keep that at low frequency for the moment because I don't
 * want agents' flow to be disrupted."
 *
 * Shape mirrors signals.js deliberately — an append-only JSONL the agent WRITES
 * and the pages READ, so the two channels (owner→agent clicks, agent→owner
 * progress) work the same way and neither needs a database.
 *
 * LOW FREQUENCY IS ENFORCED, not merely requested: report() drops a record that
 * arrives within MIN_INTERVAL_MS of the last one and says so in its return
 * value. An agent reporting at phase boundaries (orient, building, verifying,
 * closing) is well under that; an agent trying to narrate every tool call gets
 * throttled by the channel itself rather than by anyone's discipline. Reporting
 * is FIRE-AND-FORGET by contract: a failure to report must never fail a cycle.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const LOG = path.join(ROOT, 'data', 'agent-activity.jsonl');

/** Records closer together than this are dropped (the flow-protection rule). */
const MIN_INTERVAL_MS = 20000;
/** How much tail the pages read — a strip needs the newest, not a history. */
const TAIL = 40;
/** Older than this and the strip stops claiming anything is in progress. */
const STALE_AFTER_MS = 45 * 60 * 1000;

function readAll(logPath = LOG) {
  let text;
  try { text = fs.readFileSync(logPath, 'utf8'); } catch (_) { return []; }
  const out = [];
  for (const line of text.split('\n').slice(-TAIL * 2)) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch (_) { /* a torn write is not a record */ }
  }
  return out.slice(-TAIL);
}

function newest(logPath = LOG) {
  const all = readAll(logPath);
  return all.length ? all[all.length - 1] : null;
}

/**
 * report — append one progress record. Returns
 * { ok:true, record } | { ok:false, throttled:true, retryAfterMs } and NEVER throws
 * for a caller-shaped problem; the CLI turns any failure into a silent no-op.
 */
function report({ phase, note, cycle } = {}, logPath = LOG, nowMs = Date.now()) {
  const cleanPhase = String(phase || '').trim().slice(0, 40);
  if (!cleanPhase) return { ok: false, error: 'phase is required' };

  const last = newest(logPath);
  if (last && last.atMs && nowMs - last.atMs < MIN_INTERVAL_MS) {
    return { ok: false, throttled: true, retryAfterMs: MIN_INTERVAL_MS - (nowMs - last.atMs) };
  }

  const record = {
    phase: cleanPhase,
    note: String(note || '').replace(/\s+/g, ' ').trim().slice(0, 240),
    cycle: Number.isFinite(Number(cycle)) ? Number(cycle) : null,
    at: new Date(nowMs).toISOString(),
    atMs: nowMs
  };
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, JSON.stringify(record) + '\n');
  } catch (err) {
    return { ok: false, error: err.message };
  }
  return { ok: true, record };
}

/**
 * current — what the pages render. Deliberately says "idle" rather than showing
 * an hours-old phase as if it were live: a stale strip is worse than no strip,
 * which is the whole lesson of the zombie-state incident (cycle 150).
 */
function current(logPath = LOG, nowMs = Date.now()) {
  const last = newest(logPath);
  if (!last) return { idle: true, reason: 'no agent has reported progress yet' };
  const ageMs = nowMs - (last.atMs || Date.parse(last.at) || 0);
  if (ageMs > STALE_AFTER_MS) {
    return { idle: true, reason: 'last report is stale', phase: last.phase, note: last.note, at: last.at, ageMinutes: Math.round(ageMs / 60000) };
  }
  return { idle: false, phase: last.phase, note: last.note, cycle: last.cycle, at: last.at, ageMinutes: Math.round(ageMs / 60000) };
}

module.exports = { LOG, MIN_INTERVAL_MS, STALE_AFTER_MS, readAll, newest, report, current };
