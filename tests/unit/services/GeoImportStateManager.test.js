'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { GeoImportStateManager } = require('../../../src/services/GeoImportStateManager');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'geo-import-state-manager-'));
}

describe('GeoImportStateManager', () => {
  it('extracts stop/pause/resume controls from an observable instance', () => {
    const tmpDir = createTempDir();
    const manager = new GeoImportStateManager({ db: {}, dataDir: tmpDir });

    const stop = jest.fn();
    const pause = jest.fn();
    const resume = jest.fn();

    const controls = manager._extractControlsFromObservable({ stop, pause, resume });
    expect(controls).toEqual([stop, pause, resume]);
  });

  it('pauses and resumes back to the prior stage', () => {
    const tmpDir = createTempDir();
    const manager = new GeoImportStateManager({ db: {}, dataDir: tmpDir });

    const stop = jest.fn();
    const pause = jest.fn();
    const resume = jest.fn();

    manager._controls = [stop, pause, resume];
    manager._state.status = 'importing';

    manager.pause();

    expect(pause).toHaveBeenCalledTimes(1);
    expect(manager.getState().status).toBe('paused');
    expect(manager.getState().pausedFrom).toBe('importing');

    manager.resume();

    expect(resume).toHaveBeenCalledTimes(1);
    expect(manager.getState().status).toBe('importing');
    expect(manager.getState().pausedFrom).toBe(null);
  });

  it('marks stall as stale after threshold and clears when progress resumes', () => {
    jest.useFakeTimers({ now: new Date('2025-01-01T00:00:00Z') });

    const tmpDir = createTempDir();
    const manager = new GeoImportStateManager({
      db: {},
      dataDir: tmpDir,
      stallThresholdMs: 50,
      stallPollMs: 10
    });

    manager._state.status = 'importing';

    const stallEvents = [];
    manager.on('stall', (event) => stallEvents.push(event));

    manager._startStallTimer();

    // Force staleness.
    manager._lastProgressAt = Date.now() - 100;
    jest.advanceTimersByTime(20);

    expect(manager.getState().stall.stale).toBe(true);
    expect(stallEvents.some(e => e.data && e.data.stale === true)).toBe(true);

    // Force progress to resume.
    manager._lastProgressAt = Date.now();
    jest.advanceTimersByTime(20);

    expect(manager.getState().stall.stale).toBe(false);
    expect(stallEvents.some(e => e.data && e.data.stale === false)).toBe(true);

    manager._stopStallTimer();
    jest.useRealTimers();
  });
});
