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
  if (currentMs !== null) return current;     // candidate is malformed — keep current
  if (candidateMs !== null) return candidate;  // current is malformed — accept candidate
  return current; // both malformed — don't advance
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
  // D3(a) (2026-07-21, distributed-crawl plan v2): lastWatermark does NOT
  // advance here. It used to — meaning a crash between append and confirm
  // left the watermark already past this batch's data, so on restart the
  // sync loop would request `since=<that watermark>` and this batch's URLs
  // were SKIPPED FOREVER (never re-pulled, never confirmed). The watermark
  // now advances only in markConfirmed, once ingest+verify actually
  // succeeded — a re-pull of the same window after a crash is the safe
  // failure mode (harmless replay, protected by remote_sync_batches
  // idempotency — see legacy-remoteCrawlSyncIngest.ts), not silent loss.
  next.totalPulled = (next.totalPulled || 0) + urlIds.length;
  return trim(next);
}

function markConfirmed(ledger, batchId, at = new Date().toISOString()) {
  const next = updateEntry(ledger, batchId, (e) => {
    e.confirmedAt = at;
  });
  const entry = next.entries.find((e) => e.batchId === String(batchId));
  next.lastWatermark = newerWatermark(next.lastWatermark, entry && entry.watermark);
  return next;
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

// D3(d) (2026-07-21): a MISSING ledger file is a normal, safe case (first run,
// or migrating from the legacy watermark file) — emptyLedger()/migration is
// correct. A ledger file that EXISTS but fails to PARSE is a different,
// dangerous case: silently returning emptyLedger() there used to wipe the
// watermark + all in-flight batch history without a trace, which could drive
// a costly full re-sync from scratch or (worse, combined with a stale legacy
// watermark file) confuse `since` resolution. Now: quarantine the unreadable
// file (rename aside, never delete) and THROW — loud failure an operator must
// notice, not a silent reset. Scope note: this does NOT attempt to rebuild the
// watermark from remote_sync_batches (the ingest-idempotency table) — that
// auto-recovery is a larger, separate piece of work; quarantine+halt is the
// safe minimum that stops silent data loss today.
class LedgerCorruptError extends Error {
  constructor(filePath, quarantinePath, cause) {
    super(`Sync ledger at ${filePath} exists but is unreadable/corrupt — quarantined to ` +
      `${quarantinePath}. Refusing to silently reset sync state (this used to wipe the ` +
      `watermark silently). Inspect the quarantined file; if truly unrecoverable, delete it ` +
      `to start a fresh ledger deliberately. Cause: ${cause && cause.message}`);
    this.name = 'LedgerCorruptError';
    this.filePath = filePath;
    this.quarantinePath = quarantinePath;
    this.cause = cause;
  }
}

function loadLedger(filePath) {
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
      } catch (_) { /* legacy file itself corrupt — fall through to a fresh ledger */ }
    }
    return emptyLedger();
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    const quarantinePath = `${filePath}.corrupt-${Date.now()}`;
    try { fs.renameSync(filePath, quarantinePath); } catch (_) { /* best-effort quarantine */ }
    throw new LedgerCorruptError(filePath, quarantinePath, err);
  }

  if (!raw || raw.version !== LEDGER_VERSION) {
    // forward-migrate flat watermark (a recognizable OLD-but-valid shape, not corruption)
    if (raw && (raw.lastWatermark || raw.totalPulled)) {
      const m = emptyLedger();
      m.lastWatermark = raw.lastWatermark || null;
      m.totalPulled = raw.totalPulled || 0;
      return m;
    }
    return emptyLedger();
  }
  return cloneLedger(raw);
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
  LedgerCorruptError,
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
