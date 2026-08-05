'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
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
  LedgerCorruptError,
} = require('../../../tools/crawl/lib/sync-ledger');

describe('sync-ledger pure operations', () => {
  test('emptyLedger has zero entries and null watermark', () => {
    const l = emptyLedger();
    expect(l.entries).toEqual([]);
    expect(l.lastWatermark).toBeNull();
    expect(l.totalPulled).toBe(0);
  });

  test('appendBatch records urlIds and totals; watermark waits for confirm', () => {
    const l = appendBatch(emptyLedger(), {
      batchId: 'b1',
      exportedAt: '2026-05-09T10:00:00Z',
      watermark: '2026-05-09T10:00:00Z',
      urlIds: [1, 2, 3],
    });
    expect(l.entries.length).toBe(1);
    expect(l.entries[0].urlIds).toEqual([1, 2, 3]);
    expect(l.entries[0].confirmedAt).toBeNull();
    expect(l.entries[0].prunedAt).toBeNull();
    // c202: D3(a) — appendBatch must NOT advance lastWatermark. Advancing at
    // append meant a crash before confirm skipped this batch's URLs forever
    // on restart. The watermark moves only in markConfirmed.
    expect(l.lastWatermark).toBeNull();
    expect(l.totalPulled).toBe(3);
    const confirmed = markConfirmed(l, 'b1');
    expect(confirmed.lastWatermark).toBe('2026-05-09T10:00:00Z');
  });

  test('appendBatch is immutable on the input', () => {
    const before = emptyLedger();
    const after = appendBatch(before, { batchId: 'b1', urlIds: [1] });
    expect(before.entries.length).toBe(0);
    expect(after.entries.length).toBe(1);
  });

  test('confirming an older recovery batch does not regress the watermark', () => {
    // c202: re-expressed under D3(a) semantics — append never moves the
    // watermark, so the no-regress property now lives at markConfirmed:
    // confirming an out-of-order recovery pull must not pull it backwards.
    let l = appendBatch(emptyLedger(), {
      batchId: 'newer',
      exportedAt: '2026-05-09T10:00:00Z',
      watermark: '2026-05-09 16:57:58',
      urlIds: [1],
    });
    l = appendBatch(l, {
      batchId: 'older-recovery',
      exportedAt: '2026-05-09T10:01:00Z',
      watermark: '2026-05-09 16:57:16',
      urlIds: [2],
    });
    expect(l.lastWatermark).toBeNull();

    l = markConfirmed(l, 'newer');
    expect(l.lastWatermark).toBe('2026-05-09 16:57:58');
    l = markConfirmed(l, 'older-recovery');
    expect(l.lastWatermark).toBe('2026-05-09 16:57:58');
    expect(newerWatermark('2026-05-09 16:57:58', '2026-05-09 16:57:16')).toBe('2026-05-09 16:57:58');
  });

  test('appendBatch rejects bad input', () => {
    expect(() => appendBatch(emptyLedger(), { urlIds: [1] })).toThrow(/batchId/);
    expect(() => appendBatch(emptyLedger(), { batchId: 'x' })).toThrow(/urlIds/);
  });

  test('markConfirmed and markPruned update the matching entry', () => {
    let l = appendBatch(emptyLedger(), { batchId: 'b1', urlIds: [1, 2] });
    l = markConfirmed(l, 'b1', '2026-05-09T10:00:01Z');
    expect(l.entries[0].confirmedAt).toBe('2026-05-09T10:00:01Z');
    l = markPruned(l, 'b1', { at: '2026-05-09T10:00:02Z', deleted: { content: 2, httpResponses: 2, urls: 0, links: 2 } });
    expect(l.entries[0].prunedAt).toBe('2026-05-09T10:00:02Z');
    expect(l.entries[0].deleted.content).toBe(2);
  });

  test('recordPruneFailure increments retries without setting prunedAt', () => {
    let l = appendBatch(emptyLedger(), { batchId: 'b1', urlIds: [1] });
    l = markConfirmed(l, 'b1');
    l = recordPruneFailure(l, 'b1');
    l = recordPruneFailure(l, 'b1');
    expect(l.entries[0].pruneRetries).toBe(2);
    expect(l.entries[0].prunedAt).toBeNull();
  });

  test('findUnconfirmed and findUnpruned classify resume work', () => {
    let l = emptyLedger();
    l = appendBatch(l, { batchId: 'b1', urlIds: [1] });
    l = appendBatch(l, { batchId: 'b2', urlIds: [2, 3] });
    l = appendBatch(l, { batchId: 'b3', urlIds: [4] });
    l = markConfirmed(l, 'b2');
    l = markConfirmed(l, 'b3');
    l = markPruned(l, 'b3');

    const unconfirmed = findUnconfirmed(l).map(e => e.batchId);
    const unpruned = findUnpruned(l).map(e => e.batchId);
    expect(unconfirmed).toEqual(['b1']);
    expect(unpruned).toEqual(['b2']);

    const work = findResumeWork(l);
    expect(work.unconfirmed.length).toBe(1);
    expect(work.unpruned.length).toBe(1);
  });

  test('getLastWatermark is null until a batch is confirmed', () => {
    expect(getLastWatermark(emptyLedger())).toBeNull();
    const l = appendBatch(emptyLedger(), { batchId: 'b1', watermark: 'ts1', urlIds: [1] });
    // c202: D3(a) — unconfirmed batches leave the watermark untouched.
    expect(getLastWatermark(l)).toBeNull();
    expect(getLastWatermark(markConfirmed(l, 'b1'))).toBe('ts1');
  });

  test('updateEntry throws on unknown batchId', () => {
    const l = appendBatch(emptyLedger(), { batchId: 'b1', urlIds: [1] });
    expect(() => markConfirmed(l, 'missing')).toThrow(/Ledger entry not found/);
  });

  test('generateBatchId produces unique values', () => {
    const a = generateBatchId();
    const b = generateBatchId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^b-\d+-[a-z0-9]+$/);
  });
});

