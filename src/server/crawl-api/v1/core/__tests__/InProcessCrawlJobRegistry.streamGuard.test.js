'use strict';

const { PassThrough } = require('stream');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { InProcessCrawlJobRegistry } = require('../InProcessCrawlJobRegistry');

/**
 * Regression: a per-job log WriteStream (and the worker stdout/stderr piped into
 * it) must NEVER crash the server child. A Node stream that emits 'error' with no
 * listener re-throws it as an uncaught exception (task #41: EPIPE/disk-full/
 * write-after-end on the job log → server child down, which the supervisor then
 * has to respawn — prevention beats recovery). _guardStreamErrors attaches a
 * best-effort listener so the failure degrades logging instead of being fatal.
 */
describe('InProcessCrawlJobRegistry stream error guard', () => {
  it('makes an emitted stream error non-fatal (no uncaught throw)', () => {
    const registry = new InProcessCrawlJobRegistry({ workerMode: false });
    const s = new PassThrough();
    const count = registry._guardStreamErrors([s], 'job=test-1');
    expect(count).toBe(1);
    // Without the guard this emit would throw (unhandled 'error'); with it, it must not.
    expect(() => s.emit('error', new Error('ENOSPC: no space left on device, write'))).not.toThrow();
  });

  it('guards multiple streams and tolerates null/undefined entries', () => {
    const registry = new InProcessCrawlJobRegistry({ workerMode: false });
    const a = new PassThrough();
    const b = new PassThrough();
    // Mirrors the real call: [logStream, child.stdout, child.stderr] where stdio may be null.
    const count = registry._guardStreamErrors([a, null, b, undefined], 'job=test-2');
    expect(count).toBe(2);
    expect(() => { a.emit('error', new Error('EPIPE')); b.emit('error', new Error('EACCES')); }).not.toThrow();
  });

  it('survives repeated errors on the same stream (degraded, never fatal)', () => {
    const registry = new InProcessCrawlJobRegistry({ workerMode: false });
    const s = new PassThrough();
    registry._guardStreamErrors(s, 'job=test-3'); // also accepts a single stream, not just an array
    expect(() => {
      for (let i = 0; i < 5; i++) s.emit('error', new Error(`write after end #${i}`));
    }).not.toThrow();
  });

  it('a real fs WriteStream to an unwritable path degrades instead of crashing', (done) => {
    const registry = new InProcessCrawlJobRegistry({ workerMode: false });
    // Opening a write stream on a path whose parent is a FILE (not a dir) fails
    // asynchronously with an 'error' event — exactly the unlistened-error shape.
    const tmpFile = path.join(os.tmpdir(), `sg-${process.pid}-${Date.now()}.tmp`);
    fs.writeFileSync(tmpFile, 'x');
    const badPath = path.join(tmpFile, 'cannot', 'exist.log'); // parent is a file
    const ws = fs.createWriteStream(badPath, { flags: 'a' });
    registry._guardStreamErrors([ws], 'job=test-4');
    // The async 'error' must be caught by the guard, not thrown uncaught.
    ws.on('error', () => {
      // (the guard's own listener already ran; this second listener just lets the
      // test observe the event and confirm the process is still alive)
      try { fs.unlinkSync(tmpFile); } catch (_) {}
      done();
    });
    ws.write('trigger\n');
  });
});
