/**
 * Electron Tray Progress Lab - Demo Application
 * 
 * Demonstrates the TrayProgressManager with simulated progress.
 * 
 * Usage:
 *   npx electron labs/electron-tray-progress/main.js
 *   npx electron labs/electron-tray-progress/main.js --demo
 *   npx electron labs/electron-tray-progress/main.js --smoke
 */
'use strict';

const { app, dialog } = require('electron');
const { TrayProgressManager } = require('./TrayProgressManager');

// Parse command line args
function hasArg(flag) {
  return process.argv.includes(flag);
}

const runDemo = hasArg('--demo') || !hasArg('--smoke');
const runSmoke = hasArg('--smoke');
const smokeTimeoutMs = 5000;

let trayManager = null;
let demoInterval = null;

app.whenReady().then(async () => {
  console.log('[tray-progress-demo] Starting...');

  // Create tray manager
  trayManager = new TrayProgressManager({
    title: 'Demo Process',
    showOnStart: true
  });

  await trayManager.init();
  console.log('[tray-progress-demo] Tray initialized');

  // Handle events from tray
  trayManager.on('pause', () => {
    console.log('[tray-progress-demo] Pause requested');
    stopDemo();
    trayManager.updateProgress({ phase: 'paused' });
  });

  trayManager.on('resume', () => {
    console.log('[tray-progress-demo] Resume requested');
    if (runDemo) startDemo(trayManager.getState());
  });

  trayManager.on('stop', () => {
    console.log('[tray-progress-demo] Stop requested');
    stopDemo();
    trayManager.updateProgress({ phase: 'idle', processed: 0, total: 0 });
  });

  trayManager.on('showDetails', () => {
    console.log('[tray-progress-demo] Show details requested');
    dialog.showMessageBox({
      type: 'info',
      title: 'Details',
      message: 'This would open the full dashboard window.',
      detail: `Current state: ${JSON.stringify(trayManager.getState(), null, 2)}`
    });
  });

  trayManager.on('quit', () => {
    console.log('[tray-progress-demo] Quit requested');
    cleanup();
    app.quit();
  });

  // Smoke test mode
  if (runSmoke) {
    console.log('[tray-progress-demo] Smoke test mode - exiting in 5s');
    setTimeout(() => {
      cleanup();
      app.exit(0);
    }, smokeTimeoutMs);
    return;
  }

  // Demo mode
  if (runDemo) {
    startDemo();
  }
});

/**
 * Start the demo simulation
 */
function startDemo(resumeState = null) {
  if (demoInterval) return;

  const total = resumeState?.total || 500;
  let processed = resumeState?.processed || 0;
  const startTime = Date.now() - (resumeState?.elapsedMs || 0);
  let lastProcessed = processed;
  let lastTime = Date.now();

  trayManager.updateProgress({
    phase: 'running',
    processed,
    total,
    recordsPerSecond: 0,
    elapsedMs: 0,
    etaMs: null,
    currentItem: 'Starting...'
  });

  const items = [
    'London, United Kingdom',
    'Paris, France',
    'New York City, USA',
    'Tokyo, Japan',
    'Sydney, Australia',
    'Berlin, Germany',
    'Moscow, Russia',
    'Beijing, China',
    'Mumbai, India',
    'São Paulo, Brazil'
  ];

  demoInterval = setInterval(() => {
    if (processed >= total) {
      stopDemo();
      trayManager.updateProgress({
        phase: 'complete',
        processed: total,
        total,
        recordsPerSecond: 0,
        etaMs: 0,
        currentItem: 'Done!'
      });
      return;
    }

    // Simulate variable progress
    const increment = Math.floor(Math.random() * 5) + 1;
    processed = Math.min(processed + increment, total);

    // Calculate rates
    const now = Date.now();
    const elapsedMs = now - startTime;
    
    let recordsPerSecond = 0;
    const timeDelta = (now - lastTime) / 1000;
    if (timeDelta >= 0.5) {
      recordsPerSecond = (processed - lastProcessed) / timeDelta;
      lastProcessed = processed;
      lastTime = now;
    }

    // Calculate ETA
    let etaMs = null;
    if (recordsPerSecond > 0) {
      const remaining = total - processed;
      etaMs = (remaining / recordsPerSecond) * 1000;
    }

    // Random current item
    const currentItem = items[processed % items.length];

    // Occasional warning
    const warnings = Math.random() < 0.05 
      ? [{ type: 'slow', message: 'Slow disambiguation for complex place name' }]
      : null;

    trayManager.updateProgress({
      phase: 'running',
      processed,
      total,
      recordsPerSecond,
      elapsedMs,
      etaMs,
      currentItem: `Disambiguating: ${currentItem}`,
      warnings
    });
  }, 100);
}

/**
 * Stop the demo simulation
 */
function stopDemo() {
  if (demoInterval) {
    clearInterval(demoInterval);
    demoInterval = null;
  }
}

/**
 * Cleanup before exit
 */
function cleanup() {
  stopDemo();
  if (trayManager) {
    trayManager.destroy();
    trayManager = null;
  }
}

// Handle app lifecycle
app.on('before-quit', cleanup);

app.on('window-all-closed', () => {
  // Keep running in tray when all windows are closed
  // Only quit on macOS when explicitly requested
});

app.on('activate', () => {
  // On macOS, clicking dock icon should show popup
  if (trayManager) {
    trayManager.showPopup();
  }
});

process.on('SIGINT', () => {
  cleanup();
  app.quit();
});
