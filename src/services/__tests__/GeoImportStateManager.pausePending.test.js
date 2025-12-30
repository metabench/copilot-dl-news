'use strict';

const { GeoImportStateManager } = require('../GeoImportStateManager');

function createManager() {
  // Use a non-existent dataDir; tests here never call startImport.
  return new GeoImportStateManager({ db: {}, dataDir: 'tmp/__does_not_exist__' });
}

describe('GeoImportStateManager pause/resume', () => {
  test('pause sets pausePending when controls missing, then auto-applies once controls are available', () => {
    const manager = createManager();

    // Simulate a running stage.
    manager._state.status = 'importing';

    // Simulate an observable that initially has no controls.
    manager._import$ = {};
    manager._controls = null;

    manager.pause();

    const afterPauseRequest = manager.getState();
    expect(afterPauseRequest.status).toBe('importing');
    expect(afterPauseRequest.pausePending).toBe(true);

    // Now simulate controls becoming available later.
    let pausedCalled = 0;
    manager._import$ = {
      pause: () => {
        pausedCalled += 1;
      }
    };

    // Trigger control discovery.
    manager._ensureControls();

    const afterControls = manager.getState();
    expect(pausedCalled).toBe(1);
    expect(afterControls.pausePending).toBe(false);
    expect(afterControls.status).toBe('paused');
  });
});