describe('sync-ledger persistence', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-ledger-'));
  });
  afterEach(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  });

  test('returns empty ledger when no file exists and no legacy watermark', () => {
    const l = loadLedger(path.join(dir, 'ledger.json'));
    expect(l.entries).toEqual([]);
    expect(l.lastWatermark).toBeNull();
  });

  test('saveLedger then loadLedger round-trips state', () => {
    const file = path.join(dir, 'ledger.json');
    let l = appendBatch(emptyLedger(), { batchId: 'b1', watermark: 'ts1', urlIds: [1, 2] });
    l = markConfirmed(l, 'b1');
    saveLedger(file, l);

    const loaded = loadLedger(file);
    expect(loaded.entries.length).toBe(1);
    expect(loaded.entries[0].batchId).toBe('b1');
    expect(loaded.entries[0].confirmedAt).not.toBeNull();
    expect(loaded.lastWatermark).toBe('ts1');
  });

  test('migrates legacy watermark file when ledger missing', () => {
    const legacy = path.join(dir, '.crawl-remote-watermark.json');
    fs.writeFileSync(legacy, JSON.stringify({ lastWatermark: 'wm-1', totalPulled: 42 }));

    const ledger = loadLedger(path.join(dir, '.crawl-remote-ledger.json'));
    expect(ledger.lastWatermark).toBe('wm-1');
    expect(ledger.totalPulled).toBe(42);
    expect(ledger.entries).toEqual([]);
  });

  test('quarantines a malformed file and throws LedgerCorruptError', () => {
    // c202: was "treats malformed file as empty ledger" — silently starting
    // fresh discarded the record of unconfirmed batches, the exact data-loss
    // the ledger exists to prevent. The subject now renames the corrupt file
    // aside (.corrupt-<ts>) and throws so the operator decides.
    const file = path.join(dir, 'ledger.json');
    fs.writeFileSync(file, '{not json');
    expect(() => loadLedger(file)).toThrow(LedgerCorruptError);
    expect(fs.existsSync(file)).toBe(false);
    const quarantined = fs.readdirSync(dir).filter((n) => n.startsWith('ledger.json.corrupt-'));
    expect(quarantined.length).toBe(1);
  });
});
