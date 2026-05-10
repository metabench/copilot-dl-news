'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Sync ledger — replaces the single-watermark file with an append-only
 * ledger of batches. Each entry tracks confirmation and prune status so
 * that a crash between ingest and prune can be safely resumed.
 *
 * Entry shape:
 *   {
 *     batchId: string,        // unique id (e.g. ISO timestamp + counter)
 *     exportedAt: string,     // ISO timestamp from /api/export/batch
 *     watermark: string,      // last updated_at in batch (legacy compat)
 *     urlIds: number[],       // remote url ids covered by this batch
 *     confirmedAt: string|null,
 *     prunedAt: string|null,
 *     pruneRetries: number,
 *     deleted: { urls, httpResponses, content, links } | null
 *   }
 *
 * Pure operations work on plain state objects. The thin persistence
 * wrapper at the bottom reads/writes the JSON file atomically.
 */

const LEDGER_VERSION = 1;
const MAX_HISTORY = 200; // keep recent entries; older fully-pruned ones get trimmed

function parseWatermarkMs(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)
    ? `${text.replace(' ', 'T')}Z`
    : text;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
}

function newerWatermark(current, candidate) {
  if (!candidate) return current || null;
  if (!current) return candidate;
  const currentMs = parseWatermarkMs(current);
  const candidateMs = parseWatermarkMs(candidate);
  if (currentMs !== null && candidateMs !== null) return candidateMs > currentMs ? candidate : current;
  return String(candidate) > String(current) ? candidate : current;
}

function emptyLedger() {
  return {
    version: LEDGER_VERSION,
    lastWatermark: null,
    totalPulled: 0,
    entries: [],
  };
}

function appendBatch(ledger, { batchId, exportedAt, watermark, urlIds }) {
  if (!batchId) throw new Error('appendBatch requires batchId');
  if (!Array.isArray(urlIds)) throw new Error('appendBatch requires urlIds[]');
  const next = cloneLedger(ledger);
  next.entries.push({
    batchId: String(batchId),
    exportedAt: exportedAt || new Date().toISOString(),
    watermark: watermark || null,
    urlIds: [...urlIds],
    confirmedAt: null,
    prunedAt: null,
    pruneRetries: 0,
    deleted: null,
  });
  next.lastWatermark = newerWatermark(next.lastWatermark, watermark);
  next.totalPulled = (next.totalPulled || 0) + urlIds.length;
  return trim(next);
}

function markConfirmed(ledger, batchId, at = new Date().toISOString()) {
  return updateEntry(ledger, batchId, (e) => {
    e.confirmedAt = at;
  });
}

function markPruned(ledger, batchId, { at, deleted } = {}) {
  return updateEntry(ledger, batchId, (e) => {
    e.prunedAt = at || new Date().toISOString();
    if (deleted) e.deleted = deleted;
  });
}

function recordPruneFailure(ledger, batchId) {
  return updateEntry(ledger, batchId, (e) => {
    e.pruneRetries = (e.pruneRetries || 0) + 1;
  });
}

function findUnconfirmed(ledger) {
  return (ledger.entries || []).filter(e => !e.confirmedAt);
}

function findUnpruned(ledger) {
  return (ledger.entries || []).filter(e => e.confirmedAt && !e.prunedAt);
}

function findResumeWork(ledger) {
  return {
    unconfirmed: findUnconfirmed(ledger),
    unpruned: findUnpruned(ledger),
  };
}

function getLastWatermark(ledger) {
  return ledger?.lastWatermark || null;
}

// ── Internals ────────────────────────────────────────────────

function cloneLedger(ledger) {
  if (!ledger || typeof ledger !== 'object') return emptyLedger();
  return {
    version: ledger.version || LEDGER_VERSION,
    lastWatermark: ledger.lastWatermark || null,
    totalPulled: ledger.totalPulled || 0,
    entries: Array.isArray(ledger.entries) ? ledger.entries.map(e => ({ ...e, urlIds: [...(e.urlIds || [])] })) : [],
  };
}

function updateEntry(ledger, batchId, mutator) {
  const next = cloneLedger(ledger);
  const entry = next.entries.find(e => e.batchId === String(batchId));
  if (!entry) throw new Error(`Ledger entry not found: ${batchId}`);
  mutator(entry);
  return next;
}

function trim(ledger) {
  const entries = ledger.entries || [];
  if (entries.length <= MAX_HISTORY) return ledger;
  // Keep all unconfirmed/unpruned entries; trim oldest fully-completed entries.
  const completed = [];
  const active = [];
  for (const e of entries) {
    if (e.confirmedAt && e.prunedAt) completed.push(e);
    else active.push(e);
  }
  const keepCompleted = completed.slice(-Math.max(0, MAX_HISTORY - active.length));
  return { ...ledger, entries: [...keepCompleted, ...active] };
}

// ── Persistence wrapper ─────────────────────────────────────

function loadLedger(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      // Migration: try the legacy watermark file in the same directory
      const legacy = path.join(path.dirname(filePath), '.crawl-remote-watermark.json');
      if (fs.existsSync(legacy)) {
        try {
          const wm = JSON.parse(fs.readFileSync(legacy, 'utf8'));
          const migrated = emptyLedger();
          migrated.lastWatermark = wm.lastWatermark || null;
          migrated.totalPulled = wm.totalPulled || 0;
          return migrated;
        } catch (_) { /* ignore */ }
      }
      return emptyLedger();
    }
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!raw || raw.version !== LEDGER_VERSION) {
      // forward-migrate flat watermark
      if (raw && (raw.lastWatermark || raw.totalPulled)) {
        const m = emptyLedger();
        m.lastWatermark = raw.lastWatermark || null;
        m.totalPulled = raw.totalPulled || 0;
        return m;
      }
      return emptyLedger();
    }
    return cloneLedger(raw);
  } catch (_) {
    return emptyLedger();
  }
}

function saveLedger(filePath, ledger) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(ledger, null, 2));
  fs.renameSync(tmp, filePath);
}

function generateBatchId(now = Date.now()) {
  return `b-${now}-${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = {
  LEDGER_VERSION,
  emptyLedger,
  appendBatch,
  markConfirmed,
  markPruned,
  recordPruneFailure,
  findUnconfirmed,
  findUnpruned,
  findResumeWork,
  getLastWatermark,
  loadLedger,
  saveLedger,
  generateBatchId,
  newerWatermark,
};
