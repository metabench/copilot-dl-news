'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  emptyLedger, appendBatch, markConfirmed, markPruned, findUnconfirmed,
  findResumeWork, getLastWatermark, loadLedger, saveLedger, LedgerCorruptError,
} = require('../sync-ledger');

// D3(a)+(d) (distributed-crawl plan v2, cycle 68): the watermark-timing fix
// (advance only on confirm, not on append) and the corrupt-ledger quarantine
// fix (throw instead of silently returning emptyLedger). See the confirmed
// finding: appendBatch used to advance lastWatermark immediately, so a crash
// between append and confirm silently skipped that batch's URLs FOREVER on
// restart (since = getLastWatermark(ledger) had already moved past them).

describe('sync-ledger: watermark advances ONLY on confirm (D3a)', () => {
  test('appendBatch does NOT advance lastWatermark', () => {
    let ledger = emptyLedger();
    ledger = appendBatch(ledger, { batchId: 'b1', watermark: '2026-07-21 10:00:00', urlIds: [1, 2, 3] });
    expect(getLastWatermark(ledger)).toBeNull(); // still null — not yet confirmed
    expect(ledger.entries[0].watermark).toBe('2026-07-21 10:00:00'); // preserved on the entry
  });

  test('markConfirmed advances lastWatermark using the entry\'s own stored watermark', () => {
    let ledger = emptyLedger();
    ledger = appendBatch(ledger, { batchId: 'b1', watermark: '2026-07-21 10:00:00', urlIds: [1] });
    expect(getLastWatermark(ledger)).toBeNull();
    ledger = markConfirmed(ledger, 'b1');
    expect(getLastWatermark(ledger)).toBe('2026-07-21 10:00:00');
  });

  test('the crash-recovery scenario: an appended-but-unconfirmed batch does NOT poison `since` on restart', () => {
    let ledger = emptyLedger();
    ledger = appendBatch(ledger, { batchId: 'confirmed-1', watermark: '2026-07-21 09:00:00', urlIds: [1] });
    ledger = markConfirmed(ledger, 'confirmed-1');
    expect(getLastWatermark(ledger)).toBe('2026-07-21 09:00:00');

    // Simulate: append a NEW batch (process about to ingest it), then CRASH
    // before markConfirmed ever runs — `ledger` here is what gets saved/reloaded.
    ledger = appendBatch(ledger, { batchId: 'crashed-2', watermark: '2026-07-21 09:30:00', urlIds: [2, 3] });

    // On restart, `since` is derived from getLastWatermark — it must still
    // point at the LAST CONFIRMED batch, not the crashed one, so a re-pull
    // of the 09:00-09:30 window (including the crashed batch's URLs) happens.
    expect(getLastWatermark(ledger)).toBe('2026-07-21 09:00:00');
    expect(findUnconfirmed(ledger).map((e) => e.batchId)).toEqual(['crashed-2']);
  });

  test('multiple confirms advance monotonically (never regress on an out-of-order confirm)', () => {
    let ledger = emptyLedger();
    ledger = appendBatch(ledger, { batchId: 'a', watermark: '2026-07-21 10:00:00', urlIds: [1] });
    ledger = appendBatch(ledger, { batchId: 'b', watermark: '2026-07-21 09:00:00', urlIds: [2] }); // earlier watermark
    ledger = markConfirmed(ledger, 'a');
    expect(getLastWatermark(ledger)).toBe('2026-07-21 10:00:00');
    ledger = markConfirmed(ledger, 'b'); // confirming an EARLIER-watermark batch after a later one
    expect(getLastWatermark(ledger)).toBe('2026-07-21 10:00:00'); // does not regress
  });

  test('markPruned does not affect the watermark (unrelated concern)', () => {
    let ledger = emptyLedger();
    ledger = appendBatch(ledger, { batchId: 'a', watermark: '2026-07-21 10:00:00', urlIds: [1] });
    ledger = markConfirmed(ledger, 'a');
    ledger = markPruned(ledger, 'a', { deleted: { urls: 1 } });
    expect(getLastWatermark(ledger)).toBe('2026-07-21 10:00:00');
  });
});

describe('sync-ledger: corrupt-file quarantine + halt (D3d)', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-ledger-test-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  test('a MISSING ledger file returns a fresh empty ledger (safe, not an error)', () => {
    const filePath = path.join(dir, 'ledger.json');
    const ledger = loadLedger(filePath);
    expect(ledger).toEqual(emptyLedger());
  });

  test('a valid ledger file round-trips through save/load', () => {
    const filePath = path.join(dir, 'ledger.json');
    let ledger = emptyLedger();
    ledger = appendBatch(ledger, { batchId: 'a', watermark: '2026-07-21 10:00:00', urlIds: [1] });
    ledger = markConfirmed(ledger, 'a');
    saveLedger(filePath, ledger);
    const reloaded = loadLedger(filePath);
    expect(getLastWatermark(reloaded)).toBe('2026-07-21 10:00:00');
  });

  test('an UNPARSEABLE (corrupt) ledger file THROWS LedgerCorruptError and quarantines the file — never silently resets', () => {
    const filePath = path.join(dir, 'ledger.json');
    fs.writeFileSync(filePath, '{ this is not valid json !!!');

    expect(() => loadLedger(filePath)).toThrow(LedgerCorruptError);
    // The original bad file is GONE (quarantined, not left in place to re-trip on retry)...
    expect(fs.existsSync(filePath)).toBe(false);
    // ...and a quarantined copy exists somewhere alongside it, content preserved.
    const siblings = fs.readdirSync(dir);
    const quarantined = siblings.find((f) => f.startsWith('ledger.json.corrupt-'));
    expect(quarantined).toBeDefined();
    expect(fs.readFileSync(path.join(dir, quarantined), 'utf8')).toBe('{ this is not valid json !!!');
  });

  test('an old flat-watermark file (recognizable shape, not corruption) still forward-migrates without throwing', () => {
    const filePath = path.join(dir, 'ledger.json');
    fs.writeFileSync(filePath, JSON.stringify({ lastWatermark: '2026-07-20 08:00:00', totalPulled: 42 }));
    const ledger = loadLedger(filePath);
    expect(getLastWatermark(ledger)).toBe('2026-07-20 08:00:00');
    expect(ledger.totalPulled).toBe(42);
  });
});
