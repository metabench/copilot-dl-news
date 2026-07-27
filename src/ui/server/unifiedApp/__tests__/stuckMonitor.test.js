'use strict';

const { createStuckMonitor } = require('../stuckMonitor');

// A controllable clock + a mutable fake registry so the guard is deterministic.
function harness() {
  let clock = 0;
  const jobs = {};
  const getJob = (id) => {
    const j = jobs[id];
    if (!j) return null;
    return { status: j.status, bytesTotal: j.bytes, progress: { downloaded: j.dl } };
  };
  return {
    at(t) { clock = t; },
    set(id, patch) { jobs[id] = { status: 'running', bytes: 0, dl: 0, ...(jobs[id] || {}), ...patch }; },
    mon(ids, opts = {}) {
      return createStuckMonitor(ids, getJob, { stuckSilenceMs: 40000, refreshThrottleMs: 0, now: () => clock, ...opts });
    }
  };
}

describe('createStuckMonitor — guarded stuck-host trigger', () => {
  it('ABORTS a host frozen past the window while an ACTIVE sibling keeps advancing', () => {
    const h = harness();
    h.set('A', { bytes: 100, dl: 2 });
    h.set('B', { bytes: 100, dl: 2 });
    const m = h.mon(['A', 'B']);
    h.at(1000); m.refresh(true);                 // both anchored at t=1000
    h.at(2000); h.set('B', { bytes: 200, dl: 5 }); m.refresh(true);   // B advances, A frozen
    h.at(42001); h.set('B', { bytes: 500, dl: 9 });                    // A frozen 41s; B just advanced
    expect(m.isStuck('A', 10)).toBe(true);       // host-specific stall → abort
    expect(m.isStuck('B', 10)).toBe(false);      // B is the one advancing
  });

  it('ABORTS NOBODY when ALL hosts are frozen together (orchestration-idle — the false-abort guard)', () => {
    const h = harness();
    h.set('A', { bytes: 100, dl: 2 });
    h.set('B', { bytes: 100, dl: 2 });
    const m = h.mon(['A', 'B']);
    h.at(1000); m.refresh(true);                 // both anchored
    h.at(42001);                                 // NEITHER advances (whole-process silence)
    expect(m.isStuck('A', 10)).toBe(false);
    expect(m.isStuck('B', 10)).toBe(false);
  });

  it('a FINISHED sibling does NOT justify aborting the last frozen host', () => {
    const h = harness();
    h.set('A', { bytes: 100, dl: 2 });
    h.set('B', { bytes: 100, dl: 2 });
    const m = h.mon(['A', 'B']);
    h.at(1000); m.refresh(true);
    h.at(2000); h.set('B', { bytes: 300, dl: 6, status: 'completed' }); m.refresh(true); // B done
    h.at(42001);
    expect(m.isStuck('A', 10)).toBe(false);      // only sibling is done → not host-specific
  });

  it('does NOT abort a host that is still advancing', () => {
    const h = harness();
    h.set('A', { bytes: 100, dl: 2 });
    h.set('B', { bytes: 100, dl: 2 });
    const m = h.mon(['A', 'B']);
    h.at(1000); m.refresh(true);
    h.at(42001); h.set('A', { bytes: 999, dl: 8 }); h.set('B', { bytes: 999, dl: 8 });
    expect(m.isStuck('A', 10)).toBe(false);
  });

  it('does NOT abort a host that has already downloaded all its leased rows', () => {
    const h = harness();
    h.set('A', { bytes: 100, dl: 10 });          // dl == toFetchLen
    h.set('B', { bytes: 100, dl: 2 });
    const m = h.mon(['A', 'B']);
    h.at(1000); m.refresh(true);
    h.at(2000); h.set('B', { bytes: 400, dl: 6 }); m.refresh(true);
    h.at(42001); h.set('B', { bytes: 700, dl: 9 });
    expect(m.isStuck('A', 10)).toBe(false);      // no un-fetched rows held
  });

  it('a LONE-host batch never trips the sibling guard (falls through to the absolute cap)', () => {
    const h = harness();
    h.set('A', { bytes: 100, dl: 2 });
    const m = h.mon(['A']);
    h.at(1000); m.refresh(true);
    h.at(42001);
    expect(m.isStuck('A', 10)).toBe(false);
  });

  it('does NOT abort a host frozen for LESS than the window', () => {
    const h = harness();
    h.set('A', { bytes: 100, dl: 2 });
    h.set('B', { bytes: 100, dl: 2 });
    const m = h.mon(['A', 'B']);
    h.at(1000); m.refresh(true);
    h.at(2000); h.set('B', { bytes: 300, dl: 6 }); m.refresh(true);
    h.at(31000); h.set('B', { bytes: 500, dl: 9 });   // A frozen only 30s (< 40s)
    expect(m.isStuck('A', 10)).toBe(false);
  });
});
