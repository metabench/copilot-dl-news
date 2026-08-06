'use strict';

/**
 * signals.js — the owner's big-lightbulb signal path (owner directive 2026-07-27).
 *
 * A click on a tech node's RESEARCH button must reach the AGENT. There is no
 * push channel into an agent session, and pretending otherwise would be the
 * kind of fiction this loop hunts — so the signal rides the two surfaces the
 * agent PROVABLY reads every cycle:
 *
 *   1. the orient probe suite  — a pending signal turns the `agi-signal` probe
 *      RED with the owner's request in the failure text (orient cannot pass
 *      until the agent acknowledges), and
 *   2. the generated next-prompt — pending signals render as a ⚡ OWNER SIGNAL
 *      line ABOVE the curated ▶ selection, preempting it.
 *
 * "Focus your attention after tying up loose ends" is exactly the semantics of
 * a queued directive picked up at the next cycle boundary — not an interrupt.
 *
 * Storage: data/agi-signals.jsonl (runtime state, gitignored with the rest of
 * data/ — a click is not history until the cycle that answers it lands in the
 * ledger). Append-only JSONL, one record per line:
 *   { id, tech, requested, at, status: 'pending'|'done', ackAt?, ackNote? }
 *
 * READING IT BY HAND: the log is APPEND-ONLY, so acknowledging a signal writes
 * a SECOND record with the same `id` and status 'done' — it does not modify
 * the original. A record is open only when no later record shares its id. Any
 * ad-hoc parse that tests each line for `ackAt` will report every request line
 * as pending: cycle 233 did exactly that, read 9 open signals against the
 * probe's 0, and briefly suspected the owner's lever had come disconnected.
 * The probe was right. Pair by id, or just call pending() from here.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const QUEUE = path.join(ROOT, 'data', 'agi-signals.jsonl');

function readAll(queuePath = QUEUE) {
  let text;
  try { text = fs.readFileSync(queuePath, 'utf8'); } catch (_) { return []; }
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch (_) { /* a torn write is not a signal */ }
  }
  return out;
}

/** Latest record per id wins (ack appends a superseding record, never rewrites). */
function effective(queuePath = QUEUE) {
  const byId = new Map();
  for (const r of readAll(queuePath)) if (r && r.id) byId.set(r.id, { ...(byId.get(r.id) || {}), ...r });
  return [...byId.values()];
}

function pending(queuePath = QUEUE) {
  return effective(queuePath).filter((r) => r.status === 'pending');
}

function append(record, queuePath = QUEUE) {
  fs.mkdirSync(path.dirname(queuePath), { recursive: true });
  fs.appendFileSync(queuePath, JSON.stringify(record) + '\n');
  return record;
}

/** Called by the page's POST route when the big lightbulb is clicked. */
function raise(tech, requested, queuePath = QUEUE) {
  const at = new Date().toISOString();
  return append({
    id: `sig-${at.replace(/[-:.TZ]/g, '').slice(0, 14)}-${tech}`,
    tech,
    requested: String(requested || '').slice(0, 300),
    at,
    status: 'pending'
  }, queuePath);
}

/** Called by the agent (tools/agi/ack-signal.js) when it takes the work up. */
function ack(id, ackNote, queuePath = QUEUE) {
  const rec = effective(queuePath).find((r) => r.id === id);
  if (!rec) throw new Error(`no signal with id ${id}`);
  if (rec.status !== 'pending') throw new Error(`${id} is already ${rec.status}`);
  return append({ id, status: 'done', ackAt: new Date().toISOString(), ackNote: String(ackNote || '') }, queuePath);
}

module.exports = { QUEUE, readAll, effective, pending, raise, ack };
