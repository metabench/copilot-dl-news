'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { readAll, effective, pending, raise, ack } = require('../signals');

describe('signals (the big-lightbulb queue)', () => {
  let dir, queue;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-signals-'));
    queue = path.join(dir, 'queue.jsonl');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('raise appends a pending record with a stable id shape', () => {
    const rec = raise('TECH-TREEREVIEW', 'review the tree', queue);
    expect(rec.status).toBe('pending');
    expect(rec.id).toMatch(/^sig-\d{14}-TECH-TREEREVIEW$/);
    expect(pending(queue).map((s) => s.id)).toEqual([rec.id]);
  });

  it('ack appends a superseding done record — append-only, click and answer both on file', () => {
    const rec = raise('TECH-TREEREVIEW', 'review', queue);
    ack(rec.id, 'review done in cycle 140', queue);
    expect(pending(queue)).toEqual([]);
    const eff = effective(queue).find((s) => s.id === rec.id);
    expect(eff.status).toBe('done');
    expect(eff.ackNote).toBe('review done in cycle 140');
    expect(eff.requested).toBe('review'); // original fields survive the merge
    expect(readAll(queue)).toHaveLength(2); // nothing rewritten
  });

  it('ack refuses an unknown id and a double-ack', () => {
    expect(() => ack('sig-nope', 'x', queue)).toThrow(/no signal/);
    const rec = raise('T', 'r', queue);
    ack(rec.id, 'done', queue);
    expect(() => ack(rec.id, 'again', queue)).toThrow(/already done/);
  });

  it('a missing queue file means no signals, and a torn line is skipped, not fatal', () => {
    expect(pending(queue)).toEqual([]);
    fs.writeFileSync(queue, '{"id":"sig-1","tech":"T","status":"pending"}\n{broken json\n');
    expect(pending(queue).map((s) => s.id)).toEqual(['sig-1']);
  });

  it('truncates a runaway requested note (the queue is a signal, not a document)', () => {
    const rec = raise('T', 'x'.repeat(1000), queue);
    expect(rec.requested).toHaveLength(300);
  });
});
